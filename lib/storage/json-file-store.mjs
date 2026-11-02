import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'

export class JsonStoreError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'JsonStoreError'
    this.code = code
  }
}

export class JsonFileStore {
  constructor({ runtimeDir, seedDir, collections, validate }) {
    this.runtimeDir = path.resolve(runtimeDir)
    this.seedDir = path.resolve(seedDir)
    this.collections = new Set(collections)
    this.validate = validate
    this.locks = new Map()
  }

  #collectionFile(directory, collection) {
    if (!this.collections.has(collection)) throw new JsonStoreError('INVALID_COLLECTION', 'Unknown data collection')
    const candidate = path.resolve(directory, `${collection}.json`)
    if (!candidate.startsWith(`${directory}${path.sep}`)) throw new JsonStoreError('INVALID_COLLECTION', 'Invalid data collection')
    return candidate
  }

  async #withLock(collection, operation) {
    const previous = this.locks.get(collection) ?? Promise.resolve()
    let release
    const current = new Promise((resolve) => { release = resolve })
    const queued = previous.then(() => current)
    this.locks.set(collection, queued)
    await previous
    try {
      return await operation()
    } finally {
      release()
      if (this.locks.get(collection) === queued) this.locks.delete(collection)
    }
  }

  async #atomicWrite(filePath, value) {
    await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 })
    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
    let handle
    try {
      handle = await open(temporaryPath, 'wx', 0o600)
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
      await handle.sync()
      await handle.close()
      handle = undefined
      await rename(temporaryPath, filePath)
    } catch (error) {
      await handle?.close().catch(() => undefined)
      await rm(temporaryPath, { force: true }).catch(() => undefined)
      throw new JsonStoreError('STORAGE_WRITE_FAILED', 'Could not persist runtime data')
    }
  }

  async #readJson(filePath, label) {
    let raw
    try {
      raw = await readFile(filePath, 'utf8')
    } catch {
      throw new JsonStoreError('STORAGE_READ_FAILED', `Could not read ${label} data`)
    }
    try {
      return JSON.parse(raw)
    } catch {
      throw new JsonStoreError('STORAGE_INVALID_JSON', `${label} data is not valid JSON`)
    }
  }

  async #readUnlocked(collection) {
    const runtimePath = this.#collectionFile(this.runtimeDir, collection)
    await mkdir(this.runtimeDir, { recursive: true, mode: 0o700 })
    try {
      await stat(runtimePath)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw new JsonStoreError('STORAGE_READ_FAILED', 'Could not inspect runtime data')
      const seedPath = this.#collectionFile(this.seedDir, collection)
      const seed = await this.#readJson(seedPath, 'Seed')
      let validSeed
      try {
        validSeed = this.validate(collection, seed)
      } catch {
        throw new JsonStoreError('SEED_VALIDATION_FAILED', 'Seed data failed validation')
      }
      await this.#atomicWrite(runtimePath, validSeed)
    }
    const stored = await this.#readJson(runtimePath, 'Runtime')
    try {
      return this.validate(collection, stored)
    } catch {
      throw new JsonStoreError('RUNTIME_VALIDATION_FAILED', 'Stored data failed validation')
    }
  }

  async read(collection) {
    return this.#withLock(collection, () => this.#readUnlocked(collection))
  }

  async update(collection, updater) {
    return this.updateMany([collection], async (current) => ({ [collection]: await updater(current[collection]) }))
      .then((result) => result[collection])
  }

  async updateMany(collections, updater) {
    const names = [...new Set(collections)].sort()
    if (names.length === 0) throw new JsonStoreError('INVALID_COLLECTION', 'At least one collection is required')
    const withLocks = async (index, operation) => index >= names.length
      ? operation()
      : this.#withLock(names[index], () => withLocks(index + 1, operation))

    return withLocks(0, async () => {
      const current = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await this.#readUnlocked(name)])))
      const next = await updater(structuredClone(current))
      const validated = {}
      try {
        for (const name of names) validated[name] = this.validate(name, next[name] ?? current[name])
      } catch {
        throw new JsonStoreError('RUNTIME_VALIDATION_FAILED', 'Updated data failed validation')
      }
      const written = []
      try {
        for (const name of names) {
          if (JSON.stringify(validated[name]) === JSON.stringify(current[name])) continue
          await this.#atomicWrite(this.#collectionFile(this.runtimeDir, name), validated[name])
          written.push(name)
        }
      } catch (error) {
        for (const name of written.reverse()) await this.#atomicWrite(this.#collectionFile(this.runtimeDir, name), current[name]).catch(() => undefined)
        throw error
      }
      return structuredClone(validated)
    })
  }

  async resetToSeeds() {
    const results = []
    for (const collection of this.collections) {
      results.push(await this.#withLock(collection, async () => {
        const seed = await this.#readJson(this.#collectionFile(this.seedDir, collection), 'Seed')
        let validSeed
        try {
          validSeed = this.validate(collection, seed)
        } catch {
          throw new JsonStoreError('SEED_VALIDATION_FAILED', 'Seed data failed validation')
        }
        await this.#atomicWrite(this.#collectionFile(this.runtimeDir, collection), validSeed)
        return collection
      }))
    }
    return results
  }
}
