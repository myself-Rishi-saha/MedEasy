import { jsonStore } from '@/lib/storage/json-store'
import type { EntityRepository } from './types'

export class RepositoryRecordNotFoundError extends Error {
  constructor() {
    super('Record not found')
    this.name = 'RepositoryRecordNotFoundError'
  }
}

export class RepositoryConflictError extends Error {
  constructor() {
    super('Record already exists')
    this.name = 'RepositoryConflictError'
  }
}

export class JsonRepository<T extends { id: string; status?: string }> implements EntityRepository<T> {
  constructor(private readonly collection: string) {}

  async list() {
    return jsonStore.read<T[]>(this.collection)
  }

  async findById(id: string) {
    const records = await this.list()
    return records.find((record) => record.id === id) ?? null
  }

  async create(record: T) {
    await jsonStore.update<T[]>(this.collection, (records) => {
      if (records.some((existing) => existing.id === record.id)) throw new RepositoryConflictError()
      return [...records, record]
    })
    return record
  }

  async update(id: string, changes: Partial<T>) {
    let updated: T | undefined
    await jsonStore.update<T[]>(this.collection, (records) => records.map((record) => {
      if (record.id !== id) return record
      updated = { ...record, ...changes, id: record.id, updatedAt: new Date().toISOString() } as T
      return updated
    }))
    if (!updated) throw new RepositoryRecordNotFoundError()
    return updated
  }

  async deactivate(id: string) {
    const existing = await this.findById(id)
    if (!existing) throw new RepositoryRecordNotFoundError()
    if (!('status' in existing)) throw new Error('This entity cannot be deactivated')
    return this.update(id, { status: 'inactive' } as Partial<T>)
  }
}

export class JsonSingletonRepository<T extends object> {
  constructor(private readonly collection: string) {}

  get() {
    return jsonStore.read<T>(this.collection)
  }

  update(changes: Partial<T>) {
    return jsonStore.update<T>(this.collection, (current) => ({ ...current, ...changes, updatedAt: new Date().toISOString() }))
  }
}
