import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const seedDir = resolve(root, 'data/seeds')
const read = (name) => JSON.parse(readFileSync(resolve(seedDir, `${name}.json`), 'utf8'))
const errors = []
const check = (condition, message) => { if (!condition) errors.push(message) }
const equal = (actual, expected, message) => check(actual === expected, `${message}: expected ${expected}, got ${actual}`)
const unique = (records, label) => {
  const seen = new Set()
  for (const record of records) {
    check(!seen.has(record.id), `${label} contains duplicate id ${record.id}`)
    seen.add(record.id)
  }
  return seen
}
const requireRef = (set, value, message) => check(value === null || set.has(value), `${message}: missing ${value}`)
const sum = (items, key) => items.reduce((total, item) => total + item[key], 0)
const calculateLineTotal = (line) => {
  const taxable = line.quantity * line.unitPricePaise - line.discountPaise
  return taxable + Math.round((taxable * line.taxRateBps) / 10000)
}
const tableNames = ['users', 'categories', 'units', 'medicines', 'suppliers', 'patients', 'doctors', 'batches', 'purchases', 'purchase-items', 'sales', 'sale-items', 'quotations', 'quotation-items', 'payments', 'expenses', 'cash-book-entries', 'stock-movements', 'stock-adjustments', 'user-preferences']
const tables = Object.fromEntries(tableNames.map((name) => [name, read(name)]))
const settings = Object.fromEntries(['pharmacy-settings', 'tax-settings', 'invoice-settings', 'inventory-settings'].map((name) => [name, read(name)]))
const expected = { users: 3, categories: 10, units: 8, medicines: 40, suppliers: 10, patients: 25, doctors: 10, batches: 60, purchases: 15, sales: 30, quotations: 10, payments: 40, expenses: 20, 'cash-book-entries': 50, 'stock-movements': 100, 'stock-adjustments': 10, 'user-preferences': 0 }
const ids = {}
for (const [name, records] of Object.entries(tables)) ids[name] = unique(records, name)
for (const [name, count] of Object.entries(expected)) equal(tables[name].length, count, name)
for (const name of ['purchase-items', 'sale-items', 'quotation-items']) unique(tables[name], name)

for (const medicine of tables.medicines) {
  requireRef(ids.categories, medicine.categoryId, `medicine ${medicine.id} category`)
  requireRef(ids.units, medicine.unitId, `medicine ${medicine.id} unit`)
}
for (const batch of tables.batches) {
  requireRef(ids.medicines, batch.medicineId, `batch ${batch.id} medicine`)
  requireRef(ids.suppliers, batch.supplierId, `batch ${batch.id} supplier`)
  check(batch.openingQuantity >= 0, `batch ${batch.id} has a negative opening quantity`)
}
for (const item of tables['purchase-items']) {
  requireRef(ids.purchases, item.purchaseId, `purchase item ${item.id} purchase`)
  requireRef(ids.medicines, item.medicineId, `purchase item ${item.id} medicine`)
  requireRef(ids.batches, item.batchId, `purchase item ${item.id} batch`)
  const purchase = tables.purchases.find((row) => row.id === item.purchaseId)
  const batch = tables.batches.find((row) => row.id === item.batchId)
  if (purchase?.status === 'received') {
    check(Boolean(batch), `received purchase item ${item.id} must have a batch`)
    if (batch) {
      equal(batch.medicineId, item.medicineId, `purchase item ${item.id} batch medicine`)
      equal(batch.supplierId, purchase.supplierId, `purchase item ${item.id} batch supplier`)
    }
  } else check(item.batchId === null, `draft/cancelled purchase item ${item.id} must not allocate a batch`)
}
for (const item of tables['sale-items']) {
  requireRef(ids.sales, item.saleId, `sale item ${item.id} sale`)
  requireRef(ids.medicines, item.medicineId, `sale item ${item.id} medicine`)
  requireRef(ids.batches, item.batchId, `sale item ${item.id} batch`)
  const batch = tables.batches.find((row) => row.id === item.batchId)
  if (batch) equal(batch.medicineId, item.medicineId, `sale item ${item.id} batch medicine`)
}
for (const item of tables['quotation-items']) {
  requireRef(ids.quotations, item.quotationId, `quotation item ${item.id} quotation`)
  requireRef(ids.medicines, item.medicineId, `quotation item ${item.id} medicine`)
}
for (const purchase of tables.purchases) requireRef(ids.suppliers, purchase.supplierId, `purchase ${purchase.id} supplier`)
for (const sale of tables.sales) {
  requireRef(ids.patients, sale.patientId, `sale ${sale.id} patient`)
  requireRef(ids.doctors, sale.doctorId, `sale ${sale.id} doctor`)
  requireRef(ids.users, sale.createdByUserId, `sale ${sale.id} user`)
}
for (const quotation of tables.quotations) {
  requireRef(ids.patients, quotation.patientId, `quotation ${quotation.id} patient`)
  requireRef(ids.users, quotation.createdByUserId, `quotation ${quotation.id} user`)
}

