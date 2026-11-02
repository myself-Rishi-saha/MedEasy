import { createHash } from 'node:crypto'
import { z } from 'zod'
import { ApiError } from '@/lib/api/responses'
import { generateId, isValidDateOnly, calculateTaxPaise } from '@/lib/domain/server-utils'
import { getBatchQuantityOnHand, selectFefoBatch, validateSaleAgainstBatch } from '@/lib/services/inventory-service'
import { jsonStore } from '@/lib/storage/json-store'
import type {
  CashBookEntry, Expense, InventoryBatch, InvoiceSettings, Medicine, Patient, Payment, PharmacySettings,
  Purchase, PurchaseLineItem, Sale, SaleLineItem, StockMovement, Supplier, TaxSettings, User,
} from '@/lib/domain/types'

const dateOnly = z.string().refine(isValidDateOnly, 'Date must be a valid YYYY-MM-DD value')
const id = z.string().regex(/^[a-z]{3}_[a-z0-9]{3,}$/)
const paise = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const lineBase = z.object({
  medicineId: id,
  quantity: z.number().int().positive().max(100_000),
  discountPaise: paise.default(0),
})
const purchaseLineInput = lineBase.extend({
  unitPricePaise: paise,
  batchNumber: z.string().trim().min(1).max(80),
  expiryDate: dateOnly,
  reorderLevel: z.number().int().nonnegative().max(100_000).optional(),
  sellingPricePaise: paise.optional(),
}).strict()
const saleLineInput = lineBase.extend({ batchId: id.nullable().optional() }).strict()

export const purchaseDraftInputSchema = z.object({
  supplierId: id,
  purchasedOn: dateOnly,
  supplierInvoiceNumber: z.string().trim().max(100).optional(),
  lines: z.array(purchaseLineInput).min(1).max(100),
}).strict()
export const saleDraftInputSchema = z.object({
  patientId: id.nullable().optional(),
  doctorId: id.nullable().optional(),
  soldOn: dateOnly,
  placeOfSupplyState: z.string().trim().min(1).max(100).optional(),
  settlementMethod: z.enum(['cash', 'upi', 'card', 'bank_transfer', 'credit']).optional(),
  lines: z.array(saleLineInput).min(1).max(100),
}).strict()
export const quotationDraftInputSchema = z.object({
  patientId: id.nullable().optional(),
  issuedOn: dateOnly,
  validUntil: dateOnly,
  lines: z.array(lineBase.strict()).min(1).max(100),
}).strict().refine((input) => input.validUntil >= input.issuedOn, 'Validity date cannot precede issue date')
export const paymentInputSchema = z.object({
  transactionType: z.enum(['sale', 'purchase']),
  transactionId: id,
  amountPaise: paise.refine((amount) => amount > 0, 'Amount must be positive'),
  method: z.enum(['cash', 'upi', 'card', 'bank_transfer', 'credit']),
  reference: z.string().trim().min(1).max(120),
  paidOn: dateOnly,
}).strict()
export const expenseInputSchema = z.object({
  category: z.enum(['rent', 'utilities', 'supplies', 'salary', 'maintenance', 'transport', 'other']),
  description: z.string().trim().min(1).max(200),
  incurredOn: dateOnly,
  amountPaise: paise.refine((amount) => amount > 0, 'Amount must be positive'),
  method: z.enum(['cash', 'upi', 'card', 'bank_transfer', 'credit']),
  reference: z.string().trim().max(120),
  notes: z.string().max(1000),
  paidInCash: z.boolean(),
}).strict().refine((input) => !input.paidInCash || input.method === 'cash', 'Cash-book inclusion requires cash as the payment method')
export const manualCashEntryInputSchema = z.object({
  entryType: z.enum(['inflow', 'outflow']),
  amountPaise: paise.refine((amount) => amount > 0, 'Amount must be positive'),
  occurredOn: dateOnly,
  description: z.string().trim().min(1).max(200),
  reference: z.string().trim().min(1).max(120),
}).strict()
export const quotationStatusInputSchema = z.object({ status: z.enum(['sent', 'accepted', 'rejected']) }).strict()
export const saleCompletionInputSchema = z.object({
  payment: z.object({
    amountPaise: paise,
    method: z.enum(['cash', 'upi', 'card', 'bank_transfer', 'credit']),
    reference: z.string().trim().max(120).optional(),
  }).optional(),
}).strict()

const mutationCollections = [
  'users', 'medicines', 'suppliers', 'patients', 'doctors', 'batches', 'purchases', 'purchase-items',
  'sales', 'sale-items', 'quotations', 'quotation-items', 'payments', 'expenses', 'cash-book-entries',
  'stock-movements', 'stock-adjustments', 'pharmacy-settings', 'tax-settings', 'invoice-settings',
] as const

type WorkflowState = Record<string, unknown> & Record<(typeof mutationCollections)[number], unknown>
type LineInput = z.infer<typeof lineBase> & { unitPricePaise?: number; batchId?: string | null; batchNumber?: string; expiryDate?: string; reorderLevel?: number; sellingPricePaise?: number }
type PurchaseDraftInput = z.infer<typeof purchaseDraftInputSchema>
type SaleDraftInput = z.infer<typeof saleDraftInputSchema>
type QuotationDraftInput = z.infer<typeof quotationDraftInputSchema>
type PaymentInput = z.infer<typeof paymentInputSchema>
type ExpenseInput = z.infer<typeof expenseInputSchema>
type SaleCompletionInput = z.infer<typeof saleCompletionInputSchema>
type Calculation = { subtotalPaise: number; discountPaise: number; taxPaise: number; totalPaise: number }
type CalculatedLine = Calculation & {
  medicineId: string; quantity: number; unitPricePaise: number; discountPaise: number; taxRateBps: number;
  taxPaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; lineTotalPaise: number;
}

function rows<T>(state: WorkflowState, name: string) { return state[name] as T[] }
function singleton<T>(state: WorkflowState, name: string) { return state[name] as T }
function nowIso() { return new Date().toISOString() }
function today() { return nowIso().slice(0, 10) }
function hash(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }
function validKey(key: string | null | undefined) {
  if (!key || !/^[A-Za-z0-9._:-]{1,200}$/.test(key)) throw new ApiError(400, 'INVALID_REQUEST', 'A valid Idempotency-Key header is required')
  return key
}
function replay<T extends { idempotencyKey?: string; requestHash?: string }>(records: T[], key: string, fingerprint: string) {
  const prior = records.find((record) => record.idempotencyKey === key)
  if (!prior) return null
  if (prior.requestHash !== fingerprint) throw new ApiError(409, 'CONFLICT', 'This idempotency key was already used for a different request')
  return prior
}
function stripPrivate<T extends Record<string, unknown>>(record: T) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !/[Ii]dempotencyKey|[Hh]ash/.test(key))) as T
}
function assertSafeAmount(amount: number, label: string) {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new ApiError(422, 'VALIDATION_ERROR', `${label} must be a non-negative safe integer in paise`)
}
function currentState<T>(value: unknown, label: string): T {
  if (!value || typeof value !== 'object') throw new ApiError(500, 'INTERNAL_ERROR', `Configured ${label} is unavailable`)
  return value as T
}

async function mutate<T>(operation: (state: WorkflowState) => T | Promise<T>) {
  let result: T
  await jsonStore.updateMany<WorkflowState>(mutationCollections, async (state) => {
    result = await operation(state)
    return state
  })
  return structuredClone(result!)
}

