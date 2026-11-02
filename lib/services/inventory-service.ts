import { ApiError } from '@/lib/api/responses'
import type { InventoryBatch, StockMovement } from '@/lib/domain/types'

export function getBatchQuantityOnHand(batch: InventoryBatch, movements: StockMovement[]) {
  return movements.reduce((quantity, movement) => movement.batchId === batch.id ? quantity + movement.quantityDelta : quantity, batch.openingQuantity)
}

export function validateSaleAgainstBatch(batch: InventoryBatch, movements: StockMovement[], quantity: number, soldOn: string) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new ApiError(422, 'VALIDATION_ERROR', 'Sale quantity must be a positive integer')
  if (batch.expiryDate < soldOn) throw new ApiError(422, 'VALIDATION_ERROR', 'Expired batches cannot be sold')
  const available = getBatchQuantityOnHand(batch, movements)
  if (quantity > available) throw new ApiError(409, 'CONFLICT', 'Insufficient stock in selected batch')
  return available - quantity
}

export function applyStockAdjustment(currentQuantity: number, delta: number) {
  if (!Number.isSafeInteger(delta) || delta === 0) throw new ApiError(422, 'VALIDATION_ERROR', 'Adjustment quantity must be a non-zero integer')
  if (!Number.isSafeInteger(currentQuantity) || currentQuantity + delta < 0) throw new ApiError(409, 'CONFLICT', 'Adjustment cannot result in negative stock')
  return currentQuantity + delta
}

export function selectFefoBatch(batches: InventoryBatch[], movements: StockMovement[], quantity: number, soldOn: string) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new ApiError(422, 'VALIDATION_ERROR', 'Sale quantity must be a positive integer')
  const candidates = batches
    .filter((batch) => batch.expiryDate >= soldOn && getBatchQuantityOnHand(batch, movements) > 0)
    .sort((left, right) => left.expiryDate.localeCompare(right.expiryDate) || left.receivedOn.localeCompare(right.receivedOn) || left.id.localeCompare(right.id))
  const available = candidates.reduce((total, batch) => total + getBatchQuantityOnHand(batch, movements), 0)
  if (available < quantity) throw new ApiError(409, 'CONFLICT', 'Insufficient unexpired stock')
  let remaining = quantity
  return candidates.flatMap((batch) => {
    if (remaining <= 0) return []
    const allocated = Math.min(remaining, getBatchQuantityOnHand(batch, movements))
    remaining -= allocated
    return [{ batchId: batch.id, quantity: allocated }]
  })
}
