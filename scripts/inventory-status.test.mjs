import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyInventoryStatus } from '../lib/services/inventory-status.mjs'

test('classifies zero quantity as out of stock', () => {
  assert.equal(classifyInventoryStatus({ quantityOnHand: 0, totalMedicineQuantity: 0, reorderLevel: 5, isExpired: false, isNearExpiry: false }), 'Out of stock')
})

test('classifies positive quantity at or below minimum stock as low stock', () => {
  assert.equal(classifyInventoryStatus({ quantityOnHand: 5, totalMedicineQuantity: 5, reorderLevel: 5, isExpired: false, isNearExpiry: false }), 'Low stock')
})

test('classifies quantity above minimum stock as in stock', () => {
  assert.equal(classifyInventoryStatus({ quantityOnHand: 6, totalMedicineQuantity: 6, reorderLevel: 5, isExpired: false, isNearExpiry: false }), 'In stock')
})

test('keeps expiry labels for positive stock without hiding zero-stock batches', () => {
  assert.equal(classifyInventoryStatus({ quantityOnHand: 3, totalMedicineQuantity: 3, reorderLevel: 0, isExpired: true, isNearExpiry: false }), 'Expired')
  assert.equal(classifyInventoryStatus({ quantityOnHand: 0, totalMedicineQuantity: 4, reorderLevel: 5, isExpired: false, isNearExpiry: false }), 'Out of stock')
  assert.equal(classifyInventoryStatus({ quantityOnHand: 8, totalMedicineQuantity: 8, reorderLevel: 5, isExpired: false, isNearExpiry: true }), 'Near expiry')
})