for (const [entityName, rows, keyName] of [
  ['purchases', tables.purchases, 'purchaseId'], ['sales', tables.sales, 'saleId'], ['quotations', tables.quotations, 'quotationId'],
]) {
  const itemRows = tables[entityName === 'purchases' ? 'purchase-items' : entityName === 'sales' ? 'sale-items' : 'quotation-items']
  for (const header of rows) {
    const lines = itemRows.filter((item) => item[keyName] === header.id)
    const subtotal = lines.reduce((total, line) => total + line.quantity * line.unitPricePaise - line.discountPaise, 0)
    equal(header.subtotalPaise, subtotal, `${entityName} ${header.id} subtotal`)
    equal(header.discountPaise, sum(lines, 'discountPaise'), `${entityName} ${header.id} discount`)
    equal(header.taxPaise, sum(lines, 'taxPaise'), `${entityName} ${header.id} tax`)
    equal(header.totalPaise, sum(lines, 'lineTotalPaise'), `${entityName} ${header.id} total`)
    for (const line of lines) {
      check(line.quantity > 0 && Number.isInteger(line.quantity), `${entityName} line ${line.id} has invalid quantity`)
      check(line.unitPricePaise >= 0 && line.discountPaise >= 0, `${entityName} line ${line.id} has negative money`)
      equal(line.lineTotalPaise, calculateLineTotal(line), `${entityName} line ${line.id} calculated total`)
    }
  }
}

for (const adjustment of tables['stock-adjustments']) {
  requireRef(ids.users, adjustment.createdByUserId, `adjustment ${adjustment.id} user`)
  for (const line of adjustment.lines) {
    requireRef(ids.batches, line.batchId, `adjustment ${adjustment.id} batch`)
    requireRef(ids.medicines, line.medicineId, `adjustment ${adjustment.id} medicine`)
  }
}
for (const movement of tables['stock-movements']) {
  requireRef(ids.batches, movement.batchId, `movement ${movement.id} batch`)
  requireRef(ids.medicines, movement.medicineId, `movement ${movement.id} medicine`)
  check(movement.quantityDelta !== 0 && Number.isInteger(movement.quantityDelta), `movement ${movement.id} has invalid quantity delta`)
  if (movement.movementType === 'purchase_receipt') requireRef(ids.purchases, movement.sourceId, `movement ${movement.id} purchase`)
  if (movement.movementType === 'sale') requireRef(ids.sales, movement.sourceId, `movement ${movement.id} sale`)
  if (movement.movementType === 'adjustment') requireRef(ids['stock-adjustments'], movement.sourceId, `movement ${movement.id} adjustment`)
}
for (const purchase of tables.purchases.filter((entry) => entry.status === 'draft' || entry.status === 'cancelled')) check(!tables['stock-movements'].some((movement) => movement.sourceId === purchase.id), `non-received purchase ${purchase.id} changed stock`)
for (const purchase of tables.purchases.filter((entry) => entry.status === 'received')) {
  const lines = tables['purchase-items'].filter((item) => item.purchaseId === purchase.id)
  for (const line of lines) {
    const movement = tables['stock-movements'].find((row) => row.movementType === 'purchase_receipt' && row.sourceId === purchase.id && row.batchId === line.batchId)
    check(Boolean(movement), `received purchase line ${line.id} is missing its stock movement`)
    if (movement) equal(movement.quantityDelta, line.quantity, `purchase line ${line.id} movement quantity`)
  }
}
for (const sale of tables.sales) {
  for (const line of tables['sale-items'].filter((item) => item.saleId === sale.id)) {
    const movement = tables['stock-movements'].find((row) => row.movementType === 'sale' && row.sourceId === sale.id && row.batchId === line.batchId)
    check(Boolean(movement), `sale line ${line.id} is missing its stock movement`)
    if (movement) equal(movement.quantityDelta, -line.quantity, `sale line ${line.id} movement quantity`)
  }
}
for (const adjustment of tables['stock-adjustments']) {
  for (const line of adjustment.lines) {
    const movement = tables['stock-movements'].find((row) => row.movementType === 'adjustment' && row.sourceId === adjustment.id && row.batchId === line.batchId)
    check(Boolean(movement), `adjustment ${adjustment.id} line is missing its stock movement`)
    if (movement) equal(movement.quantityDelta, line.quantityDelta, `adjustment ${adjustment.id} movement quantity`)
  }
}
for (const quotation of tables.quotations) check(!tables['stock-movements'].some((movement) => movement.sourceId === quotation.id), `quotation ${quotation.id} changed stock`)

