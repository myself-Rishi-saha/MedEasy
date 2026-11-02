export type InventoryStatus = 'Out of stock' | 'Expired' | 'Low stock' | 'Near expiry' | 'In stock'

export function classifyInventoryStatus(input: {
  quantityOnHand: number
  totalMedicineQuantity: number
  reorderLevel: number
  isExpired: boolean
  isNearExpiry: boolean
}): InventoryStatus
