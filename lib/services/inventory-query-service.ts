import { jsonStore } from '@/lib/storage/json-store'
import { getBatchQuantityOnHand } from './inventory-service'
import { classifyInventoryStatus } from './inventory-status.mjs'
import type { InventoryBatch, InventorySettings, Medicine, StockMovement, Supplier } from '@/lib/domain/types'

export interface InventoryRow extends Record<string, unknown> {
  id: string
  batchId: string
  medicineId: string
  medicineName: string
  sku: string
  batchNumber: string
  supplierName: string
  expiryDate: string
  receivedOn: string
  quantityOnHand: number
  reorderLevel: number
  purchasePricePaise: number
  stockValuePaise: number
  status: string
  createdAt: string
  updatedAt: string
}

export async function getInventorySnapshot(today = new Date()) {
  const [batches, medicines, suppliers, movements, settings] = await Promise.all([
    jsonStore.read<InventoryBatch[]>('batches'),
    jsonStore.read<Medicine[]>('medicines'),
    jsonStore.read<Supplier[]>('suppliers'),
    jsonStore.read<StockMovement[]>('stock-movements'),
    jsonStore.read<InventorySettings>('inventory-settings'),
  ])
  const medicineById = new Map(medicines.map((medicine) => [medicine.id, medicine]))
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]))
  const todayString = today.toISOString().slice(0, 10)
  const totalsByMedicine = new Map<string, number>()
  for (const batch of batches) {
    if (batch.expiryDate >= todayString) {
      totalsByMedicine.set(batch.medicineId, (totalsByMedicine.get(batch.medicineId) ?? 0) + getBatchQuantityOnHand(batch, movements))
    }
  }
  const nearExpiryLimit = new Date(today)
  nearExpiryLimit.setUTCDate(nearExpiryLimit.getUTCDate() + settings.nearExpiryDays)
  const nearExpiryDate = nearExpiryLimit.toISOString().slice(0, 10)
  const rows: InventoryRow[] = batches.flatMap((batch) => {
    const medicine = medicineById.get(batch.medicineId)
    if (!medicine) return []
    const quantityOnHand = getBatchQuantityOnHand(batch, movements)
    const totalMedicineQuantity = totalsByMedicine.get(medicine.id) ?? 0
    const isExpired = batch.expiryDate < todayString
    const isNearExpiry = !isExpired && batch.expiryDate <= nearExpiryDate
    const status = classifyInventoryStatus({ quantityOnHand, totalMedicineQuantity, reorderLevel: medicine.reorderLevel, isExpired, isNearExpiry })
    return [{
      id: batch.id,
      batchId: batch.id,
      medicineId: medicine.id,
      medicineName: medicine.name,
      sku: medicine.sku,
      batchNumber: batch.batchNumber,
      supplierName: supplierById.get(batch.supplierId)?.name ?? 'Unknown supplier',
      expiryDate: batch.expiryDate,
      receivedOn: batch.receivedOn,
      quantityOnHand,
      reorderLevel: medicine.reorderLevel,
      purchasePricePaise: batch.purchasePricePaise,
      stockValuePaise: quantityOnHand * batch.purchasePricePaise,
      status,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    }]
  })

  const lowStockMedicineIds = new Set(medicines.filter((medicine) => medicine.status === 'active' && (totalsByMedicine.get(medicine.id) ?? 0) <= medicine.reorderLevel).map((medicine) => medicine.id))
  const summary = {
    batchCount: rows.length,
    unitsOnHand: rows.reduce((total, row) => total + row.quantityOnHand, 0),
    stockValuePaise: rows.reduce((total, row) => total + row.stockValuePaise, 0),
    lowStockMedicineCount: lowStockMedicineIds.size,
    nearExpiryBatchCount: rows.filter((row) => row.quantityOnHand > 0 && row.expiryDate >= todayString && row.expiryDate <= nearExpiryDate).length,
    expiredBatchCount: rows.filter((row) => row.quantityOnHand > 0 && row.expiryDate < todayString).length,
  }
  return { rows, summary, today: todayString, nearExpiryDate }
}

export function filterInventoryRows(rows: InventoryRow[], view: string, today: string, nearExpiryDate: string) {
  if (view === 'low-stock') return rows.filter((row) => row.status === 'Low stock')
  if (view === 'near-expiry') return rows.filter((row) => row.expiryDate >= today && row.expiryDate <= nearExpiryDate)
  if (view === 'expired') return rows.filter((row) => row.expiryDate < today)
  return rows
}
