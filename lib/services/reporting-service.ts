import { ApiError } from '@/lib/api/responses'
import { isValidDateOnly } from '@/lib/domain/server-utils'
import { getInventorySnapshot } from '@/lib/services/inventory-query-service'
import { getUserPreferences } from '@/lib/services/settings-service'
import { jsonStore } from '@/lib/storage/json-store'
import type { Expense, InventoryBatch, Patient, Payment, Purchase, PurchaseLineItem, Sale, SaleLineItem, Supplier } from '@/lib/domain/types'

type ReportType = 'sales' | 'purchases' | 'profit' | 'expenses' | 'stock' | 'expiry' | 'payments' | 'tax'
type ReportRow = Record<string, string | number | null>

const reportTypes = new Set<ReportType>(['sales', 'purchases', 'profit', 'expenses', 'stock', 'expiry', 'payments', 'tax'])
const csvColumns: Record<ReportType, string[]> = {
  sales: ['date', 'invoiceNumber', 'customer', 'status', 'subtotalPaise', 'discountPaise', 'taxPaise', 'totalPaise', 'paidPaise', 'duePaise'],
  purchases: ['date', 'invoiceNumber', 'supplier', 'status', 'subtotalPaise', 'discountPaise', 'taxPaise', 'totalPaise', 'paidPaise', 'duePaise'],
  profit: ['date', 'invoiceNumber', 'customer', 'salesRevenuePaise', 'discountPaise', 'taxPaise', 'costOfGoodsSoldPaise', 'grossProfitPaise'],
  expenses: ['date', 'category', 'description', 'method', 'amountPaise', 'reference'],
  stock: ['medicineName', 'sku', 'batchNumber', 'expiryDate', 'quantityOnHand', 'reorderLevel', 'purchasePricePaise', 'stockValuePaise', 'status'],
  expiry: ['medicineName', 'sku', 'batchNumber', 'expiryDate', 'quantityOnHand', 'stockValuePaise', 'status'],
  payments: ['date', 'direction', 'partyType', 'partyName', 'method', 'reference', 'transactionId', 'amountPaise'],
  tax: ['date', 'transactionType', 'invoiceNumber', 'partyName', 'taxRateBps', 'taxablePaise', 'cgstPaise', 'sgstPaise', 'igstPaise', 'taxPaise'],
}

function queryInteger(value: string | null, fallback: number, label: string, max: number) {
  if (value === null) return fallback
  if (!/^\d+$/.test(value)) throw new ApiError(422, 'VALIDATION_ERROR', `${label} must be a positive integer`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) throw new ApiError(422, 'VALIDATION_ERROR', `${label} must be between 1 and ${max}`)
  return parsed
}

function compareNewest(left: ReportRow, right: ReportRow) {
  const dateCompare = String(right.date ?? right.expiryDate ?? '').localeCompare(String(left.date ?? left.expiryDate ?? ''))
  return dateCompare || String(right.invoiceNumber ?? right.batchNumber ?? right.description ?? '').localeCompare(String(left.invoiceNumber ?? left.batchNumber ?? left.description ?? ''), 'en-IN')
}

function filterRows(rows: ReportRow[], search: URLSearchParams) {
  const q = search.get('q')?.trim().toLocaleLowerCase('en-IN')
  const filters: Record<string, string> = {}
  for (const key of ['status', 'patientId', 'supplierId', 'category', 'method', 'direction', 'partyType', 'medicineId', 'transactionType', 'rateBps']) {
    const value = search.get(key)?.trim()
    if (value) filters[key] = value
  }
  return rows.filter((row) => {
    if (q && !Object.values(row).some((value) => String(value ?? '').toLocaleLowerCase('en-IN').includes(q))) return false
    return Object.entries(filters).every(([key, value]) => String(row[key] ?? '') === value)
  }).sort(compareNewest)
}

function sum(rows: ReportRow[], field: string) {
  return rows.reduce((total, row) => total + (typeof row[field] === 'number' ? row[field] as number : 0), 0)
}

function currentDateInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