function requireRecord<T>(records: T[], recordId: string, label: string) {
  const record = records.find((entry) => typeof entry === 'object' && entry !== null && 'id' in entry && entry.id === recordId)
  if (!record) throw new ApiError(404, 'NOT_FOUND', `${label} not found`)
  return record
}
function nextInvoice(settings: InvoiceSettings, kind: 'sale' | 'purchase' | 'quotation') {
  const prefix = kind === 'sale' ? settings.salePrefix : kind === 'purchase' ? settings.purchasePrefix : settings.quotationPrefix
  const number = kind === 'sale' ? settings.nextSaleNumber : kind === 'purchase' ? settings.nextPurchaseNumber : settings.nextQuotationNumber
  if (kind === 'sale') settings.nextSaleNumber += 1
  else if (kind === 'purchase') settings.nextPurchaseNumber += 1
  else settings.nextQuotationNumber += 1
  return `${prefix}-${String(number).padStart(4, '0')}`
}
function assertTaxRateEnabled(medicine: Medicine, settings: TaxSettings) {
  const rate = medicine.gstRateBps
  if (!settings.rates.some((entry) => entry.enabled && entry.rateBps === rate)) {
    throw new ApiError(409, 'CONFLICT', `GST rate ${rate} bps for ${medicine.name} is not enabled in tax settings`)
  }
  return rate
}
const gstStateNames: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura',
  '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra',
  '28': 'Andhra Pradesh', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
  '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
}
function normalizeState(state: string) {
  const value = state.trim().toLocaleLowerCase('en-IN')
  return (gstStateNames[state.trim()] ?? value).toLocaleLowerCase('en-IN')
}
function isIntraState(state: string, pharmacy: PharmacySettings, supplier?: Supplier) {
  if (supplier) return supplier.gstin.slice(0, 2) === pharmacy.gstin.slice(0, 2)
  return normalizeState(state) === normalizeState(pharmacy.state)
}
function customerState(state: WorkflowState, patientId: string | null | undefined) {
  return patientId ? rows<Patient>(state, 'patients').find((patient) => patient.id === patientId)?.state : undefined
}
function calculateLine(input: LineInput, medicine: Medicine, unitPricePaise: number, taxRateBps: number, inclusive: boolean, intraState: boolean): CalculatedLine {
  assertSafeAmount(unitPricePaise, 'Unit price')
  assertSafeAmount(input.discountPaise, 'Discount')
  const grossPaise = input.quantity * unitPricePaise
  if (!Number.isSafeInteger(grossPaise) || input.discountPaise > grossPaise) throw new ApiError(422, 'VALIDATION_ERROR', 'Discount cannot exceed the line amount')
  const afterDiscount = grossPaise - input.discountPaise
  const taxPaise = inclusive
    ? Math.round(afterDiscount * taxRateBps / (10_000 + taxRateBps))
    : calculateTaxPaise(afterDiscount, taxRateBps)
  const subtotalPaise = inclusive ? afterDiscount - taxPaise : afterDiscount
  const totalPaise = inclusive ? afterDiscount : subtotalPaise + taxPaise
  const cgstPaise = intraState ? Math.floor(taxPaise / 2) : 0
  const sgstPaise = intraState ? taxPaise - cgstPaise : 0
  const igstPaise = intraState ? 0 : taxPaise
  return {
    medicineId: medicine.id, quantity: input.quantity, unitPricePaise, discountPaise: input.discountPaise,
    taxRateBps, taxPaise, cgstPaise, sgstPaise, igstPaise, subtotalPaise, lineTotalPaise: totalPaise,
    totalPaise,
  }
}
function totals(lines: Array<{ subtotalPaise: number; discountPaise: number; taxPaise: number; lineTotalPaise: number }>): Calculation {
  return lines.reduce((sum, line) => ({
    subtotalPaise: sum.subtotalPaise + line.subtotalPaise,
    discountPaise: sum.discountPaise + line.discountPaise,
    taxPaise: sum.taxPaise + line.taxPaise,
    totalPaise: sum.totalPaise + line.lineTotalPaise,
  }), { subtotalPaise: 0, discountPaise: 0, taxPaise: 0, totalPaise: 0 })
}
function makeItem<T extends { id: string; createdAt: string; updatedAt: string }>(prefix: 'pli' | 'sli' | 'qli', now: string, fields: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): T {
  return { ...fields, id: generateId(prefix), createdAt: now, updatedAt: now } as T
}
function makePayment(state: WorkflowState, input: {
  direction: Payment['direction']; partyType: Payment['partyType']; partyId: string | null; transactionType: Payment['transactionType'];
  transactionId: string; amountPaise: number; method: Payment['method']; reference: string; paidOn: string; idempotencyKey?: string; requestHash?: string;
}) {
  const timestamp = nowIso()
  const payment: Payment = { ...input, id: generateId('pay'), status: 'completed', createdAt: timestamp, updatedAt: timestamp }
  rows<Payment>(state, 'payments').push(payment)
  const cashEntry: CashBookEntry = {
    id: generateId('cbe'), entryType: input.direction === 'received' ? 'inflow' : 'outflow', amountPaise: input.amountPaise,
    occurredOn: input.paidOn, description: `${input.direction === 'received' ? 'Customer receipt' : 'Supplier payment'} ${input.transactionId}`,
    paymentId: payment.id, expenseId: null, reference: input.reference, createdAt: timestamp, updatedAt: timestamp,
  }
  rows<CashBookEntry>(state, 'cash-book-entries').push(cashEntry)
  return payment
}
function detail(state: WorkflowState, kind: 'purchase' | 'sale' | 'quotation', record: Purchase | Sale | Record<string, any>) {
  const pharmacy = currentState<PharmacySettings>(singleton(state, 'pharmacy-settings'), 'pharmacy profile')
  const invoiceSettings = currentState<InvoiceSettings>(singleton(state, 'invoice-settings'), 'invoice settings')
  const presentation = {
    pharmacyProfile: { name: pharmacy.name, legalName: pharmacy.legalName, address: pharmacy.address, city: pharmacy.city, state: pharmacy.state, phone: pharmacy.phone, gstin: pharmacy.gstin },
    invoicePresentation: { showGstBreakdown: invoiceSettings.showGstBreakdown, footer: invoiceSettings.footer },
  }
  if (kind === 'purchase') {
    const purchase = record as Purchase
    return { ...presentation, purchase: stripPrivate(purchase as unknown as Record<string, unknown>), items: rows<PurchaseLineItem>(state, 'purchase-items').filter((item) => item.purchaseId === purchase.id), payments: rows<Payment>(state, 'payments').filter((payment) => payment.transactionId === purchase.id) }
  }
  if (kind === 'sale') {
    const sale = record as Sale
    return { ...presentation, sale: stripPrivate(sale as unknown as Record<string, unknown>), items: rows<SaleLineItem>(state, 'sale-items').filter((item) => item.saleId === sale.id), payments: rows<Payment>(state, 'payments').filter((payment) => payment.transactionId === sale.id) }
  }
  const quotation = record as Record<string, any>
  return { ...presentation, quotation: stripPrivate(quotation), items: rows<Record<string, any>>(state, 'quotation-items').filter((item) => item.quotationId === quotation.id), convertedSaleId: quotation.convertedSaleId ?? null }
}
function assertMedicine(state: WorkflowState, medicineId: string) {
  const medicine = requireRecord(rows<Medicine>(state, 'medicines'), medicineId, 'Medicine')
  if (medicine.status !== 'active') throw new ApiError(409, 'CONFLICT', 'Inactive medicines cannot be added to a new transaction')
  return medicine
}
function assertParty(state: WorkflowState, patientId: string | null | undefined, doctorId?: string | null) {
  if (patientId) {
    const patient = requireRecord(rows<Record<string, any>>(state, 'patients'), patientId, 'Customer')
    if (patient.status !== 'active') throw new ApiError(409, 'CONFLICT', 'Inactive customers cannot be selected')
  }
  if (doctorId) {
    const doctor = requireRecord(rows<Record<string, any>>(state, 'doctors'), doctorId, 'Doctor')
    if (doctor.status !== 'active') throw new ApiError(409, 'CONFLICT', 'Inactive doctors cannot be selected')
  }
}

