export function classifyInventoryStatus({ quantityOnHand, totalMedicineQuantity, reorderLevel, isExpired, isNearExpiry }) {
  if (quantityOnHand <= 0) return 'Out of stock'
  if (isExpired) return 'Expired'
  if (totalMedicineQuantity <= 0) return 'Out of stock'
  if (totalMedicineQuantity <= reorderLevel) return 'Low stock'
  if (isNearExpiry) return 'Near expiry'
  return 'In stock'
}
