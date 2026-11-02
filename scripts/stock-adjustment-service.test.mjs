import assert from 'node:assert/strict'
import test from 'node:test'
import { createStockAdjustmentService, StockAdjustmentServiceError } from '../lib/services/stock-adjustment-service.mjs'

function createStore({ failMovementWriteOn = [], failAdjustmentWriteOn = [] } = {}) {
  const data = new Map([
    ['stock-adjustments', []],
    ['stock-movements', []],
    ['batches', [{ id: 'bat_001', medicineId: 'med_001', openingQuantity: 5 }]],
  ])
  let movementWriteCount = 0
  let adjustmentWriteCount = 0
  return {
    async read(collection) {
      return structuredClone(data.get(collection) ?? [])
    },
    async update(collection, updater) {
      const next = await updater(structuredClone(data.get(collection) ?? []))
      if (collection === 'stock-movements' && failMovementWriteOn.includes(++movementWriteCount)) {
        throw new Error('simulated movement write failure')
      }
      if (collection === 'stock-adjustments' && failAdjustmentWriteOn.includes(++adjustmentWriteCount)) {
        throw new Error('simulated adjustment rollback failure')
      }
      data.set(collection, structuredClone(next))
      return structuredClone(next)
    },
    snapshot: () => structuredClone(Object.fromEntries(data)),
  }
}

function createHarness(options) {
  const store = createStore(options)
  let nextId = 0
  const service = createStockAdjustmentService({
    store,
    generateId: (prefix) => `${prefix}_${String(++nextId).padStart(6, '0')}`,
    clock: () => new Date('2026-10-31T12:00:00.000Z'),
    getBatchQuantityOnHand: (batch, movements) => movements.reduce((quantity, movement) => movement.batchId === batch.id ? quantity + movement.quantityDelta : quantity, batch.openingQuantity),
    applyStockAdjustment: (current, delta) => {
      if (!Number.isSafeInteger(delta) || delta === 0) throw new Error('invalid delta')
      if (current + delta < 0) throw new Error('negative stock')
      return current + delta
    },
  })
  return { store, service }
}

const user = { id: 'usr_001' }
const body = { reason: 'Count correction', adjustedOn: '2026-10-31', lines: [{ batchId: 'bat_001', quantityDelta: 2 }] }
const idempotencyKey = 'api-test-idempotency-key'

test('concurrent same-key requests return one persisted result and one movement', async () => {
  const { service, store } = createHarness()
  const input = { body, user, idempotencyKey }
  const [first, second] = await Promise.all([service(input), service(input)])
  assert.equal(first.adjustment.id, second.adjustment.id)
  assert.deepEqual(first.movements, second.movements)
  const state = store.snapshot()
  assert.equal(state['stock-adjustments'].length, 1)
  assert.equal(state['stock-movements'].length, 1)
  assert.equal(state['stock-adjustments'][0].idempotencyKey, idempotencyKey)
  assert.equal(state['stock-adjustments'][0].resultMovements.length, 1)
  assert.equal(state['stock-movements'][0].quantityDelta, 2)
})

test('rejects reuse of a key with a changed payload', async () => {
  const { service, store } = createHarness()
  await service({ body, user, idempotencyKey })
  await assert.rejects(
    service({ body: { ...body, lines: [{ batchId: 'bat_001', quantityDelta: 3 }] }, user, idempotencyKey }),
    (error) => error instanceof StockAdjustmentServiceError && error.status === 409,
  )
  assert.equal(store.snapshot()['stock-movements'].length, 1)
})

test('rolls back the adjustment record when movement persistence fails', async () => {
  const { service, store } = createHarness({ failMovementWriteOn: [1] })
  await assert.rejects(service({ body, user, idempotencyKey }))
  const state = store.snapshot()
  assert.equal(state['stock-adjustments'].length, 0)
  assert.equal(state['stock-movements'].length, 0)
})

test('recovers a persisted idempotency result after rollback failure', async () => {
  const { service, store } = createHarness({ failMovementWriteOn: [1], failAdjustmentWriteOn: [2] })
  await assert.rejects(service({ body, user, idempotencyKey }))
  const journaled = store.snapshot()['stock-adjustments'][0]
  assert.ok(journaled)
  assert.equal(store.snapshot()['stock-movements'].length, 0)

  const recovered = await service({ body, user, idempotencyKey })
  const state = store.snapshot()
  assert.equal(recovered.adjustment.id, journaled.id)
  assert.equal(state['stock-adjustments'].length, 1)
  assert.equal(state['stock-movements'].length, 1)
  assert.equal(state['stock-movements'][0].sourceId, journaled.id)
  assert.deepEqual(state['stock-movements'][0], journaled.resultMovements[0])
})