function prepareFinancialLines<T extends LineInput>(state: WorkflowState, lines: T[], context: { inclusive: boolean; intraState: boolean; priceFor: (line: T, medicine: Medicine) => number; rateFor?: (medicine: Medicine) => number }) {
  const medicines = rows<Medicine>(state, 'medicines')
  const tax = currentState<TaxSettings>(singleton(state, 'tax-settings'), 'tax settings')
  return lines.map((line) => {
    const medicine = assertMedicine(state, line.medicineId)
    const price = context.priceFor(line, medicine)
    const rate = context.rateFor ? context.rateFor(medicine) : assertTaxRateEnabled(medicine, tax)
    const calculated = calculateLine(line, medicine, price, rate, context.inclusive, context.intraState)
    return { medicine, calculated }
  })
}

export async function createPurchaseDraft(raw: PurchaseDraftInput, user: User, keyHeader: string | null) {
  const input = purchaseDraftInputSchema.parse(raw)
  const key = validKey(keyHeader)
  const fingerprint = hash({ userId: user.id, input })
  return mutate((state) => {
    const purchases = rows<Purchase>(state, 'purchases')
    const existing = replay(purchases, key, fingerprint)
    if (existing) return detail(state, 'purchase', existing)
    const supplier = requireRecord(rows<Supplier>(state, 'suppliers'), input.supplierId, 'Supplier')
    if (supplier.status !== 'active') throw new ApiError(409, 'CONFLICT', 'Inactive suppliers cannot receive a new purchase')
    const settings = currentState<InvoiceSettings>(singleton(state, 'invoice-settings'), 'invoice settings')
    const pharmacy = currentState<PharmacySettings>(singleton(state, 'pharmacy-settings'), 'pharmacy profile')
    const tax = currentState<TaxSettings>(singleton(state, 'tax-settings'), 'tax settings')
    const priorItems = rows<PurchaseLineItem>(state, 'purchase-items')
    const sameSupplierBatch = (line: z.infer<typeof purchaseLineInput>) =>
      priorItems.some((item) => item.batchNumber?.toLocaleLowerCase() === line.batchNumber.toLocaleLowerCase() && rows<Purchase>(state, 'purchases').some((purchase) => purchase.id === item.purchaseId && purchase.supplierId === supplier.id))
    if (input.lines.some(sameSupplierBatch)) throw new ApiError(409, 'CONFLICT', 'A purchase line already uses this supplier batch number')
    if (new Set(input.lines.map((line) => line.batchNumber.toLocaleLowerCase())).size !== input.lines.length) throw new ApiError(422, 'VALIDATION_ERROR', 'Each purchase line must have a unique batch number')
    const now = nowIso()
    const purchaseId = generateId('pur')
    const calculated = prepareFinancialLines(state, input.lines, {
      inclusive: tax.taxInclusivePricing,
      intraState: isIntraState(supplier.city, pharmacy, supplier),
      priceFor: (line) => line.unitPricePaise,
    })
    input.lines.forEach((line, index) => {
      if (line.expiryDate <= input.purchasedOn) throw new ApiError(422, 'VALIDATION_ERROR', 'Batch expiry must be after the purchase date')
      const calc = calculated[index].calculated
      const item = makeItem<PurchaseLineItem>('pli', now, {
        purchaseId, medicineId: calc.medicineId, batchId: null, batchNumber: line.batchNumber, expiryDate: line.expiryDate,
        reorderLevel: line.reorderLevel ?? calculated[index].medicine.reorderLevel,
        sellingPricePaise: line.sellingPricePaise ?? calculated[index].medicine.sellingPricePaise,
        quantity: calc.quantity, unitPricePaise: calc.unitPricePaise, discountPaise: calc.discountPaise,
        taxRateBps: calc.taxRateBps, taxPaise: calc.taxPaise, cgstPaise: calc.cgstPaise, sgstPaise: calc.sgstPaise,
        igstPaise: calc.igstPaise, lineTotalPaise: calc.lineTotalPaise,
      })
      rows<PurchaseLineItem>(state, 'purchase-items').push(item)
    })
    const items = rows<PurchaseLineItem>(state, 'purchase-items').filter((item) => item.purchaseId === purchaseId)
    const amount = totals(items.map((item) => ({ subtotalPaise: item.quantity * item.unitPricePaise - item.discountPaise, discountPaise: item.discountPaise, taxPaise: item.taxPaise, lineTotalPaise: item.lineTotalPaise })))
    const purchase: Purchase = {
      id: purchaseId, supplierId: supplier.id, invoiceNumber: nextInvoice(settings, 'purchase'),
      ...(input.supplierInvoiceNumber ? { supplierInvoiceNumber: input.supplierInvoiceNumber } : {}), purchasedOn: input.purchasedOn,
      status: 'draft', ...amount, paidPaise: 0, createdAt: now, updatedAt: now, idempotencyKey: key, requestHash: fingerprint,
    }
    void pharmacy
    void tax
    purchases.push(purchase)
    return detail(state, 'purchase', purchase)
  })
}

export async function updatePurchaseDraft(purchaseId: string, raw: PurchaseDraftInput) {
  const input = purchaseDraftInputSchema.parse(raw)
  return mutate((state) => {
    const purchase = requireRecord(rows<Purchase>(state, 'purchases'), purchaseId, 'Purchase')
    if (purchase.status !== 'draft') throw new ApiError(409, 'CONFLICT', 'Only draft purchases can be edited')
    const supplier = requireRecord(rows<Supplier>(state, 'suppliers'), input.supplierId, 'Supplier')
    const settings = currentState<PharmacySettings>(singleton(state, 'pharmacy-settings'), 'pharmacy profile')
    const tax = currentState<TaxSettings>(singleton(state, 'tax-settings'), 'tax settings')
    const calculated = prepareFinancialLines(state, input.lines, { inclusive: tax.taxInclusivePricing, intraState: isIntraState(supplier.city, settings, supplier), priceFor: (line) => line.unitPricePaise })
    const now = nowIso()
    const nextItems = input.lines.map((line, index) => {
      if (line.expiryDate <= input.purchasedOn) throw new ApiError(422, 'VALIDATION_ERROR', 'Batch expiry must be after the purchase date')
      const calc = calculated[index].calculated
      return makeItem<PurchaseLineItem>('pli', now, {
        purchaseId, medicineId: calc.medicineId, batchId: null, batchNumber: line.batchNumber, expiryDate: line.expiryDate,
        reorderLevel: line.reorderLevel ?? calculated[index].medicine.reorderLevel,
        sellingPricePaise: line.sellingPricePaise ?? calculated[index].medicine.sellingPricePaise,
        quantity: calc.quantity, unitPricePaise: calc.unitPricePaise, discountPaise: calc.discountPaise,
        taxRateBps: calc.taxRateBps, taxPaise: calc.taxPaise, cgstPaise: calc.cgstPaise, sgstPaise: calc.sgstPaise,
        igstPaise: calc.igstPaise, lineTotalPaise: calc.lineTotalPaise,
      })
    })
    const amount = totals(nextItems.map((item) => ({ subtotalPaise: item.quantity * item.unitPricePaise - item.discountPaise, discountPaise: item.discountPaise, taxPaise: item.taxPaise, lineTotalPaise: item.lineTotalPaise })))
    const items = rows<PurchaseLineItem>(state, 'purchase-items')
    state['purchase-items'] = items.filter((item) => item.purchaseId !== purchaseId) as unknown[]
    rows<PurchaseLineItem>(state, 'purchase-items').push(...nextItems)
    Object.assign(purchase, { supplierId: supplier.id, purchasedOn: input.purchasedOn, supplierInvoiceNumber: input.supplierInvoiceNumber, ...amount, updatedAt: now })
    return detail(state, 'purchase', purchase)
  })
}

