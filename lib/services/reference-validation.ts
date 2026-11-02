import { jsonStore } from '@/lib/storage/json-store'
import { ApiError } from '@/lib/api/responses'
import type { EntityCollection } from '@/lib/domain/schemas'

type ReferenceRule = { field: string; collection: EntityCollection; nullable?: boolean }

const referenceRules: Partial<Record<EntityCollection, ReferenceRule[]>> = {
  medicines: [{ field: 'categoryId', collection: 'categories' }, { field: 'unitId', collection: 'units' }],
  batches: [{ field: 'medicineId', collection: 'medicines' }, { field: 'supplierId', collection: 'suppliers' }],
  purchases: [{ field: 'supplierId', collection: 'suppliers' }],
  'purchase-items': [{ field: 'purchaseId', collection: 'purchases' }, { field: 'medicineId', collection: 'medicines' }, { field: 'batchId', collection: 'batches', nullable: true }],
  sales: [{ field: 'patientId', collection: 'patients', nullable: true }, { field: 'doctorId', collection: 'doctors', nullable: true }, { field: 'createdByUserId', collection: 'users' }],
  'sale-items': [{ field: 'saleId', collection: 'sales' }, { field: 'medicineId', collection: 'medicines' }, { field: 'batchId', collection: 'batches' }],
  quotations: [{ field: 'patientId', collection: 'patients', nullable: true }, { field: 'createdByUserId', collection: 'users' }],
  'quotation-items': [{ field: 'quotationId', collection: 'quotations' }, { field: 'medicineId', collection: 'medicines' }],
  'cash-book-entries': [{ field: 'paymentId', collection: 'payments', nullable: true }, { field: 'expenseId', collection: 'expenses', nullable: true }],
  'stock-adjustments': [{ field: 'createdByUserId', collection: 'users' }],
  'stock-movements': [{ field: 'batchId', collection: 'batches' }, { field: 'medicineId', collection: 'medicines' }],
}

export async function validateEntityReferences(collection: EntityCollection, record: Record<string, unknown>) {
  const references = referenceRules[collection] ?? []
  for (const rule of references) {
    const value = record[rule.field]
    if (rule.nullable && (value === null || value === undefined)) continue
    if (typeof value !== 'string') throw new ApiError(422, 'VALIDATION_ERROR', `Invalid reference for ${rule.field}`)
    const rows = await jsonStore.read<unknown[]>(rule.collection)
    const exists = rows.some((row) => typeof row === 'object' && row !== null && 'id' in row && row.id === value)
    if (!exists) throw new ApiError(422, 'VALIDATION_ERROR', `Referenced ${rule.field} does not exist`)
  }
  if (collection === 'payments') {
    const isSale = record.transactionType === 'sale'
    const transactionCollection: EntityCollection = isSale ? 'sales' : 'purchases'
    const partyCollection: EntityCollection = record.partyType === 'patient' ? 'patients' : 'suppliers'
    const transactionRows = await jsonStore.read<Record<string, unknown>[]>(transactionCollection)
    const partyRows = await jsonStore.read<Record<string, unknown>[]>(partyCollection)
    const transaction = transactionRows.find((row) => row.id === record.transactionId)
    const partyExists = partyRows.some((row) => row.id === record.partyId)
    const expectedPartyId = isSale ? transaction?.patientId : transaction?.supplierId
    const directionMatches = isSale ? record.direction === 'received' && record.partyType === 'patient' : record.direction === 'paid' && record.partyType === 'supplier'
    if (!transaction || !partyExists || expectedPartyId !== record.partyId || !directionMatches) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Payment party and transaction do not match')
    }
  }
  if (collection === 'stock-movements') {
    const sourceCollection: EntityCollection | null = record.movementType === 'purchase_receipt' ? 'purchases' : record.movementType === 'sale' ? 'sales' : record.movementType === 'adjustment' ? 'stock-adjustments' : null
    if (!sourceCollection) throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid stock movement source')
    const sourceRows = sourceCollection === 'stock-adjustments'
      ? await jsonStore.read<unknown[]>(sourceCollection)
      : await jsonStore.read<Record<string, unknown>[]>(sourceCollection)
    if (!sourceRows.some((row) => typeof row === 'object' && row !== null && 'id' in row && row.id === record.sourceId)) throw new ApiError(422, 'VALIDATION_ERROR', 'Stock movement source does not exist')
    const batches = await jsonStore.read<Record<string, unknown>[]>('batches')
    const batch = batches.find((row) => row.id === record.batchId)
    if (!batch || batch.medicineId !== record.medicineId) throw new ApiError(422, 'VALIDATION_ERROR', 'Stock movement batch and medicine do not match')
  }
  if (collection === 'stock-adjustments' && Array.isArray(record.lines)) {
    for (const line of record.lines) {
      if (typeof line !== 'object' || line === null) throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid stock adjustment line')
      const batchId = 'batchId' in line ? line.batchId : null
      const medicineId = 'medicineId' in line ? line.medicineId : null
      const batches = await jsonStore.read<Record<string, unknown>[]>('batches')
      const batch = batches.find((row) => row.id === batchId)
      if (!batch || batch.medicineId !== medicineId) throw new ApiError(422, 'VALIDATION_ERROR', 'Stock adjustment batch and medicine do not match')
    }
  }
}