const paymentTotals = new Map()
for (const payment of tables.payments) {
  requireRef(payment.transactionType === 'sale' ? ids.sales : ids.purchases, payment.transactionId, `payment ${payment.id} transaction`)
  requireRef(payment.partyType === 'patient' ? ids.patients : ids.suppliers, payment.partyId, `payment ${payment.id} party`)
  check(payment.amountPaise > 0, `payment ${payment.id} must be positive`)
  check((payment.transactionType === 'sale' && payment.direction === 'received' && payment.partyType === 'patient') || (payment.transactionType === 'purchase' && payment.direction === 'paid' && payment.partyType === 'supplier'), `payment ${payment.id} has inconsistent direction or party type`)
  const transaction = (payment.transactionType === 'sale' ? tables.sales : tables.purchases).find((row) => row.id === payment.transactionId)
  if (transaction) equal(payment.partyId, payment.transactionType === 'sale' ? transaction.patientId : transaction.supplierId, `payment ${payment.id} party allocation`)
  paymentTotals.set(payment.transactionId, (paymentTotals.get(payment.transactionId) ?? 0) + payment.amountPaise)
}
for (const [kind, rows] of [['sale', tables.sales], ['purchase', tables.purchases]]) {
  for (const transaction of rows) {
    const allocated = paymentTotals.get(transaction.id) ?? 0
    check(allocated <= transaction.totalPaise, `${kind} ${transaction.id} allocations exceed total`)
    equal(allocated, transaction.paidPaise, `${kind} ${transaction.id} paid amount`)
  }
}
for (const entry of tables['cash-book-entries']) {
  check(Boolean(entry.paymentId) !== Boolean(entry.expenseId), `cash book ${entry.id} must reference one payment or expense`)
  if (entry.paymentId) {
    const payment = tables.payments.find((row) => row.id === entry.paymentId)
    check(Boolean(payment), `cash book ${entry.id} references missing payment`)
    if (payment) equal(entry.amountPaise, payment.amountPaise, `cash book ${entry.id} payment amount`)
  }
  if (entry.expenseId) {
    const expense = tables.expenses.find((row) => row.id === entry.expenseId)
    check(Boolean(expense), `cash book ${entry.id} references missing expense`)
    if (expense) equal(entry.amountPaise, expense.amountPaise, `cash book ${entry.id} expense amount`)
  }
}

const onHand = new Map(tables.batches.map((batch) => [batch.id, batch.openingQuantity]))
for (const movement of tables['stock-movements']) onHand.set(movement.batchId, (onHand.get(movement.batchId) ?? 0) + movement.quantityDelta)
for (const [batchId, quantity] of onHand) check(quantity >= 0, `batch ${batchId} ends with negative stock (${quantity})`)
for (const movement of tables['stock-movements'].filter((row) => row.movementType === 'purchase_receipt')) {
  check(movement.quantityDelta > 0, `purchase movement ${movement.id} must increase stock`)
}
for (const movement of tables['stock-movements'].filter((row) => row.movementType === 'sale')) {
  check(movement.quantityDelta < 0, `sale movement ${movement.id} must decrease stock`)
}
equal(tables['stock-movements'].length, 100, 'stock movement count')

if (errors.length) {
  console.error(`Seed validation failed with ${errors.length} issue(s):\n- ${errors.join('\n- ')}`)
  process.exitCode = 1
} else {
  const counts = Object.entries(tables).map(([name, rows]) => `${name}: ${rows.length}`).join(', ')
  console.log(`Seed validation passed. ${counts}. Opening-stock snapshot: ${settings['pharmacy-settings'].openingStockAsOf}.`)
}