export async function receivePurchase(purchaseId: string, keyHeader: string | null) {
  const key = validKey(keyHeader)
  const fingerprint = hash({ purchaseId, action: 'receive' })
  return mutate((state) => {
    const purchase = requireRecord(rows<Purchase>(state, 'purchases'), purchaseId, 'Purchase')
    if (purchase.status === 'received') {
      if (purchase.receiptIdempotencyKey !== key || purchase.receiptRequestHash !== fingerprint) throw new ApiError(409, 'CONFLICT', 'This purchase has already been received')
      return detail(state, 'purchase', purchase)
    }
    if (purchase.status !== 'draft') throw new ApiError(409, 'CONFLICT', 'Only draft purchases can be received')
    const supplier = requireRecord(rows<Supplier>(state, 'suppliers'), purchase.supplierId, 'Supplier')
    const items = rows<PurchaseLineItem>(state, 'purchase-items').filter((item) => item.purchaseId === purchase.id)
    if (!items.length) throw new ApiError(409, 'CONFLICT', 'A purchase must contain items before it can be received')
    const batches = rows<InventoryBatch>(state, 'batches')
    for (const item of items) {
      if (batches.some((batch) => batch.supplierId === supplier.id && batch.batchNumber.toLocaleLowerCase() === item.batchNumber?.toLocaleLowerCase())) {
        throw new ApiError(409, 'CONFLICT', `Batch ${item.batchNumber} already exists for this supplier`)
      }
    }
    const now = nowIso()
    const movements = rows<StockMovement>(state, 'stock-movements')
    const updatedItems = items.map((item) => {
      const batch: InventoryBatch = {
        id: generateId('bat'), batchNumber: item.batchNumber!, medicineId: item.medicineId, supplierId: supplier.id,
        receivedOn: purchase.purchasedOn, expiryDate: item.expiryDate!, openingQuantity: 0, reorderLevel: item.reorderLevel ?? 0,
        purchasePricePaise: item.unitPricePaise, sellingPricePaise: item.sellingPricePaise ?? 0, createdAt: now, updatedAt: now,
      }
      batches.push(batch)
      movements.push({
        id: generateId('mov'), movementType: 'purchase_receipt', sourceId: purchase.id, batchId: batch.id,
        medicineId: batch.medicineId, quantityDelta: item.quantity, occurredAt: now, createdAt: now, updatedAt: now,
      })
      const updated = { ...item, batchId: batch.id, updatedAt: now }
      return updated
    })
    const purchaseItems = rows<PurchaseLineItem>(state, 'purchase-items')
    state['purchase-items'] = purchaseItems.map((item) => updatedItems.find((updated) => updated.id === item.id) ?? item) as unknown[]
    Object.assign(purchase, { status: 'received', receiptIdempotencyKey: key, receiptRequestHash: fingerprint, updatedAt: now })
    return detail(state, 'purchase', purchase)
  })
}

export async function cancelPurchase(purchaseId: string, keyHeader: string | null) {
  const key = validKey(keyHeader)
  const fingerprint = hash({ purchaseId, action: 'cancel' })
  return mutate((state) => {
    const purchase = requireRecord(rows<Purchase>(state, 'purchases'), purchaseId, 'Purchase')
    if (purchase.status === 'cancelled') {
      if (purchase.cancellationIdempotencyKey !== key || purchase.cancellationRequestHash !== fingerprint) throw new ApiError(409, 'CONFLICT', 'This purchase has already been cancelled')
      return detail(state, 'purchase', purchase)
    }
    if (purchase.status === 'draft') {
      Object.assign(purchase, { status: 'cancelled', cancellationIdempotencyKey: key, cancellationRequestHash: fingerprint, updatedAt: nowIso() })
      return detail(state, 'purchase', purchase)
    }
    if (purchase.paidPaise > 0 || rows<Payment>(state, 'payments').some((payment) => payment.transactionId === purchase.id)) {
      throw new ApiError(409, 'CONFLICT', 'A purchase with supplier payments cannot be reversed until a refund workflow is recorded')
    }
    const items = rows<PurchaseLineItem>(state, 'purchase-items').filter((item) => item.purchaseId === purchase.id)
    const batches = rows<InventoryBatch>(state, 'batches')
    const movements = rows<StockMovement>(state, 'stock-movements')
    const now = nowIso()
    for (const item of items) {
      const batch = requireRecord(batches, item.batchId ?? '', 'Received batch')
      const history = movements.filter((movement) => movement.batchId === batch.id)
      if (history.some((movement) => movement.sourceId !== purchase.id || movement.movementType !== 'purchase_receipt')) {
        throw new ApiError(409, 'CONFLICT', 'Received stock has subsequent movements and cannot be reversed')
      }
      const available = getBatchQuantityOnHand(batch, history)
      if (available < item.quantity) throw new ApiError(409, 'CONFLICT', 'Not enough stock remains to reverse this purchase')
    }
    for (const item of items) movements.push({
      id: generateId('mov'), movementType: 'purchase_reversal', sourceId: purchase.id, batchId: item.batchId!,
      medicineId: item.medicineId, quantityDelta: -item.quantity, occurredAt: now, createdAt: now, updatedAt: now,
    })
    Object.assign(purchase, { status: 'cancelled', cancellationIdempotencyKey: key, cancellationRequestHash: fingerprint, updatedAt: now })
    return detail(state, 'purchase', purchase)
  })
}

