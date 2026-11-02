import { createHash } from 'node:crypto'

const movementFields = ['id', 'movementType', 'sourceId', 'batchId', 'medicineId', 'quantityDelta', 'occurredAt', 'createdAt', 'updatedAt']

export class StockAdjustmentServiceError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'StockAdjustmentServiceError'
    this.status = status
    this.code = code
  }
}

function publicAdjustment(adjustment) {
  const { idempotencyKey, requestHash, resultMovements, ...visible } = adjustment
  return visible
}

function sameMovement(left, right) {
  return movementFields.every((field) => left[field] === right[field])
}

function appendExpectedMovements(current, expected) {
  const byId = new Map(current.map((movement) => [movement.id, movement]))
  const missing = []
  for (const movement of expected) {
    const existing = byId.get(movement.id)
    if (existing && !sameMovement(existing, movement)) {
      throw new StockAdjustmentServiceError(500, 'INTERNAL_ERROR', 'Stored stock movement does not match its adjustment record')
    }
    if (!existing) {
      missing.push(movement)
      byId.set(movement.id, movement)
    }
  }
  return [...current, ...missing]
}

function requestHash(userId, body) {
  const request = {
    userId,
    reason: body.reason,
    adjustedOn: body.adjustedOn ?? null,
    lines: body.lines.map(({ batchId, quantityDelta }) => ({ batchId, quantityDelta })),
  }
  return createHash('sha256').update(JSON.stringify(request)).digest('hex')
}

async function recoverPendingMovements(store, adjustments) {
  const expected = adjustments.flatMap((adjustment) =>
    adjustment.idempotencyKey && Array.isArray(adjustment.resultMovements) ? adjustment.resultMovements : [],
  )
  if (expected.length === 0) return await store.read('stock-movements')
  const current = await store.read('stock-movements')
  const recovered = appendExpectedMovements(current, expected)
  if (recovered.length === current.length) return current
  return await store.update('stock-movements', (latest) => appendExpectedMovements(latest, expected))
}

export function toPublicStockAdjustment(adjustment) {
  return publicAdjustment(adjustment)
}

export function createStockAdjustmentService({ store, getBatchQuantityOnHand, applyStockAdjustment, generateId, clock = () => new Date() }) {
  let mutationQueue = Promise.resolve()

  async function withMutationLock(operation) {
    const previous = mutationQueue
    let release
    mutationQueue = new Promise((resolve) => { release = resolve })
    await previous
    try {
      return await operation()
    } finally {
      release()
    }
  }

  return async function createStockAdjustment({ body, user, idempotencyKey }) {
    return withMutationLock(async () => {
      if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{1,200}$/.test(idempotencyKey)) {
        throw new StockAdjustmentServiceError(400, 'INVALID_REQUEST', 'A valid Idempotency-Key header is required')
      }

      const fingerprint = requestHash(user.id, body)
      const adjustments = await store.read('stock-adjustments')
      const movements = await recoverPendingMovements(store, adjustments)
      const existing = adjustments.find((adjustment) => adjustment.idempotencyKey === idempotencyKey)
      if (existing) {
        if (existing.requestHash !== fingerprint) {
          throw new StockAdjustmentServiceError(409, 'CONFLICT', 'This idempotency key was already used for a different adjustment request')
        }
        if (!Array.isArray(existing.resultMovements)) {
          throw new StockAdjustmentServiceError(500, 'INTERNAL_ERROR', 'The stored adjustment result is incomplete')
        }
        return { adjustment: publicAdjustment(existing), movements: existing.resultMovements }
      }

      const batches = await store.read('batches')
      const lines = body.lines.map((line) => {
        const batch = batches.find((entry) => entry.id === line.batchId)
        if (!batch) throw new StockAdjustmentServiceError(404, 'NOT_FOUND', 'Batch not found')
        const currentQuantity = getBatchQuantityOnHand(batch, movements)
        applyStockAdjustment(currentQuantity, line.quantityDelta)
        return { batchId: batch.id, medicineId: batch.medicineId, quantityDelta: line.quantityDelta, reason: body.reason }
      })
      const timestamp = clock().toISOString()
      const adjustedOn = body.adjustedOn ?? timestamp.slice(0, 10)
      const adjustmentId = generateId('adj')
      const newMovements = lines.map((line) => ({
        id: generateId('mov'), movementType: 'adjustment', sourceId: adjustmentId, batchId: line.batchId,
        medicineId: line.medicineId, quantityDelta: line.quantityDelta, occurredAt: timestamp,
        createdAt: timestamp, updatedAt: timestamp,
      }))
      const adjustment = {
        id: adjustmentId,
        adjustmentNumber: `ADJ-${timestamp.replace(/\D/g, '').slice(0, 14)}-${adjustmentId.slice(-6)}`,
        status: 'completed', reason: body.reason, createdByUserId: user.id, adjustedOn, lines,
        createdAt: timestamp, updatedAt: timestamp, idempotencyKey, requestHash: fingerprint,
        resultMovements: newMovements,
      }

      await store.update('stock-adjustments', (current) => {
        const keyCollision = current.find((entry) => entry.idempotencyKey === idempotencyKey)
        if (keyCollision) throw new StockAdjustmentServiceError(409, 'CONFLICT', 'This idempotency key was already used')
        return [...current, adjustment]
      })
      try {
        await store.update('stock-movements', (current) => appendExpectedMovements(current, newMovements))
      } catch (error) {
        await store.update('stock-adjustments', (current) => current.filter((entry) => entry.id !== adjustment.id)).catch(() => undefined)
        throw error
      }
      return { adjustment: publicAdjustment(adjustment), movements: newMovements }
    })
  }
}
