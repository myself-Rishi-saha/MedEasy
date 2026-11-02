export type StockAdjustmentServiceCode = 'INVALID_REQUEST' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR'

export class StockAdjustmentServiceError extends Error {
  status: number
  code: StockAdjustmentServiceCode
  constructor(status: number, code: StockAdjustmentServiceCode, message: string)
}

export interface StockAdjustmentRequestBody {
  reason: string
  adjustedOn?: string
  lines: Array<{ batchId: string; quantityDelta: number }>
}

export interface StockAdjustmentServiceResult {
  adjustment: Record<string, unknown>
  movements: Array<Record<string, unknown>>
}

export function createStockAdjustmentService(dependencies: {
  store: {
    read<T>(collection: string): Promise<T>
    update<T>(collection: string, updater: (current: T) => T | Promise<T>): Promise<T>
  }
  getBatchQuantityOnHand(batch: { id: string; medicineId: string; openingQuantity: number }, movements: Array<{ batchId: string; quantityDelta: number }>): number
  applyStockAdjustment(currentQuantity: number, delta: number): number
  generateId(prefix: 'adj' | 'mov'): string
  clock?: () => Date
}): (input: {
  body: StockAdjustmentRequestBody
  user: { id: string }
  idempotencyKey: string
}) => Promise<StockAdjustmentServiceResult>

export function toPublicStockAdjustment<T extends Record<string, unknown>>(adjustment: T): Omit<T, 'idempotencyKey' | 'requestHash' | 'resultMovements'>