async function createSaleLikeDraft(kind: 'sale' | 'quotation', raw: SaleDraftInput | QuotationDraftInput, user: User, keyHeader: string | null) {
  const input = kind === 'sale' ? saleDraftInputSchema.parse(raw) : quotationDraftInputSchema.parse(raw)
  const key = validKey(keyHeader)
  const fingerprint = hash({ userId: user.id, kind, input })
  return mutate((state) => {
    const records = rows<Record<string, any>>(state, kind === 'sale' ? 'sales' : 'quotations')
    const existing = replay(records, key, fingerprint)
    if (existing) return detail(state, kind, existing)
    assertParty(state, input.patientId, kind === 'sale' ? (input as SaleDraftInput).doctorId : null)
    const pharmacy = currentState<PharmacySettings>(singleton(state, 'pharmacy-settings'), 'pharmacy profile')
    const tax = currentState<TaxSettings>(singleton(state, 'tax-settings'), 'tax settings')
    const invoiceSettings = currentState<InvoiceSettings>(singleton(state, 'invoice-settings'), 'invoice settings')
    const soldOn = kind === 'sale' ? (input as SaleDraftInput).soldOn : (input as QuotationDraftInput).issuedOn
    const place = kind === 'sale' ? (input as SaleDraftInput).placeOfSupplyState ?? pharmacy.state : pharmacy.state
    const prepared = prepareFinancialLines(state, input.lines, {
      inclusive: tax.taxInclusivePricing,
      intraState: isIntraState(place, pharmacy),
      priceFor: (line, medicine) => {
        const selected = kind === 'sale' ? (line as z.infer<typeof saleLineInput>).batchId : null
        if (!selected) return medicine.sellingPricePaise
        const batch = requireRecord(rows<InventoryBatch>(state, 'batches'), selected, 'Batch')
        if (batch.medicineId !== medicine.id || batch.expiryDate < soldOn) throw new ApiError(422, 'VALIDATION_ERROR', 'Selected batch does not match the medicine or is expired')
        return batch.sellingPricePaise
      },
    })
    const now = nowIso()
    const recordId = generateId(kind === 'sale' ? 'sal' : 'quo')
    const items = prepared.map(({ calculated }, index) => {
      if (kind === 'sale') {
        const line = input.lines[index]!
        return makeItem<SaleLineItem>('sli', now, {
          saleId: recordId, medicineId: calculated.medicineId, batchId: (line as z.infer<typeof saleLineInput>).batchId ?? null,
          quantity: calculated.quantity, unitPricePaise: calculated.unitPricePaise, discountPaise: calculated.discountPaise,
          taxRateBps: calculated.taxRateBps, taxPaise: calculated.taxPaise, cgstPaise: calculated.cgstPaise,
          sgstPaise: calculated.sgstPaise, igstPaise: calculated.igstPaise, lineTotalPaise: calculated.lineTotalPaise,
        })
      }
      return makeItem<any>('qli', now, {
        quotationId: recordId, medicineId: calculated.medicineId, quantity: calculated.quantity,
        unitPricePaise: calculated.unitPricePaise, discountPaise: calculated.discountPaise, taxRateBps: calculated.taxRateBps,
        taxPaise: calculated.taxPaise, cgstPaise: calculated.cgstPaise, sgstPaise: calculated.sgstPaise,
        igstPaise: calculated.igstPaise, lineTotalPaise: calculated.lineTotalPaise,
      })
    })
    const amount = totals(prepared.map(({ calculated }) => ({ ...calculated, lineTotalPaise: calculated.lineTotalPaise })))
    if (kind === 'sale') {
      const saleInput = input as SaleDraftInput
      const sale: Sale = {
        id: recordId, patientId: saleInput.patientId ?? null, doctorId: saleInput.doctorId ?? null,
        invoiceNumber: nextInvoice(invoiceSettings, 'sale'), soldOn, status: 'draft', ...amount, paidPaise: 0,
        createdByUserId: user.id, placeOfSupplyState: place, settlementMethod: saleInput.settlementMethod,
        sourceQuotationId: null, createdAt: now, updatedAt: now, idempotencyKey: key, requestHash: fingerprint,
      }
      rows<Sale>(state, 'sales').push(sale)
      rows<SaleLineItem>(state, 'sale-items').push(...items as SaleLineItem[])
      return detail(state, 'sale', sale)
    }
    const quoteInput = input as QuotationDraftInput
    const quotation = {
      id: recordId, patientId: quoteInput.patientId ?? null, quotationNumber: nextInvoice(invoiceSettings, 'quotation'),
      issuedOn: quoteInput.issuedOn, validUntil: quoteInput.validUntil, status: 'draft', ...amount,
      createdByUserId: user.id, convertedSaleId: null, createdAt: now, updatedAt: now, idempotencyKey: key, requestHash: fingerprint,
    }
    rows<Record<string, any>>(state, 'quotations').push(quotation)
    rows<Record<string, any>>(state, 'quotation-items').push(...items)
    return detail(state, 'quotation', quotation)
  })
}

export const createSaleDraft = (input: SaleDraftInput, user: User, key: string | null) => createSaleLikeDraft('sale', input, user, key)
export const createQuotationDraft = (input: QuotationDraftInput, user: User, key: string | null) => createSaleLikeDraft('quotation', input, user, key)

export async function updateSaleDraft(saleId: string, raw: SaleDraftInput) {
  const input = saleDraftInputSchema.parse(raw)
  return mutate((state) => {
    const sale = requireRecord(rows<Sale>(state, 'sales'), saleId, 'Sale')
    if (sale.status !== 'draft') throw new ApiError(409, 'CONFLICT', 'Only draft sales can be edited')
    assertParty(state, input.patientId, input.doctorId)
    const pharmacy = currentState<PharmacySettings>(singleton(state, 'pharmacy-settings'), 'pharmacy profile')
    const tax = currentState<TaxSettings>(singleton(state, 'tax-settings'), 'tax settings')
    const place = input.placeOfSupplyState ?? pharmacy.state
    const prepared = prepareFinancialLines(state, input.lines, {
      inclusive: tax.taxInclusivePricing, intraState: isIntraState(place, pharmacy),
      priceFor: (line, medicine) => {
        const batchId = line.batchId
        if (!batchId) return medicine.sellingPricePaise
        const batch = requireRecord(rows<InventoryBatch>(state, 'batches'), batchId, 'Batch')
        if (batch.medicineId !== medicine.id || batch.expiryDate < input.soldOn) throw new ApiError(422, 'VALIDATION_ERROR', 'Selected batch does not match the medicine or is expired')
        return batch.sellingPricePaise
      },
    })
    const now = nowIso()
    const newLines = prepared.map(({ calculated }, index) => makeItem<SaleLineItem>('sli', now, {
      saleId, medicineId: calculated.medicineId, batchId: input.lines[index].batchId ?? null,
      quantity: calculated.quantity, unitPricePaise: calculated.unitPricePaise, discountPaise: calculated.discountPaise,
      taxRateBps: calculated.taxRateBps, taxPaise: calculated.taxPaise, cgstPaise: calculated.cgstPaise,
      sgstPaise: calculated.sgstPaise, igstPaise: calculated.igstPaise, lineTotalPaise: calculated.lineTotalPaise,
    }))
    const amount = totals(prepared.map(({ calculated }) => ({ ...calculated, lineTotalPaise: calculated.lineTotalPaise })))
    const saleLines = rows<SaleLineItem>(state, 'sale-items')
    state['sale-items'] = saleLines.filter((item) => item.saleId !== saleId) as unknown[]
    rows<SaleLineItem>(state, 'sale-items').push(...newLines)
    Object.assign(sale, { patientId: input.patientId ?? null, doctorId: input.doctorId ?? null, soldOn: input.soldOn, placeOfSupplyState: place, settlementMethod: input.settlementMethod, ...amount, updatedAt: now })
    return detail(state, 'sale', sale)
  })
}

function recordPaymentInState(state: WorkflowState, input: PaymentInput, userId: string, key: string, fingerprint: string) {
  const payments = rows<Payment>(state, 'payments')
  const prior = replay(payments, key, fingerprint)
  if (prior) return prior
  if (input.method === 'credit') throw new ApiError(422, 'VALIDATION_ERROR', 'Credit is a sale settlement choice, not a payment receipt method')
  const isSale = input.transactionType === 'sale'
  const record = isSale
    ? requireRecord(rows<Sale>(state, 'sales'), input.transactionId, 'Sale')
    : requireRecord(rows<Purchase>(state, 'purchases'), input.transactionId, 'Purchase')
  if (isSale) {
    const sale = record as Sale
    if (sale.status !== 'completed' && sale.status !== 'partially_paid') throw new ApiError(409, 'CONFLICT', 'Payments can only be allocated to a completed sale')
    const remaining = sale.totalPaise - sale.paidPaise
    if (input.amountPaise > remaining) throw new ApiError(409, 'CONFLICT', 'Payment exceeds the outstanding invoice balance')
    const payment = makePayment(state, { direction: 'received', partyType: 'patient', partyId: sale.patientId, transactionType: 'sale', transactionId: sale.id, amountPaise: input.amountPaise, method: input.method, reference: input.reference, paidOn: input.paidOn, idempotencyKey: key, requestHash: fingerprint })
    sale.paidPaise += payment.amountPaise
    sale.status = sale.paidPaise === sale.totalPaise ? 'completed' : 'partially_paid'
    sale.updatedAt = nowIso()
    return payment
  }
  const purchase = record as Purchase
  if (purchase.status !== 'received') throw new ApiError(409, 'CONFLICT', 'Supplier payments can only be allocated to a received purchase')
  const remaining = purchase.totalPaise - purchase.paidPaise
  if (input.amountPaise > remaining) throw new ApiError(409, 'CONFLICT', 'Payment exceeds the outstanding purchase balance')
  const payment = makePayment(state, { direction: 'paid', partyType: 'supplier', partyId: purchase.supplierId, transactionType: 'purchase', transactionId: purchase.id, amountPaise: input.amountPaise, method: input.method, reference: input.reference, paidOn: input.paidOn, idempotencyKey: key, requestHash: fingerprint })
  purchase.paidPaise += payment.amountPaise
  purchase.updatedAt = nowIso()
  void userId
  return payment
}

