import { ApiError } from '@/lib/api/responses'
import type { EntityRepository } from '@/lib/repositories/types'

export interface ListQuery {
  q?: string
  page?: number
  pageSize?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  filters?: Record<string, string>
}

export interface ListResult<T> {
  items: T[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

const sortableFields = new Set([
  'id', 'name', 'sku', 'genericName', 'status', 'createdAt', 'updatedAt', 'expiryDate', 'receivedOn', 'soldOn',
  'purchasedOn', 'issuedOn', 'validUntil', 'incurredOn', 'occurredOn', 'amountPaise', 'totalPaise', 'quantity', 'role',
  'medicineName', 'batchNumber', 'supplierName', 'expiryDate', 'quantityOnHand', 'stockValuePaise',
])
const searchableFields = ['name', 'sku', 'genericName', 'email', 'phone', 'invoiceNumber', 'quotationNumber', 'description', 'reference', 'medicineName', 'batchNumber', 'supplierName']

export async function listRecords<T extends Record<string, unknown>>(
  repository: Pick<EntityRepository<T & { id: string }>, 'list'>,
  query: ListQuery = {},
): Promise<ListResult<T>> {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 20
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Page must be positive and pageSize must be between 1 and 100')
  }
  const sortBy = query.sortBy ?? 'createdAt'
  if (!sortableFields.has(sortBy)) throw new ApiError(422, 'VALIDATION_ERROR', 'Unsupported sort field')
  const sortOrder = query.sortOrder ?? 'desc'
  if (sortOrder !== 'asc' && sortOrder !== 'desc') throw new ApiError(422, 'VALIDATION_ERROR', 'sortOrder must be asc or desc')

  let records = await repository.list() as T[]
  if (query.q?.trim()) {
    const needle = query.q.trim().toLocaleLowerCase('en-IN')
    records = records.filter((record) => searchableFields.some((field) => {
      const value = record[field]
      return typeof value === 'string' && value.toLocaleLowerCase('en-IN').includes(needle)
    }))
  }
  for (const [field, value] of Object.entries(query.filters ?? {})) {
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(field)) throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid filter field')
    records = records.filter((record) => String(record[field] ?? '') === value)
  }
  records.sort((left, right) => {
    const a = left[sortBy]
    const b = right[sortBy]
    const comparison = typeof a === 'number' && typeof b === 'number' ? a - b : String(a ?? '').localeCompare(String(b ?? ''), 'en-IN')
    return sortOrder === 'asc' ? comparison : -comparison
  })
  const total = records.length
  const start = (page - 1) * pageSize
  return { items: records.slice(start, start + pageSize), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } }
}

export async function getRecord<T extends { id: string }>(repository: Pick<EntityRepository<T>, 'findById'>, id: string) {
  if (!/^[a-z]{3}_[a-z0-9]{3,}$/i.test(id)) throw new ApiError(400, 'INVALID_REQUEST', 'Invalid record identifier')
  const record = await repository.findById(id)
  if (!record) throw new ApiError(404, 'NOT_FOUND', 'Record not found')
  return record
}
