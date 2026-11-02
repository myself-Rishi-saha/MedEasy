import { jsonStore } from '@/lib/storage/json-store'
import { getInventorySnapshot } from '@/lib/services/inventory-query-service'
import { getUserPreferences } from '@/lib/services/settings-service'
import type { CashBookEntry, InventorySettings, Medicine, Patient, Purchase, Sale, Supplier } from '@/lib/domain/types'

export type DashboardRange = 'week' | 'month' | 'year'

function dateInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function startOfWeek(value: string) {
  const weekday = new Date(`${value}T00:00:00.000Z`).getUTCDay()
  return addDays(value, -((weekday + 6) % 7))
}

function rangeStart(value: string, range: DashboardRange) {
  if (range === 'year') return `${value.slice(0, 4)}-01-01`
  if (range === 'month') return `${value.slice(0, 7)}-01`
  return startOfWeek(value)
}

function activeSale(sale: Sale) {
  return sale.status === 'completed' || sale.status === 'partially_paid'
}

export async function getDashboardData(range: DashboardRange, userId: string) {
  const preferences = await getUserPreferences(userId)
  const timezone = preferences.timezone
  const today = dateInTimezone(new Date(), timezone)
  const inventorySettings = await jsonStore.read<InventorySettings>('inventory-settings')
  const snapshot = await getInventorySnapshot(new Date(`${today}T12:00:00.000Z`))
  const [sales, purchases, medicines, patients, suppliers, cashBook] = await Promise.all([
    jsonStore.read<Sale[]>('sales'),
    jsonStore.read<Purchase[]>('purchases'),
    jsonStore.read<Medicine[]>('medicines'),
    jsonStore.read<Patient[]>('patients'),
    jsonStore.read<Supplier[]>('suppliers'),
    jsonStore.read<CashBookEntry[]>('cash-book-entries'),
  ])

  const patientById = new Map(patients.map((patient) => [patient.id, patient.name]))
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]))
  const todaySales = sales.filter((sale) => sale.soldOn === today && activeSale(sale))
  const todayPurchases = purchases.filter((purchase) => purchase.purchasedOn === today && purchase.status === 'received')
  const rangeFrom = rangeStart(today, range)
  const series: Array<{ label: string; date: string; salesPaise: number; purchasesPaise: number }> = []

  if (range === 'year') {
    const firstYear = Number(today.slice(0, 4))
    for (let month = 1; month <= Number(today.slice(5, 7)); month += 1) {
      const date = `${firstYear}-${String(month).padStart(2, '0')}-01`
      const key = date.slice(0, 7)
      series.push({
        label: new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00.000Z`)),
        date: key,
        salesPaise: sales.filter((sale) => activeSale(sale) && sale.soldOn.slice(0, 7) === key).reduce((sum, sale) => sum + sale.totalPaise, 0),
        purchasesPaise: purchases.filter((purchase) => purchase.status === 'received' && purchase.purchasedOn.slice(0, 7) === key).reduce((sum, purchase) => sum + purchase.totalPaise, 0),
      })
    }
  } else {
    const dayCount = range === 'week' ? 7 : (new Date(`${today}T00:00:00.000Z`).getUTCDate())
    for (let offset = 0; offset < dayCount; offset += 1) {
      const date = addDays(rangeFrom, offset)
      if (date > today) break
      const label = range === 'week'
        ? new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00.000Z`))
        : String(Number(date.slice(8, 10)))
      series.push({
        label,
        date,
        salesPaise: sales.filter((sale) => activeSale(sale) && sale.soldOn === date).reduce((sum, sale) => sum + sale.totalPaise, 0),
        purchasesPaise: purchases.filter((purchase) => purchase.status === 'received' && purchase.purchasedOn === date).reduce((sum, purchase) => sum + purchase.totalPaise, 0),
      })
    }
  }

  const lowStockItems = inventorySettings.lowStockAlertsEnabled
    ? medicines.filter((medicine) => medicine.status === 'active').map((medicine) => ({
      medicineId: medicine.id,
      medicineName: medicine.name,
      sku: medicine.sku,
      quantityOnHand: snapshot.rows.filter((row) => row.medicineId === medicine.id && row.expiryDate >= today).reduce((sum, row) => sum + row.quantityOnHand, 0),
      reorderLevel: medicine.reorderLevel,
    })).filter((medicine) => medicine.quantityOnHand <= medicine.reorderLevel)
    : []
  const nearExpiryRows = inventorySettings.nearExpiryAlertsEnabled
    ? snapshot.rows.filter((row) => row.quantityOnHand > 0 && row.expiryDate >= today && row.expiryDate <= snapshot.nearExpiryDate)
    : []
  const expiredRows = snapshot.rows.filter((row) => row.quantityOnHand > 0 && row.expiryDate < today)
  const customerDueSales = sales.filter(activeSale).map((sale) => ({ sale, due: Math.max(0, sale.totalPaise - sale.paidPaise) })).filter(({ due }) => due > 0)
  const supplierDuePurchases = purchases.filter((purchase) => purchase.status === 'received').map((purchase) => ({ purchase, due: Math.max(0, purchase.totalPaise - purchase.paidPaise) })).filter(({ due }) => due > 0)
  const cashToday = cashBook.filter((entry) => entry.occurredOn === today)

  return {
    date: today,
    timezone,
    range,
    rangeFrom,
    pharmacyName: (await jsonStore.read<{ name: string }>('pharmacy-settings')).name,
    stats: {
      salesTodayPaise: todaySales.reduce((sum, sale) => sum + sale.totalPaise, 0),
      purchasesTodayPaise: todayPurchases.reduce((sum, purchase) => sum + purchase.totalPaise, 0),
      medicineCount: medicines.filter((medicine) => medicine.status === 'active').length,
      stockValuePaise: snapshot.summary.stockValuePaise,
      lowStockMedicineCount: lowStockItems.length,
      nearExpiryBatchCount: nearExpiryRows.length,
      expiredBatchCount: expiredRows.length,
      customerBalancePaise: customerDueSales.reduce((sum, entry) => sum + entry.due, 0),
      customerBalanceCount: new Set(customerDueSales.map(({ sale }) => sale.patientId).filter(Boolean)).size,
      supplierBalancePaise: supplierDuePurchases.reduce((sum, entry) => sum + entry.due, 0),
      supplierBalanceCount: new Set(supplierDuePurchases.map(({ purchase }) => purchase.supplierId)).size,
      cashMovementPaise: cashToday.reduce((sum, entry) => sum + (entry.entryType === 'inflow' ? entry.amountPaise : -entry.amountPaise), 0),
      lowStockAlertsEnabled: inventorySettings.lowStockAlertsEnabled,
      nearExpiryAlertsEnabled: inventorySettings.nearExpiryAlertsEnabled,
      nearExpiryDays: inventorySettings.nearExpiryDays,
    },
    series,
    recentSales: [...sales].filter(activeSale).sort((a, b) => b.soldOn.localeCompare(a.soldOn) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5).map((sale) => ({
      id: sale.id,
      invoiceNumber: sale.invoiceNumber,
      soldOn: sale.soldOn,
      customer: sale.patientId ? patientById.get(sale.patientId) ?? 'Customer unavailable' : 'Walk-in customer',
      totalPaise: sale.totalPaise,
      status: sale.status,
    })),
    recentPurchases: [...purchases].filter((purchase) => purchase.status === 'received').sort((a, b) => b.purchasedOn.localeCompare(a.purchasedOn) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5).map((purchase) => ({
      id: purchase.id,
      invoiceNumber: purchase.invoiceNumber,
      purchasedOn: purchase.purchasedOn,
      supplier: supplierById.get(purchase.supplierId) ?? 'Supplier unavailable',
      totalPaise: purchase.totalPaise,
      status: purchase.status,
    })),
    lowStockItems,
    nearExpiryItems: nearExpiryRows.slice(0, 5).map((row) => ({ medicineId: row.medicineId, medicineName: row.medicineName, batchNumber: row.batchNumber, expiryDate: row.expiryDate, quantityOnHand: row.quantityOnHand })),
    expiredItems: expiredRows.slice(0, 5).map((row) => ({ medicineId: row.medicineId, medicineName: row.medicineName, batchNumber: row.batchNumber, expiryDate: row.expiryDate, quantityOnHand: row.quantityOnHand })),
  }
}