export async function recordPayment(raw: PaymentInput, user: User, keyHeader: string | null) {
  const input = paymentInputSchema.parse(raw)
  const key = validKey(keyHeader)
  const fingerprint = hash({ userId: user.id, input })
  return mutate((state) => {
    const payment = recordPaymentInState(state, input, user.id, key, fingerprint)
    return stripPrivate(payment as unknown as Record<string, unknown>)
  })
}

export async function completeSale(saleId: string, raw: SaleCompletionInput, user: User, keyHeader: string | null) {
  const input = saleCompletionInputSchema.parse(raw)
  const key = validKey(keyHeader)
  const fingerprint = hash({ userId: user.id, saleId, input })
  return mutate((state) => {
    const sale = requireRecord(rows<Sale>(state, 'sales'), saleId, 'Sale')
    if (sale.status === 'completed' || sale.status === 'partially_paid') {
      if (sale.completionIdempotencyKey !== key || sale.completionRequestHash !== fingerprint) throw new ApiError(409, 'CONFLICT', 'This sale has already been completed')
      return detail(state, 'sale', sale)
    }
    if (sale.status !== 'draft') throw new ApiError(409, 'CONFLICT', 'Only draft sales can be completed')
    const items = rows<SaleLineItem>(state, 'sale-items').filter((item) => item.saleId === sale.id)
    if (!items.length) throw new ApiError(409, 'CONFLICT', 'A sale must contain items before completion')
    const batches = rows<InventoryBatch>(state, 'batches')
    const movements = rows<StockMovement>(state, 'stock-movements')
    const allocated = new Map<string, number>()
    const nextLines: SaleLineItem[] = []
    const newMovements: StockMovement[] = []
    const now = nowIso()
    for (const item of items) {
      const allocations = item.batchId
        ? (() => {
            const batch = requireRecord(batches, item.batchId!, 'Batch')
            if (batch.medicineId !== item.medicineId) throw new ApiError(422, 'VALIDATION_ERROR', 'Sale item and batch medicine do not match')
            if (batch.expiryDate < sale.soldOn) throw new ApiError(409, 'CONFLICT', 'Expired batches cannot be sold')
            const available = getBatchQuantityOnHand(batch, movements) - (allocated.get(batch.id) ?? 0)
            if (item.quantity > available) throw new ApiError(409, 'CONFLICT', 'Insufficient stock in selected batch')
            return [{ batchId: batch.id, quantity: item.quantity }]
          })()
        : (() => {
            const effectiveMovements = movements.concat([...allocated.entries()].map(([batchId, quantity]) => {
              const batch = batches.find((candidate) => candidate.id === batchId)!
              return { id: `pending-${batchId}`, movementType: 'sale', sourceId: sale.id, batchId, medicineId: batch.medicineId, quantityDelta: -quantity, occurredAt: now, createdAt: now, updatedAt: now } as StockMovement
            }))
            return selectFefoBatch(batches.filter((batch) => batch.medicineId === item.medicineId), effectiveMovements, item.quantity, sale.soldOn)
          })()
      let usedDiscount = 0
      allocations.forEach((allocation, index) => {
        const batch = requireRecord(batches, allocation.batchId, 'Batch')
        const previousUse = allocated.get(batch.id) ?? 0
        if (item.batchId) {
          const current = getBatchQuantityOnHand(batch, movements) - previousUse
          validateSaleAgainstBatch(batch, movements, allocation.quantity, sale.soldOn)
          if (allocation.quantity > current) throw new ApiError(409, 'CONFLICT', 'Insufficient stock in selected batch')
        }
        allocated.set(batch.id, previousUse + allocation.quantity)
        const discount = index === allocations.length - 1
          ? item.discountPaise - usedDiscount
          : Math.floor(item.discountPaise * allocation.quantity / item.quantity)
        usedDiscount += discount
        const medicine = assertMedicine(state, item.medicineId)
        const stateSetting = currentState<PharmacySettings>(singleton(state, 'pharmacy-settings'), 'pharmacy profile')
        const inclusive = currentState<TaxSettings>(singleton(state, 'tax-settings'), 'tax settings').taxInclusivePricing
        const calculated = calculateLine({ medicineId: item.medicineId, quantity: allocation.quantity, discountPaise: discount }, medicine, item.unitPricePaise, item.taxRateBps, inclusive, isIntraState(sale.placeOfSupplyState ?? stateSetting.state, stateSetting))
        nextLines.push(makeItem<SaleLineItem>('sli', now, {
          saleId: sale.id, medicineId: item.medicineId, batchId: batch.id, quantity: allocation.quantity,
          unitPricePaise: item.unitPricePaise, discountPaise: discount, taxRateBps: item.taxRateBps,
          taxPaise: calculated.taxPaise, cgstPaise: calculated.cgstPaise, sgstPaise: calculated.sgstPaise,
          igstPaise: calculated.igstPaise, lineTotalPaise: calculated.lineTotalPaise,
        }))
        newMovements.push({ id: generateId('mov'), movementType: 'sale', sourceId: sale.id, batchId: batch.id, medicineId: batch.medicineId, quantityDelta: -allocation.quantity, occurredAt: now, createdAt: now, updatedAt: now })
      })
    }
    const currentSaleLines = rows<SaleLineItem>(state, 'sale-items')
    state['sale-items'] = currentSaleLines.filter((item) => item.saleId !== sale.id) as unknown[]
    rows<SaleLineItem>(state, 'sale-items').push(...nextLines)
    rows<StockMovement>(state, 'stock-movements').push(...newMovements)
    const amount = totals(nextLines.map((line) => ({ subtotalPaise: line.quantity * line.unitPricePaise - line.discountPaise, discountPaise: line.discountPaise, taxPaise: line.taxPaise, lineTotalPaise: line.lineTotalPaise })))
    Object.assign(sale, { ...amount, status: 'completed', settlementMethod: input.payment?.method ?? sale.settlementMethod ?? 'credit', completionIdempotencyKey: key, completionRequestHash: fingerprint, updatedAt: now })
    if (input.payment && input.payment.amountPaise > 0) {
      if (input.payment.method === 'credit') throw new ApiError(422, 'VALIDATION_ERROR', 'Credit sales cannot include an upfront payment')
      if (input.payment.amountPaise > sale.totalPaise) throw new ApiError(409, 'CONFLICT', 'Initial payment exceeds the invoice total')
      const paidOn = now.slice(0, 10)
      const reference = input.payment.reference?.trim() || sale.invoiceNumber
      const payment = makePayment(state, {
        direction: 'received', partyType: 'patient', partyId: sale.patientId, transactionType: 'sale', transactionId: sale.id,
        amountPaise: input.payment.amountPaise, method: input.payment.method, reference, paidOn,
      })
      sale.paidPaise = payment.amountPaise
      if (sale.paidPaise < sale.totalPaise) sale.status = 'partially_paid'
    }
    void user
    return detail(state, 'sale', sale)
  })
}

