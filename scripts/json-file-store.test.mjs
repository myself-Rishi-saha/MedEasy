import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { JsonFileStore, JsonStoreError } from '../lib/storage/json-file-store.mjs'

async function fixture(seed = [{ id: 'one' }]) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'med-easy-json-store-'))
  const runtimeDir = path.join(root, 'runtime')
  const seedDir = path.join(root, 'seeds')
  await mkdir(seedDir, { recursive: true })
  await writeFile(path.join(seedDir, 'records.json'), JSON.stringify(seed))
  const validate = (_collection, value) => {
    if (!Array.isArray(value) || value.some((entry) => typeof entry?.id !== 'string')) throw new Error('Invalid records')
    return value
  }
  return { root, runtimeDir, seedDir, store: new JsonFileStore({ runtimeDir, seedDir, collections: ['records'], validate }) }
}

test('initializes runtime once from validated seed and never overwrites later changes', async () => {
  const data = await fixture()
  try {
    assert.deepEqual(await data.store.read('records'), [{ id: 'one' }])
    await data.store.update('records', (records) => [...records, { id: 'two' }])
    await writeFile(path.join(data.seedDir, 'records.json'), JSON.stringify([{ id: 'new-seed' }]))
    assert.deepEqual(await data.store.read('records'), [{ id: 'one' }, { id: 'two' }])
  } finally {
    await rm(data.root, { recursive: true, force: true })
  }
})

test('serializes concurrent writes to one collection', async () => {
  const data = await fixture([])
  try {
    await Promise.all(Array.from({ length: 40 }, (_, index) => data.store.update('records', (records) => [...records, { id: `item-${index}` }])))
    const records = await data.store.read('records')
    assert.equal(records.length, 40)
    assert.equal(new Set(records.map((record) => record.id)).size, 40)
  } finally {
    await rm(data.root, { recursive: true, force: true })
  }
})

test('rejects malformed persisted JSON without exposing file contents', async () => {
  const data = await fixture()
  try {
    await data.store.read('records')
    await writeFile(path.join(data.runtimeDir, 'records.json'), '{broken')
    await assert.rejects(data.store.read('records'), (error) => error instanceof JsonStoreError && error.code === 'STORAGE_INVALID_JSON')
  } finally {
    await rm(data.root, { recursive: true, force: true })
  }
})

test('rejects invalid stored records and unknown paths', async () => {
  const data = await fixture()
  try {
    await data.store.read('records')
    await writeFile(path.join(data.runtimeDir, 'records.json'), JSON.stringify([{ id: 2 }]))
    await assert.rejects(data.store.read('records'), (error) => error instanceof JsonStoreError && error.code === 'RUNTIME_VALIDATION_FAILED')
    await assert.rejects(data.store.read('../secrets'), (error) => error instanceof JsonStoreError && error.code === 'INVALID_COLLECTION')
  } finally {
    await rm(data.root, { recursive: true, force: true })
  }
})

test('reset is an explicit operation that restores seed contents', async () => {
  const data = await fixture()
  try {
    await data.store.update('records', () => [{ id: 'runtime-only' }])
    await data.store.resetToSeeds()
    assert.deepEqual(await data.store.read('records'), [{ id: 'one' }])
  } finally {
    await rm(data.root, { recursive: true, force: true })
  }
})
