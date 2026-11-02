import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const seedDir = resolve(root, 'data/seeds')
mkdirSync(seedDir, { recursive: true })
const pad = (number) => String(number).padStart(3, '0')
const id = (prefix, number) => `${prefix}_${pad(number)}`
const iso = (date) => new Date(date).toISOString()
const day = (date) => date.toISOString().slice(0, 10)
const addDays = (value, count) => {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + count)
  return day(date)
}
const stamp = (date, hour = 10) => `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`
const created = (date) => ({ createdAt: stamp(date), updatedAt: stamp(date) })
const sum = (items, key) => items.reduce((total, item) => total + item[key], 0)
const taxFor = (base, rateBps) => Math.round((base * rateBps) / 10000)
const moneyLine = (quantity, unitPricePaise, discountPaise, taxRateBps) => {
  const taxable = Math.max(0, quantity * unitPricePaise - discountPaise)
  const taxPaise = taxFor(taxable, taxRateBps)
  return { quantity, unitPricePaise, discountPaise, taxRateBps, taxPaise, lineTotalPaise: taxable + taxPaise }
}
const totalsFor = (lines) => ({
  subtotalPaise: sum(lines.map((line) => ({ value: line.quantity * line.unitPricePaise - line.discountPaise })), 'value'),
  discountPaise: sum(lines, 'discountPaise'),
  taxPaise: sum(lines, 'taxPaise'),
  totalPaise: sum(lines, 'lineTotalPaise'),
})
const rates = [0, 500, 1200, 1800, 2800]
const categoriesSeed = ['Analgesics', 'Antibiotics', 'Allergy care', 'Gastrointestinal', 'Vitamins & supplements', 'Dermatology', 'Cardiac care', 'Diabetes care', 'First aid', 'Respiratory care']
const unitSeed = [['Strip', 'STR', 'Blister strip'], ['Bottle', 'BTL', 'Liquid or bottle pack'], ['Piece', 'PCS', 'Individual item'], ['Tube', 'TUB', 'Topical tube'], ['Pack', 'PAK', 'Retail pack'], ['Vial', 'VIL', 'Single-use vial'], ['Sachet', 'SAC', 'Single sachet'], ['Box', 'BOX', 'Retail box']]
const medicineSeed = [
  ['Paracetamol 500 mg', 'Paracetamol', 'Narmada Labs'], ['Amoxicillin 500 mg', 'Amoxicillin', 'Sahyadri Pharma'], ['Cetirizine 10 mg', 'Cetirizine', 'Cedar Remedies'], ['Pantoprazole 40 mg', 'Pantoprazole', 'Lotus Therapeutics'], ['Azithromycin 500 mg', 'Azithromycin', 'Mango Healthcare'], ['Calcium + Vitamin D3', 'Calcium carbonate, cholecalciferol', 'Narmada Labs'], ['ORS orange 21 g', 'Oral rehydration salts', 'Sahyadri Pharma'], ['Diclofenac gel 30 g', 'Diclofenac', 'Cedar Remedies'], ['Metformin 500 mg', 'Metformin', 'Lotus Therapeutics'], ['Salbutamol inhaler', 'Salbutamol', 'Mango Healthcare'],
  ['Ibuprofen 400 mg', 'Ibuprofen', 'Narmada Labs'], ['Folic acid 5 mg', 'Folic acid', 'Sahyadri Pharma'], ['Vitamin C 500 mg', 'Ascorbic acid', 'Cedar Remedies'], ['Loratadine 10 mg', 'Loratadine', 'Lotus Therapeutics'], ['Omeprazole 20 mg', 'Omeprazole', 'Mango Healthcare'], ['Cough syrup 100 ml', 'Dextromethorphan blend', 'Narmada Labs'], ['Mupirocin ointment 5 g', 'Mupirocin', 'Sahyadri Pharma'], ['Amlodipine 5 mg', 'Amlodipine', 'Cedar Remedies'], ['Atorvastatin 10 mg', 'Atorvastatin', 'Lotus Therapeutics'], ['Glimepiride 1 mg', 'Glimepiride', 'Mango Healthcare'],
  ['Multivitamin tablets', 'Multivitamin blend', 'Narmada Labs'], ['Hydrocortisone cream 1%', 'Hydrocortisone', 'Sahyadri Pharma'], ['Sodium chloride nasal drops', 'Sodium chloride', 'Cedar Remedies'], ['Clotrimazole cream 1%', 'Clotrimazole', 'Lotus Therapeutics'], ['Aspirin 75 mg', 'Acetylsalicylic acid', 'Mango Healthcare'], ['Loperamide 2 mg', 'Loperamide', 'Narmada Labs'], ['Iron + folic acid', 'Ferrous fumarate, folic acid', 'Sahyadri Pharma'], ['B complex tablets', 'Vitamin B complex', 'Cedar Remedies'], ['Eye lubricant drops', 'Carboxymethylcellulose', 'Lotus Therapeutics'], ['Antacid suspension 170 ml', 'Aluminium hydroxide blend', 'Mango Healthcare'],
  ['Doxycycline 100 mg', 'Doxycycline', 'Narmada Labs'], ['Montelukast 10 mg', 'Montelukast', 'Sahyadri Pharma'], ['Levothyroxine 50 mcg', 'Levothyroxine', 'Cedar Remedies'], ['Losartan 50 mg', 'Losartan', 'Lotus Therapeutics'], ['Domperidone 10 mg', 'Domperidone', 'Mango Healthcare'], ['Budesonide respules', 'Budesonide', 'Narmada Labs'], ['Ketoconazole shampoo', 'Ketoconazole', 'Sahyadri Pharma'], ['Zinc 20 mg', 'Zinc sulfate', 'Cedar Remedies'], ['Gauze dressing pack', 'Sterile gauze', 'Lotus Therapeutics'], ['Digital thermometer', 'Temperature measurement device', 'Mango Healthcare'],
]
const supplierNames = ['Sahyadri Medical Distributors', 'Deccan Wellness Supply', 'Coromandel Pharma Trade', 'Blue Banyan Healthcare', 'IndusCare Wholesale', 'Mysore MedLink', 'Crescent Drug House', 'Western Ghats Pharma', 'Silverline Remedies', 'Greenfield Medical Supply']
const patientNames = ['Aarav Kulkarni', 'Ananya Rao', 'Ishaan Menon', 'Meera Nair', 'Rohan Shah', 'Diya Iyer', 'Kabir Joshi', 'Sana Kapoor', 'Vivaan Desai', 'Aditi Reddy', 'Arjun Patil', 'Kavya Bhat', 'Reyansh Mehta', 'Nisha Shetty', 'Advik Das', 'Tara Sinha', 'Neil Fernandes', 'Mira Chawla', 'Devika Pillai', 'Samar Khanna', 'Ira Ghosh', 'Kian Dutta', 'Sonal Jadhav', 'Ayaan Bose', 'Leela Krishnan']
const doctorNames = ['Dr. Kavita Hegde', 'Dr. Arvind Menon', 'Dr. Sneha Kulkarni', 'Dr. Ritesh Shah', 'Dr. Nandita Rao', 'Dr. Farhan Khan', 'Dr. Anjali Bhat', 'Dr. Kunal Desai', 'Dr. Meera Pillai', 'Dr. Suresh Iyer']
const cities = ['Bengaluru', 'Mysuru', 'Pune', 'Hyderabad', 'Chennai', 'Kochi', 'Mumbai', 'Mangaluru', 'Nashik', 'Coimbatore']
const methods = ['cash', 'upi', 'card', 'bank_transfer', 'credit']
const write = (name, value) => writeFileSync(resolve(seedDir, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`)

const users = [
  { id: id('usr', 1), name: 'Aarav Patel', email: 'aarav.admin@example.test', role: 'admin', status: 'active', lastLoginAt: stamp('2026-10-30', 9), ...created('2026-01-01') },
  { id: id('usr', 2), name: 'Neha Kulkarni', email: 'neha.pharmacist@example.test', role: 'pharmacist', status: 'active', lastLoginAt: stamp('2026-10-30', 8), ...created('2026-01-02') },
  { id: id('usr', 3), name: 'Ravi Kumar', email: 'ravi.cashier@example.test', role: 'cashier', status: 'active', lastLoginAt: stamp('2026-10-29', 19), ...created('2026-01-03') },
]
const categories = categoriesSeed.map((name, i) => ({ id: id('cat', i + 1), name, description: `Fictional demo category: ${name.toLowerCase()}.`, status: 'active', ...created('2026-01-01') }))
const units = unitSeed.map(([name, code, description], i) => ({ id: id('uni', i + 1), name, code, description, status: 'active', ...created('2026-01-01') }))
const medicines = medicineSeed.map(([name, genericName, manufacturer], i) => ({
  id: id('med', i + 1), sku: `MED-${String(i + 1).padStart(4, '0')}`, name, genericName,
  categoryId: id('cat', (i % categories.length) + 1), unitId: id('uni', (i % units.length) + 1), manufacturer,
  purchasePricePaise: (650 + (i * 173 % 16500)), sellingPricePaise: (900 + (i * 241 % 24000)), gstRateBps: rates[i % rates.length],
  reorderLevel: 8 + (i % 28), requiresPrescription: i % 5 === 1 || i % 7 === 0, status: 'active', ...created('2026-01-01'),
}))
const suppliers = supplierNames.map((name, i) => ({
  id: id('sup', i + 1), name, contactName: ['Nikhil Rao', 'Prerna Shah', 'Suman Das', 'Rakesh Iyer', 'Kiran Nair'][i % 5],
  phone: `+91 90000 ${String(11000 + i).slice(-5)}`, email: `orders${i + 1}@${['sahyadri', 'deccanwellness', 'coromandeltrade', 'bluebanyan', 'induscare', 'mysoremedlink', 'crescentdrug', 'westernGhats', 'silverline', 'greenfield'][i]}.example.test`,
  gstin: `29AA${String.fromCharCode(65 + i)}C${String(10000 + i).slice(-4)}F1Z${String(i + 1).padStart(2, '0')}`, address: `${12 + i} Market Road, ${cities[i]}`, city: cities[i], status: 'active', ...created('2026-01-01'),
}))
const patients = patientNames.map((name, i) => ({ id: id('pat', i + 1), name, phone: `+91 90000 ${String(21000 + i).slice(-5)}`, email: `patient${i + 1}@example.test`, address: `${i + 2} Lake View Road`, city: cities[i % cities.length], dateOfBirth: i % 4 === 0 ? null : `19${70 + i}-0${(i % 8) + 1}-15`, status: 'active', ...created('2026-01-01') }))
const doctors = doctorNames.map((name, i) => ({ id: id('doc', i + 1), name, registrationNumber: `DEMO-KA-${String(2016 + i)}-${String(1200 + i)}`, specialization: ['General medicine', 'Paediatrics', 'Dermatology', 'Cardiology', 'Family medicine'][i % 5], phone: `+91 90000 ${String(31000 + i).slice(-5)}`, email: `clinic${i + 1}@example.test`, clinic: `${cities[i]} Family Clinic`, city: cities[i], status: 'active', ...created('2026-01-01') }))
const batches = Array.from({ length: 60 }, (_, i) => {
  const purchaseIndex = i >= 3 && i <= 30 ? Math.floor((i - 3) / 2) : -1
  const receivedOn = purchaseIndex >= 0 ? addDays('2026-02-03', purchaseIndex * 4) : i === 0 ? '2024-12-31' : i === 1 ? '2025-11-15' : i === 2 ? '2025-12-15' : '2025-01-01'
  const expiryDate = i === 0 ? '2025-12-31' : i === 1 ? '2026-11-15' : i === 2 ? '2026-12-15' : addDays('2027-01-31', (i * 13) % 900)
  return {
    id: id('bat', i + 1), batchNumber: `DEMO-B${String(i + 1).padStart(4, '0')}`, medicineId: id('med', (i % medicines.length) + 1),
    supplierId: id('sup', purchaseIndex >= 0 ? (purchaseIndex % suppliers.length) + 1 : (i % suppliers.length) + 1),
    receivedOn, expiryDate, openingQuantity: purchaseIndex >= 0 ? 0 : 32 + ((i * 17) % 72), reorderLevel: 8 + (i % 20),
    purchasePricePaise: medicines[i % medicines.length].purchasePricePaise, sellingPricePaise: medicines[i % medicines.length].sellingPricePaise,
    ...created(receivedOn),
  }
})

const purchases = []
const purchaseItems = []
for (let p = 0; p < 15; p += 1) {
  const purchaseId = id('pur', p + 1)
  const purchasedOn = addDays('2026-02-03', p * 4)
  const status = p === 14 ? 'draft' : 'received'
  const items = []
  for (let lineIndex = 0; lineIndex < 2; lineIndex += 1) {
    const itemIndex = p * 2 + lineIndex
    const batch = status === 'received' ? batches[itemIndex + 3] : null
    const medicine = batch ? medicines[(itemIndex + 3) % medicines.length] : medicines[(p * 3 + lineIndex * 7) % medicines.length]
    const financials = moneyLine(18 + ((p + lineIndex * 5) % 32), medicine.purchasePricePaise, 0, medicine.gstRateBps)
    const item = { id: id('pli', itemIndex + 1), purchaseId, medicineId: medicine.id, batchId: batch?.id ?? null, ...financials, ...created(purchasedOn) }
    items.push(item)
    purchaseItems.push(item)
  }
  const totals = totalsFor(items)
  const paidPaise = p < 8 ? totals.totalPaise : p < 10 ? Math.round(totals.totalPaise * 0.35) : 0
  purchases.push({ id: purchaseId, supplierId: id('sup', (p % suppliers.length) + 1), invoiceNumber: `DEMO-PUR-${String(p + 1).padStart(4, '0')}`, purchasedOn, status, ...totals, paidPaise, ...created(purchasedOn) })
}

const sales = []
const saleItems = []
for (let s = 0; s < 30; s += 1) {
  const saleId = id('sal', s + 1)
  const soldOn = addDays('2026-04-10', s * 2)
  const items = []
  for (let lineIndex = 0; lineIndex < 2; lineIndex += 1) {
    const itemIndex = s * 2 + lineIndex
    const batchIndex = 33 + ((itemIndex * 7) % 27)
    const batch = batches[batchIndex]
    const medicine = medicines[batchIndex % medicines.length]
    const financials = moneyLine(1 + (itemIndex % 4), medicine.sellingPricePaise, 0, medicine.gstRateBps)
    const item = { id: id('sli', itemIndex + 1), saleId, medicineId: medicine.id, batchId: batch.id, ...financials, ...created(soldOn) }
    items.push(item)
    saleItems.push(item)
  }
  const totals = totalsFor(items)
  const status = s % 4 === 0 ? 'partially_paid' : 'completed'
  const paidPaise = status === 'completed' ? totals.totalPaise : Math.floor(totals.totalPaise * 0.65)
  sales.push({ id: saleId, patientId: id('pat', (s % patients.length) + 1), doctorId: s % 3 === 0 ? id('doc', (s % doctors.length) + 1) : null, invoiceNumber: `DEMO-SAL-${String(s + 1).padStart(4, '0')}`, soldOn, status, ...totals, paidPaise, createdByUserId: id('usr', (s % users.length) + 1), ...created(soldOn) })
}

const quotations = []
const quotationItems = []
for (let q = 0; q < 10; q += 1) {
  const quotationId = id('quo', q + 1)
  const issuedOn = addDays('2026-07-01', q * 5)
  const items = []
  for (let lineIndex = 0; lineIndex < 2; lineIndex += 1) {
    const itemIndex = q * 2 + lineIndex
    const medicine = medicines[(q * 4 + lineIndex * 11) % medicines.length]
    const financials = moneyLine(1 + ((q + lineIndex) % 5), medicine.sellingPricePaise, 0, medicine.gstRateBps)
    const item = { id: id('qli', itemIndex + 1), quotationId, medicineId: medicine.id, ...financials, ...created(issuedOn) }
    items.push(item)
    quotationItems.push(item)
  }
  const totals = totalsFor(items)
  const validDays = q % 3 === 0 ? 14 : 30
  quotations.push({ id: quotationId, patientId: id('pat', (q % patients.length) + 1), quotationNumber: `DEMO-QUO-${String(q + 1).padStart(4, '0')}`, issuedOn, validUntil: addDays(issuedOn, validDays), status: ['accepted', 'sent', 'draft', 'expired', 'rejected'][q % 5], ...totals, createdByUserId: id('usr', (q % users.length) + 1), ...created(issuedOn) })
}

const payments = []
for (const sale of sales) {
  payments.push({ id: id('pay', payments.length + 1), direction: 'received', partyType: 'patient', partyId: sale.patientId, transactionType: 'sale', transactionId: sale.id, method: methods[payments.length % methods.length], amountPaise: sale.paidPaise, reference: `DEMO-REC-${String(payments.length + 1).padStart(4, '0')}`, status: 'completed', paidOn: sale.soldOn, ...created(sale.soldOn) })
}
for (const purchase of purchases.slice(0, 10)) {
  payments.push({ id: id('pay', payments.length + 1), direction: 'paid', partyType: 'supplier', partyId: purchase.supplierId, transactionType: 'purchase', transactionId: purchase.id, method: methods[payments.length % methods.length], amountPaise: purchase.paidPaise, reference: `DEMO-PAY-${String(payments.length + 1).padStart(4, '0')}`, status: 'completed', paidOn: purchase.purchasedOn, ...created(purchase.purchasedOn) })
}

const expenses = Array.from({ length: 20 }, (_, i) => {
  const incurredOn = addDays('2026-01-05', i * 13)
  return { id: id('exp', i + 1), category: ['rent', 'utilities', 'supplies', 'salary', 'maintenance', 'transport', 'other'][i % 7], description: ['Shop rent', 'Electricity bill', 'Receipt rolls and bags', 'Staff wages', 'Display shelf repair', 'Local delivery fuel', 'Cleaning supplies'][i % 7], incurredOn, amountPaise: 85000 + ((i * 23817) % 650000), method: methods[i % methods.length], reference: `DEMO-EXP-${String(i + 1).padStart(4, '0')}`, notes: i % 4 === 0 ? 'Fictional demonstration entry.' : '', paidInCash: i < 10, ...created(incurredOn) }
})
const adjustments = []
const adjustmentLineCounts = [2, 2, 1, 1, 1, 1, 1, 1, 1, 1]
const stockAfterTransactions = new Map(batches.map((batch) => [batch.id, batch.openingQuantity]))
for (const item of purchaseItems) {
  const purchase = purchases.find((candidate) => candidate.id === item.purchaseId)
  if (purchase.status === 'received' && item.batchId) stockAfterTransactions.set(item.batchId, stockAfterTransactions.get(item.batchId) + item.quantity)
}
for (const item of saleItems) stockAfterTransactions.set(item.batchId, stockAfterTransactions.get(item.batchId) - item.quantity)
for (let a = 0; a < 10; a += 1) {
  const adjustedOn = addDays('2026-06-20', a * 2)
  const lines = []
  for (let n = 0; n < adjustmentLineCounts[a]; n += 1) {
    const batch = batches[adjustments.reduce((count, previous) => count + previous.lines.length, 0) + n]
    const current = stockAfterTransactions.get(batch.id)
    const target = batch.id === id('bat', 1) ? 3 : batch.id === id('bat', 4) ? 2 : null
    const quantityDelta = target === null ? (a % 2 === 0 ? 1 : -1) : target - current
    lines.push({ batchId: batch.id, medicineId: batch.medicineId, quantityDelta, reason: a % 2 === 0 ? 'Cycle count reconciliation' : 'Damaged pack write-off' })
    stockAfterTransactions.set(batch.id, current + quantityDelta)
  }
  adjustments.push({ id: id('adj', a + 1), adjustmentNumber: `DEMO-ADJ-${String(a + 1).padStart(4, '0')}`, status: 'completed', reason: a % 2 === 0 ? 'Routine stock count' : 'Damaged or missing stock', createdByUserId: id('usr', a % users.length + 1), adjustedOn, lines, ...created(adjustedOn) })
}

const stockMovements = []
for (const item of purchaseItems) {
  const purchase = purchases.find((candidate) => candidate.id === item.purchaseId)
  if (purchase.status !== 'received' || !item.batchId) continue
  stockMovements.push({ id: id('mov', stockMovements.length + 1), movementType: 'purchase_receipt', sourceId: purchase.id, batchId: item.batchId, medicineId: item.medicineId, quantityDelta: item.quantity, occurredAt: stamp(purchase.purchasedOn), ...created(purchase.purchasedOn) })
}
for (const item of saleItems) {
  const sale = sales.find((candidate) => candidate.id === item.saleId)
  stockMovements.push({ id: id('mov', stockMovements.length + 1), movementType: 'sale', sourceId: sale.id, batchId: item.batchId, medicineId: item.medicineId, quantityDelta: -item.quantity, occurredAt: stamp(sale.soldOn), ...created(sale.soldOn) })
}
for (const adjustment of adjustments) {
  for (const line of adjustment.lines) stockMovements.push({ id: id('mov', stockMovements.length + 1), movementType: 'adjustment', sourceId: adjustment.id, batchId: line.batchId, medicineId: line.medicineId, quantityDelta: line.quantityDelta, occurredAt: stamp(adjustment.adjustedOn), ...created(adjustment.adjustedOn) })
}

const cashBookEntries = payments.map((payment, i) => ({
  id: id('cbe', i + 1), entryType: payment.direction === 'received' ? 'inflow' : 'outflow', amountPaise: payment.amountPaise,
  occurredOn: payment.paidOn, description: `${payment.transactionType === 'sale' ? 'Sale receipt' : 'Supplier payment'} ${payment.transactionId}`, paymentId: payment.id, expenseId: null, ...created(payment.paidOn),
}))
for (const expense of expenses.slice(0, 10)) cashBookEntries.push({
  id: id('cbe', cashBookEntries.length + 1), entryType: 'outflow', amountPaise: expense.amountPaise, occurredOn: expense.incurredOn,
  description: expense.description, paymentId: null, expenseId: expense.id, ...created(expense.incurredOn),
})

const openingDate = '2026-01-01'
const pharmacySettings = { id: 'set_pharmacy', name: 'Med Easy Demo Pharmacy', legalName: 'Med Easy Fictional Healthcare LLP', phone: '+91 80000 10000', email: 'hello@medeasy.example.test', address: '18 Sample Market Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001', gstin: '29AABCM1234F1Z5', currency: 'INR', openingStockAsOf: openingDate, createdAt: stamp(openingDate), updatedAt: stamp('2026-10-01') }
const taxSettings = { id: 'set_tax', currency: 'INR', taxInclusivePricing: false, rates: rates.map((rateBps) => ({ name: `${rateBps / 100}% sample GST`, rateBps, enabled: true })), createdAt: stamp(openingDate), updatedAt: stamp('2026-10-01') }
const invoiceSettings = { id: 'set_invoice', salePrefix: 'DEMO-SAL', purchasePrefix: 'DEMO-PUR', quotationPrefix: 'DEMO-QUO', nextSaleNumber: 31, nextPurchaseNumber: 16, nextQuotationNumber: 11, showGstBreakdown: true, footer: 'Fictional demonstration invoice. Sample tax rates are not tax guidance.', createdAt: stamp(openingDate), updatedAt: stamp('2026-10-01') }
const inventorySettings = { id: 'set_inventory', lowStockAlertsEnabled: true, nearExpiryAlertsEnabled: true, nearExpiryDays: 90, createdAt: stamp(openingDate), updatedAt: stamp('2026-10-01') }
const userPreferences = []

const files = {
  users, categories, units, medicines, suppliers, patients, doctors, batches, purchases, 'purchase-items': purchaseItems,
  sales, 'sale-items': saleItems, quotations, 'quotation-items': quotationItems, payments, expenses,
  'cash-book-entries': cashBookEntries, 'stock-movements': stockMovements, 'stock-adjustments': adjustments,
  'pharmacy-settings': pharmacySettings, 'tax-settings': taxSettings, 'invoice-settings': invoiceSettings,
  'inventory-settings': inventorySettings, 'user-preferences': userPreferences,
}
for (const [name, value] of Object.entries(files)) write(name, value)
console.log(`Generated ${Object.keys(files).length} seed files in ${seedDir}`)