export async function cancelSale(saleId: string, keyHeader: string | null) {
  const key = validKey(keyHeader)
  const fingerprint = hash({ saleId, action: 'cancel' })
  return mutate((state) => {
    const sale = requireRecord(rows<Sale>(state, 'sales'), saleId, 'Sale')
    if (sale.status === 'cancelled' || sale.status === 'reversed') {
      if (sale.cancellationIdempotencyKey !== key || sale.cancellationRequestHash !== fingerprint) throw new ApiError(409, 'CONFLICT', 'This sale has already been cancelled or reversed')
      return detail(state, 'sale', sale)
    }
    if (sale.status === 'draft') {
      Object.assign(sale, { status: 'cancelled', cancellationIdempotencyKey: key, cancellationRequestHash: fingerprint, updatedAt: nowIso() })
      return detail(state, 'sale', sale)
    }
    if (sale.paidPaise > 0 || rows<Payment>(state, 'payments').some((payment) => payment.transactionId === sale.id)) {
      throw new ApiError(409, 'CONFLICT', 'A paid sale cannot be reversed until customer refund handling is implemented')
    }
    const items = rows<SaleLineItem>(state, 'sale-items').filter((item) => item.saleId === sale.id)
    const now = nowIso()
    const movements = rows<StockMovement>(state, 'stock-movements')
    for (const item of items) {
      if (!item.batchId) throw new ApiError(409, 'CONFLICT', 'Sale allocation is incomplete')
      movements.push({ id: generateId('mov'), movementType: 'sale_reversal', sourceId: sale.id, batchId: item.batchId, medicineId: item.medicineId, quantityDelta: item.quantity, occurredAt: now, createdAt: now, updatedAt: now })
    }
    Object.assign(sale, { status: 'reversed', cancellationIdempotencyKey: key, cancellationRequestHash: fingerprint, updatedAt: now })
    return detail(state, 'sale', sale)
  })
}

export async function updateQuotationDraft(quotationId: string, raw: QuotationDraftInput) {
  const input = quotationDraftInputSchema.parse(raw)
  return mutate((state) => {
    const quote = requireRecord(rows<Record<string, any>>(state, 'quotations'), quotationId, 'Quotation')
    if (quote.status !== 'draft') throw new ApiError(409, 'CONFLICT', 'Only draft quotations can be edited')
    assertParty(state, input.patientId)
    const pharmacy = currentState<PharmacySettings>(singleton(state, 'pharmacy-settings'), 'pharmacy profile')
    const tax = currentState<TaxSettings>(singleton(state, 'tax-settings'), 'tax settings')
    const prepared = prepareFinancialLines(state, input.lines, { inclusive: tax.taxInclusivePricing, intraState: isIntraState(pharmacy.state, pharmacy), priceFor: (_line, medicine) => medicine.sellingPricePaise })
    const now = nowIso()
    const newLines = prepared.map(({ calculated }) => makeItem<any>('qli', now, {
      quotationId, medicineId: calculated.medicineId, quantity: calculated.quantity, unitPricePaise: calculated.unitPricePaise,
      discountPaise: calculated.discountPaise, taxRateBps: calculated.taxRateBps, taxPaise: calculated.taxPaise,
      cgstPaise: calculated.cgstPaise, sgstPaise: calculated.sgstPaise, igstPaise: calculated.igstPaise,
      lineTotalPaise: calculated.lineTotalPaise,
    }))
    const amount = totals(prepared.map(({ calculated }) => ({ ...calculated, lineTotalPaise: calculated.lineTotalPaise })))
    const quoteLines = rows<Record<string, any>>(state, 'quotation-items')
    state['quotation-items'] = quoteLines.filter((item) => item.quotationId !== quotationId) as unknown[]
    rows<Record<string, any>>(state, 'quotation-items').push(...newLines)
    Object.assign(quote, { patientId: input.patientId ?? null, issuedOn: input.issuedOn, validUntil: input.validUntil, ...amount, updatedAt: now })
    return detail(state, 'quotation', quote)
  })
}

export async function updateQuotationStatus(quotationId: string, nextStatus: 'sent' | 'accepted' | 'rejected') {
  return mutate((state) => {
    const quote = requireRecord(rows<Record<string, any>>(state, 'quotations'), quotationId, 'Quotation')
    const allowed: Record<string, string[]> = { draft: ['sent'], sent: ['accepted', 'rejected'] }
    if (quote.status === nextStatus) return detail(state, 'quotation', quote)
    if (!allowed[quote.status]?.includes(nextStatus)) throw new ApiError(409, 'CONFLICT', 'Invalid quotation status transition')
    Object.assign(quote, { status: nextStatus, updatedAt: nowIso() })
    return detail(state, 'quotation', quote)
  })
}

export async function convertQuotation(quotationId: string, user: User, keyHeader: string | null) {
  const key = validKey(keyHeader)
  const fingerprint = hash({ userId: user.id, quotationId, action: 'convert' })
  return mutate((state) => {
    const quote = requireRecord(rows<Record<string, any>>(state, 'quotations'), quotationId, 'Quotation')
    if (quote.convertedSaleId) {
      const sale = requireRecord(rows<Sale>(state, 'sales'), quote.convertedSaleId, 'Converted sale')
      if (sale.idempotencyKey !== key || sale.requestHash !== fingerprint) throw new ApiError(409, 'CONFLICT', 'Quotation has already been converted')
      return detail(state, 'sale', sale)
    }
    if (!['draft', 'sent', 'accepted'].includes(quote.status)) throw new ApiError(409, 'CONFLICT', 'Only open quotations can be converted')
    if (quote.validUntil < today()) throw new ApiError(409, 'CONFLICT', 'Expired quotations cannot be converted')
    const quoteItems = rows<Record<string, any>>(state, 'quotation-items').filter((item) => item.quotationId === quote.id)
    if (!quoteItems.length) throw new ApiError(409, 'CONFLICT', 'Quotation has no items to convert')
    const settings = currentState<InvoiceSettings>(singleton(state, 'invoice-settings'), 'invoice settings')
    const now = nowIso()
    const saleId = generateId('sal')
    const sale: Sale = {
      id: saleId, patientId: quote.patientId, doctorId: null, invoiceNumber: nextInvoice(settings, 'sale'), soldOn: today(),
      status: 'draft', subtotalPaise: quote.subtotalPaise, discountPaise: quote.discountPaise, taxPaise: quote.taxPaise,
      totalPaise: quote.totalPaise, paidPaise: 0, createdByUserId: user.id, sourceQuotationId: quote.id,
      placeOfSupplyState: currentState<PharmacySettings>(singleton(state, 'pharmacy-settings'), 'pharmacy profile').state,
      settlementMethod: 'credit', createdAt: now, updatedAt: now, idempotencyKey: key, requestHash: fingerprint,
    }
    const saleItems = quoteItems.map((item) => makeItem<SaleLineItem>('sli', now, {
      saleId, medicineId: item.medicineId, batchId: null, quantity: item.quantity, unitPricePaise: item.unitPricePaise,
      discountPaise: item.discountPaise, taxRateBps: item.taxRateBps, taxPaise: item.taxPaise,
      cgstPaise: item.cgstPaise ?? Math.floor(item.taxPaise / 2), sgstPaise: item.sgstPaise ?? item.taxPaise - Math.floor(item.taxPaise / 2),
      igstPaise: item.igstPaise ?? 0, lineTotalPaise: item.lineTotalPaise,
    }))
    rows<Sale>(state, 'sales').push(sale)
    rows<SaleLineItem>(state, 'sale-items').push(...saleItems)
    Object.assign(quote, { status: 'converted', convertedSaleId: sale.id, updatedAt: now })
    return detail(state, 'sale', sale)
  })
}