function dateRange(search: URLSearchParams, timezone: string) {
  const today = currentDateInTimezone(timezone)
  const from = search.get('from') ?? `${today.slice(0, 7)}-01`
  const to = search.get('to') ?? today
  if (!isValidDateOnly(from) || !isValidDateOnly(to) || from > to) throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a valid date range where the start is not after the end')
  return { from, to }
}

export function reportCsv(type: ReportType, rows: ReportRow[]) {
  const headers = csvColumns[type]
  const escape = (value: unknown) => {
    const text = String(value ?? '')
    const safe = typeof value === 'string' && /^[=+@\t\r-]/.test(text) ? `'${text}` : text
    return `"${safe.replaceAll('"', '""')}"`
  }
  return [headers.map(escape).join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\r\n')
}

export async function getReportData(search: URLSearchParams, userId: string, includeAllRows = false) {
  const rawType = search.get('type') ?? 'sales'
  if (!reportTypes.has(rawType as ReportType)) throw new ApiError(422, 'VALIDATION_ERROR', 'Unsupported report type')
  const type = rawType as ReportType
  const preferences = await getUserPreferences(userId)
  const { from, to } = dateRange(search, preferences.timezone)
  const stockAsOf = new Date(`${currentDateInTimezone(preferences.timezone)}T12:00:00.000Z`)
  const page = queryInteger(search.get('page'), 1, 'Page', 1_000_000)
  const pageSize = queryInteger(search.get('pageSize'), 25, 'Page size', 100)
  const [sales, purchases, saleItems, purchaseItems, payments, expenses, batches, patients, suppliers, snapshot] = await Promise.all([
    jsonStore.read<Sale[]>('sales'),
    jsonStore.read<Purchase[]>('purchases'),
    jsonStore.read<SaleLineItem[]>('sale-items'),
    jsonStore.read<PurchaseLineItem[]>('purchase-items'),
    jsonStore.read<Payment[]>('payments'),
    jsonStore.read<Expense[]>('expenses'),
    jsonStore.read<InventoryBatch[]>('batches'),
    jsonStore.read<Patient[]>('patients'),
    jsonStore.read<Supplier[]>('suppliers'),
    getInventorySnapshot(stockAsOf),
  ])
  const batchById = new Map(batches.map((batch) => [batch.id, batch]))
  const patientById = new Map(patients.map((patient) => [patient.id, patient.name]))
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]))
  const saleRows = sales.filter((sale) => (sale.status === 'completed' || sale.status === 'partially_paid') && sale.soldOn >= from && sale.soldOn <= to)
  const purchaseRows = purchases.filter((purchase) => purchase.status === 'received' && purchase.purchasedOn >= from && purchase.purchasedOn <= to)
  const expensesInRange = expenses.filter((expense) => expense.incurredOn >= from && expense.incurredOn <= to)
  const activeSaleIds = new Set(saleRows.map((sale) => sale.id))
  const cogsBySale = new Map<string, number>()
  const uncostedBySale = new Map<string, number>()
  const salesWithLines = new Set(saleItems.map((item) => item.saleId))
  for (const sale of saleRows) if (!salesWithLines.has(sale.id)) uncostedBySale.set(sale.id, 1)
  for (const item of saleItems) {
    if (!activeSaleIds.has(item.saleId)) continue
    const batch = item.batchId ? batchById.get(item.batchId) : undefined
    if (!batch) {
      uncostedBySale.set(item.saleId, (uncostedBySale.get(item.saleId) ?? 0) + 1)
      continue
    }
    cogsBySale.set(item.saleId, (cogsBySale.get(item.saleId) ?? 0) + item.quantity * batch.purchasePricePaise)
  }

  let rows: ReportRow[] = []
  if (type === 'sales') {
    rows = saleRows.map((sale) => ({
      date: sale.soldOn, invoiceNumber: sale.invoiceNumber, patientId: sale.patientId,
      customer: sale.patientId ? patientById.get(sale.patientId) ?? 'Customer unavailable' : 'Walk-in customer',
      status: sale.status, subtotalPaise: sale.subtotalPaise, discountPaise: sale.discountPaise, taxPaise: sale.taxPaise,
      totalPaise: sale.totalPaise, paidPaise: sale.paidPaise, duePaise: Math.max(0, sale.totalPaise - sale.paidPaise),
    }))
  } else if (type === 'purchases') {
    rows = purchaseRows.map((purchase) => ({
      date: purchase.purchasedOn, invoiceNumber: purchase.invoiceNumber, supplierId: purchase.supplierId,
      supplier: supplierById.get(purchase.supplierId) ?? 'Supplier unavailable', status: purchase.status,
      subtotalPaise: purchase.subtotalPaise, discountPaise: purchase.discountPaise, taxPaise: purchase.taxPaise,
      totalPaise: purchase.totalPaise, paidPaise: purchase.paidPaise, duePaise: Math.max(0, purchase.totalPaise - purchase.paidPaise),
    }))
  } else if (type === 'profit') {
    rows = saleRows.map((sale) => {
      const uncostedLines = uncostedBySale.get(sale.id) ?? 0
      const cost = cogsBySale.get(sale.id) ?? 0
      return {
        date: sale.soldOn, invoiceNumber: sale.invoiceNumber, patientId: sale.patientId,
        customer: sale.patientId ? patientById.get(sale.patientId) ?? 'Customer unavailable' : 'Walk-in customer',
        salesRevenuePaise: sale.subtotalPaise, discountPaise: sale.discountPaise, taxPaise: sale.taxPaise,
        costOfGoodsSoldPaise: cost, grossProfitPaise: uncostedLines ? null : sale.subtotalPaise - cost, uncostedLines,
      }
    })
  } else if (type === 'expenses') {
    rows = expensesInRange.map((expense) => ({
      date: expense.incurredOn, category: expense.category, description: expense.description, method: expense.method,
      amountPaise: expense.amountPaise, reference: expense.reference,
    }))
  } else if (type === 'stock' || type === 'expiry') {
    rows = snapshot.rows.map((row) => ({
      date: row.expiryDate, medicineId: row.medicineId, medicineName: row.medicineName, sku: row.sku,
      batchNumber: row.batchNumber, expiryDate: row.expiryDate, quantityOnHand: row.quantityOnHand,
      reorderLevel: row.reorderLevel, purchasePricePaise: row.purchasePricePaise, stockValuePaise: row.stockValuePaise,
      status: row.status,
    })).filter((row) => type === 'stock' || (String(row.expiryDate) >= from && String(row.expiryDate) <= to))
  } else if (type === 'payments') {
    rows = payments.filter((payment) => payment.paidOn >= from && payment.paidOn <= to).map((payment) => ({
      date: payment.paidOn, direction: payment.direction, partyType: payment.partyType, partyId: payment.partyId,
      partyName: payment.partyType === 'patient' ? patientById.get(payment.partyId ?? '') ?? 'Walk-in customer' : supplierById.get(payment.partyId ?? '') ?? 'Supplier unavailable',
      method: payment.method, reference: payment.reference, transactionId: payment.transactionId, amountPaise: payment.amountPaise,
    }))
  } else {
    const taxRows: ReportRow[] = []
    for (const sale of saleRows) {
      for (const line of saleItems.filter((item) => item.saleId === sale.id)) {
        taxRows.push({
          date: sale.soldOn, transactionType: 'sale', invoiceNumber: sale.invoiceNumber,
          partyName: sale.patientId ? patientById.get(sale.patientId) ?? 'Customer unavailable' : 'Walk-in customer',
          rateBps: line.taxRateBps, taxRateBps: line.taxRateBps,
          taxablePaise: Math.max(0, line.lineTotalPaise - line.taxPaise),
          cgstPaise: line.cgstPaise ?? 0, sgstPaise: line.sgstPaise ?? 0, igstPaise: line.igstPaise ?? 0, taxPaise: line.taxPaise,
        })
      }
    }
    for (const purchase of purchaseRows) {
      for (const line of purchaseItems.filter((item) => item.purchaseId === purchase.id)) {
        taxRows.push({
          date: purchase.purchasedOn, transactionType: 'purchase', invoiceNumber: purchase.invoiceNumber,
          partyName: supplierById.get(purchase.supplierId) ?? 'Supplier unavailable', rateBps: line.taxRateBps,
          taxRateBps: line.taxRateBps, taxablePaise: Math.max(0, line.lineTotalPaise - line.taxPaise),
          cgstPaise: line.cgstPaise ?? 0, sgstPaise: line.sgstPaise ?? 0, igstPaise: line.igstPaise ?? 0, taxPaise: line.taxPaise,
        })
      }
    }
    rows = taxRows
  }

  rows = filterRows(rows, search)
  const total = rows.length
  const allRows = rows
  const items = includeAllRows ? allRows : allRows.slice((page - 1) * pageSize, page * pageSize)
  const summary: Record<string, number | boolean | null> = { count: total }

  if (type === 'sales') Object.assign(summary, {
    subtotalPaise: sum(allRows, 'subtotalPaise'), discountPaise: sum(allRows, 'discountPaise'), taxPaise: sum(allRows, 'taxPaise'),
    totalPaise: sum(allRows, 'totalPaise'), paidPaise: sum(allRows, 'paidPaise'), duePaise: sum(allRows, 'duePaise'),
  })
  if (type === 'purchases') Object.assign(summary, {
    subtotalPaise: sum(allRows, 'subtotalPaise'), discountPaise: sum(allRows, 'discountPaise'), taxPaise: sum(allRows, 'taxPaise'),
    totalPaise: sum(allRows, 'totalPaise'), paidPaise: sum(allRows, 'paidPaise'), duePaise: sum(allRows, 'duePaise'),
  })
  if (type === 'profit') {
    const cogsKnown = allRows.every((row) => Number(row.uncostedLines ?? 0) === 0)
    const revenue = sum(allRows, 'salesRevenuePaise')
    const cogs = sum(allRows, 'costOfGoodsSoldPaise')
    const operatingExpenses = sum(expensesInRange.map((expense) => ({ amountPaise: expense.amountPaise })), 'amountPaise')
    Object.assign(summary, {
      salesRevenuePaise: revenue, discountPaise: sum(allRows, 'discountPaise'), taxPaise: sum(allRows, 'taxPaise'),
      costOfGoodsSoldPaise: cogs, cogsKnown, uncostedLineCount: sum(allRows, 'uncostedLines'),
      grossProfitPaise: cogsKnown ? revenue - cogs : null, otherExpensesPaise: operatingExpenses,
      netProfitPaise: cogsKnown ? revenue - cogs - operatingExpenses : null,
    })
  }
  if (type === 'expenses') Object.assign(summary, { amountPaise: sum(allRows, 'amountPaise') })
  if (type === 'stock' || type === 'expiry') Object.assign(summary, {
    unitsOnHand: sum(allRows, 'quantityOnHand'), stockValuePaise: sum(allRows, 'stockValuePaise'),
    nearExpiryBatchCount: allRows.filter((row) => row.status === 'Near expiry').length,
    expiredBatchCount: allRows.filter((row) => row.status === 'Expired').length,
    lowStockBatchCount: allRows.filter((row) => row.status === 'Low stock').length,
  })
  if (type === 'payments') Object.assign(summary, {
    receivedPaise: sum(allRows.filter((row) => row.direction === 'received'), 'amountPaise'),
    paidPaise: sum(allRows.filter((row) => row.direction === 'paid'), 'amountPaise'),
    totalPaise: sum(allRows, 'amountPaise'),
  })
  if (type === 'tax') Object.assign(summary, {
    taxablePaise: sum(allRows, 'taxablePaise'), cgstPaise: sum(allRows, 'cgstPaise'), sgstPaise: sum(allRows, 'sgstPaise'),
    igstPaise: sum(allRows, 'igstPaise'), taxPaise: sum(allRows, 'taxPaise'),
  })

  const headers = csvColumns[type]
  return {
    type,
    from,
    to,
    items,
    summary,
    columns: headers,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    methodology: type === 'profit'
      ? 'Sales revenue is the recorded taxable subtotal after discounts and excluding GST. Gross profit is sales revenue minus cost of goods sold, valued from the purchase cost of the sold batch. Net profit subtracts recorded expenses for the selected period. GST collected, discounts, COGS, and expenses are shown separately. Profit is withheld if any completed sale line has no batch cost.'
      : undefined,
  }
}