export async function createExpense(raw: ExpenseInput, keyHeader: string | null) {
  const input = expenseInputSchema.parse(raw)
  const key = validKey(keyHeader)
  const fingerprint = hash(input)
  return mutate((state) => {
    const expenses = rows<Expense>(state, 'expenses')
    const existing = replay(expenses, key, fingerprint)
    if (existing) return stripPrivate(existing as unknown as Record<string, unknown>)
    const timestamp = nowIso()
    const expense: Expense = { ...input, id: generateId('exp'), createdAt: timestamp, updatedAt: timestamp, idempotencyKey: key, requestHash: fingerprint }
    expenses.push(expense)
    if (expense.paidInCash) rows<CashBookEntry>(state, 'cash-book-entries').push({
      id: generateId('cbe'), entryType: 'outflow', amountPaise: expense.amountPaise, occurredOn: expense.incurredOn,
      description: expense.description, paymentId: null, expenseId: expense.id, reference: expense.reference,
      createdAt: timestamp, updatedAt: timestamp,
    })
    return stripPrivate(expense as unknown as Record<string, unknown>)
  })
}

export async function updateExpense(expenseId: string, raw: ExpenseInput, keyHeader: string | null) {
  const input = expenseInputSchema.parse(raw)
  const key = validKey(keyHeader)
  const fingerprint = hash(input)
  return mutate((state) => {
    const expense = requireRecord(rows<Expense>(state, 'expenses'), expenseId, 'Expense')
    if (expense.updateIdempotencyKey === key) {
      if (expense.updateRequestHash !== fingerprint) throw new ApiError(409, 'CONFLICT', 'This idempotency key was already used for a different update')
      return stripPrivate(expense as unknown as Record<string, unknown>)
    }
    const entries = rows<CashBookEntry>(state, 'cash-book-entries')
    const linked = entries.filter((entry) => entry.expenseId === expense.id)
    const changesCash = expense.amountPaise !== input.amountPaise || expense.incurredOn !== input.incurredOn || expense.paidInCash !== input.paidInCash
    const timestamp = nowIso()
    if (changesCash) {
      for (const entry of linked) rows<CashBookEntry>(state, 'cash-book-entries').push({
        id: generateId('cbe'), entryType: entry.entryType === 'inflow' ? 'outflow' : 'inflow', amountPaise: entry.amountPaise, occurredOn: input.incurredOn,
        description: `Reversal for edited expense ${expense.id}`, paymentId: null, expenseId: expense.id,
        reference: `REV-${expense.reference || expense.id}`, createdAt: timestamp, updatedAt: timestamp,
      })
      if (input.paidInCash) rows<CashBookEntry>(state, 'cash-book-entries').push({
        id: generateId('cbe'), entryType: 'outflow', amountPaise: input.amountPaise, occurredOn: input.incurredOn,
        description: input.description, paymentId: null, expenseId: expense.id, reference: input.reference,
        createdAt: timestamp, updatedAt: timestamp,
      })
    }
    Object.assign(expense, input, { updatedAt: timestamp, updateIdempotencyKey: key, updateRequestHash: fingerprint })
    return stripPrivate(expense as unknown as Record<string, unknown>)
  })
}

export async function createManualCashEntry(raw: z.infer<typeof manualCashEntryInputSchema>, keyHeader: string | null) {
  const input = manualCashEntryInputSchema.parse(raw)
  const key = validKey(keyHeader)
  const fingerprint = hash(input)
  return mutate((state) => {
    const entries = rows<CashBookEntry>(state, 'cash-book-entries')
    const prior = entries.find((entry) => entry.idempotencyKey === key)
    if (prior) {
      if (prior.requestHash !== fingerprint) throw new ApiError(409, 'CONFLICT', 'This idempotency key was already used for a different cash entry')
      return stripPrivate(prior as unknown as Record<string, unknown>)
    }
    const timestamp = nowIso()
    const entry: CashBookEntry = {
      ...input, id: generateId('cbe'), paymentId: null, expenseId: null, manualEntry: true,
      idempotencyKey: key, requestHash: fingerprint, createdAt: timestamp, updatedAt: timestamp,
    }
    entries.push(entry)
    return stripPrivate(entry as unknown as Record<string, unknown>)
  })
}

export async function getTransactionDetail(kind: 'purchases' | 'sales' | 'quotations', recordId: string) {
  const state = Object.fromEntries(await Promise.all(mutationCollections.map(async (name) => [name, await jsonStore.read(name)]))) as WorkflowState
  const resourceKind = kind === 'purchases' ? 'purchase' : kind === 'sales' ? 'sale' : 'quotation'
  const collection = kind === 'purchases' ? 'purchases' : kind
  const record = requireRecord(rows<Record<string, any>>(state, collection), recordId, kind.slice(0, -1))
  return detail(state, resourceKind, record)
}
export async function getPaymentDetail(paymentId: string) {
  const state = Object.fromEntries(await Promise.all(['payments', 'sales', 'purchases'].map(async (name) => [name, await jsonStore.read(name)])))
  const payment = requireRecord(rows<Payment>(state as WorkflowState, 'payments'), paymentId, 'Payment')
  const transaction = payment.transactionType === 'sale'
    ? rows<Sale>(state as WorkflowState, 'sales').find((sale) => sale.id === payment.transactionId)
    : rows<Purchase>(state as WorkflowState, 'purchases').find((purchase) => purchase.id === payment.transactionId)
  return { payment: stripPrivate(payment as unknown as Record<string, unknown>), transaction }
}
export async function listCashBook(search: URLSearchParams) {
  const entries = await jsonStore.read<CashBookEntry[]>('cash-book-entries')
  const from = search.get('from')
  const to = search.get('to')
  if ((from && !isValidDateOnly(from)) || (to && !isValidDateOnly(to))) throw new ApiError(422, 'VALIDATION_ERROR', 'Cash-book date filters must be valid dates')
  const openingBalancePaise = 0
  const sorted = entries.filter((entry) => (!from || entry.occurredOn >= from) && (!to || entry.occurredOn <= to))
    .sort((left, right) => left.occurredOn.localeCompare(right.occurredOn) || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
  let runningBalancePaise = openingBalancePaise
  const items = sorted.map((entry) => {
    runningBalancePaise += entry.entryType === 'inflow' ? entry.amountPaise : -entry.amountPaise
    return { ...stripPrivate(entry as unknown as Record<string, unknown>), runningBalancePaise }
  })
  const inflowPaise = sorted.filter((entry) => entry.entryType === 'inflow').reduce((sum, entry) => sum + entry.amountPaise, 0)
  const outflowPaise = sorted.filter((entry) => entry.entryType === 'outflow').reduce((sum, entry) => sum + entry.amountPaise, 0)
  return { items, summary: { openingBalancePaise, inflowPaise, outflowPaise, closingBalancePaise: openingBalancePaise + inflowPaise - outflowPaise, entryCount: sorted.length } }
}
export async function getPaymentSummary() {
  const payments = await jsonStore.read<Payment[]>('payments')
  const currentMonth = today().slice(0, 7)
  return payments.reduce((summary, payment) => {
    if (payment.paidOn.slice(0, 7) === currentMonth) {
      if (payment.direction === 'received') summary.receivedPaise += payment.amountPaise
      else summary.paidPaise += payment.amountPaise
    }
    return summary
  }, { receivedPaise: 0, paidPaise: 0, currentMonth, paymentCount: payments.length })
}
export async function getExpenseSummary() {
  const expenses = await jsonStore.read<Expense[]>('expenses')
  const month = today().slice(0, 7)
  const current = expenses.filter((expense) => expense.incurredOn.slice(0, 7) === month)
  const categoryTotalsPaise = current.reduce<Record<string, number>>((summary, expense) => {
    summary[expense.category] = (summary[expense.category] ?? 0) + expense.amountPaise
    return summary
  }, {})
  return { currentMonth: month, totalPaise: current.reduce((sum, expense) => sum + expense.amountPaise, 0), count: current.length, categoryTotalsPaise }
}
