export const userRoles = ['admin', 'pharmacist', 'cashier'] as const
export type UserRole = (typeof userRoles)[number]
export const entityStatuses = ['active', 'inactive'] as const
export type EntityStatus = (typeof entityStatuses)[number]
export const paymentMethods = ['cash', 'upi', 'card', 'bank_transfer', 'credit'] as const
export type PaymentMethod = (typeof paymentMethods)[number]
export const purchaseStatuses = ['received', 'draft', 'cancelled'] as const
export type PurchaseStatus = (typeof purchaseStatuses)[number]
export const saleStatuses = ['draft', 'completed', 'partially_paid', 'cancelled', 'reversed'] as const
export type SaleStatus = (typeof saleStatuses)[number]
export const quotationStatuses = ['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'] as const
export type QuotationStatus = (typeof quotationStatuses)[number]
export const movementTypes = ['purchase_receipt', 'purchase_reversal', 'sale', 'sale_reversal', 'adjustment'] as const
export type StockMovementType = (typeof movementTypes)[number]
export const expenseCategories = ['rent', 'utilities', 'supplies', 'salary', 'maintenance', 'transport', 'other'] as const
export type ExpenseCategory = (typeof expenseCategories)[number]

export interface TimestampedRecord {
  id: string
  createdAt: string
  updatedAt: string
}

export interface User extends TimestampedRecord {
  name: string
  email: string
  role: UserRole
  status: EntityStatus
  lastLoginAt: string | null
}

export interface UserPreferences extends TimestampedRecord {
  userId: string
  timezone: string
  dateFormat: 'DD MMM YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'
  dashboardRange: 'week' | 'month' | 'year'
}

export interface Category extends TimestampedRecord {
  name: string
  description: string
  status: EntityStatus
}

export interface Unit extends TimestampedRecord {
  name: string
  code: string
  description: string
  status: EntityStatus
}

export interface Medicine extends TimestampedRecord {
  sku: string
  name: string
  genericName: string
  categoryId: string
  unitId: string
  stripSize: number
  manufacturer: string
  purchasePricePaise: number
  sellingPricePaise: number
  gstRateBps: number
  reorderLevel: number
  requiresPrescription: boolean
  status: EntityStatus
}

export interface Supplier extends TimestampedRecord {
  name: string
  contactName: string
  phone: string
  email: string
  gstin: string
  address: string
  city: string
  status: EntityStatus
}

export interface Patient extends TimestampedRecord {
  name: string
  phone: string
  email?: string
  address: string
  city: string
  state?: string
  dateOfBirth: string | null
  status: EntityStatus
}

export interface Doctor extends TimestampedRecord {
  name: string
  registrationNumber: string
  specialization: string
  phone: string
  email: string
  clinic: string
  city: string
  status: EntityStatus
}

export interface InventoryBatch extends TimestampedRecord {
  batchNumber: string
  medicineId: string
  supplierId: string
  receivedOn: string
  expiryDate: string
  openingQuantity: number
  reorderLevel: number
  purchasePricePaise: number
  sellingPricePaise: number
}

export interface Purchase extends TimestampedRecord {
  supplierId: string
  invoiceNumber: string
  supplierInvoiceNumber?: string
  purchasedOn: string
  status: PurchaseStatus
  subtotalPaise: number
  discountPaise: number
  taxPaise: number
  totalPaise: number
  paidPaise: number
  idempotencyKey?: string
  requestHash?: string
  receiptIdempotencyKey?: string
  receiptRequestHash?: string
  cancellationIdempotencyKey?: string
  cancellationRequestHash?: string
}

export interface PurchaseLineItem extends TimestampedRecord {
  purchaseId: string
  medicineId: string
  batchId: string | null
  batchNumber?: string
  expiryDate?: string
  reorderLevel?: number
  sellingPricePaise?: number
  quantity: number
  unitPricePaise: number
  discountPaise: number
  taxRateBps: number
  taxPaise: number
  cgstPaise?: number
  sgstPaise?: number
  igstPaise?: number
  lineTotalPaise: number
}

export interface Sale extends TimestampedRecord {
  patientId: string | null
  doctorId: string | null
  invoiceNumber: string
  soldOn: string
  status: SaleStatus
  subtotalPaise: number
  discountPaise: number
  taxPaise: number
  totalPaise: number
  paidPaise: number
  createdByUserId: string
  sourceQuotationId?: string | null
  placeOfSupplyState?: string
  settlementMethod?: PaymentMethod
  idempotencyKey?: string
  requestHash?: string
  completionIdempotencyKey?: string
  completionRequestHash?: string
  cancellationIdempotencyKey?: string
  cancellationRequestHash?: string
}

export interface SaleLineItem extends TimestampedRecord {
  saleId: string
  medicineId: string
  batchId: string | null
  quantity: number
  unitPricePaise: number
  discountPaise: number
  taxRateBps: number
  taxPaise: number
  cgstPaise?: number
  sgstPaise?: number
  igstPaise?: number
  lineTotalPaise: number
}

export interface Quotation extends TimestampedRecord {
  patientId: string | null
  quotationNumber: string
  issuedOn: string
  validUntil: string
  status: QuotationStatus
  subtotalPaise: number
  discountPaise: number
  taxPaise: number
  totalPaise: number
  createdByUserId: string
  placeOfSupplyState?: string
  convertedSaleId?: string | null
  idempotencyKey?: string
  requestHash?: string
}

export interface QuotationLineItem extends TimestampedRecord {
  quotationId: string
  medicineId: string
  quantity: number
  unitPricePaise: number
  discountPaise: number
  taxRateBps: number
  taxPaise: number
  lineTotalPaise: number
}

export interface Payment extends TimestampedRecord {
  direction: 'received' | 'paid'
  partyType: 'patient' | 'supplier'
  partyId: string | null
  transactionType: 'sale' | 'purchase'
  transactionId: string
  method: PaymentMethod
  amountPaise: number
  reference: string
  status: 'completed'
  paidOn: string
  idempotencyKey?: string
  requestHash?: string
}

export interface Expense extends TimestampedRecord {
  category: ExpenseCategory
  description: string
  incurredOn: string
  amountPaise: number
  method: PaymentMethod
  reference: string
  notes: string
  paidInCash: boolean
  idempotencyKey?: string
  requestHash?: string
  updateIdempotencyKey?: string
  updateRequestHash?: string
}

export interface CashBookEntry extends TimestampedRecord {
  entryType: 'inflow' | 'outflow'
  amountPaise: number
  occurredOn: string
  description: string
  paymentId: string | null
  expenseId: string | null
  manualEntry?: boolean
  reference?: string
  idempotencyKey?: string
  requestHash?: string
}

export interface StockAdjustmentLine {
  batchId: string
  medicineId: string
  quantityDelta: number
  reason: string
}

export interface StockAdjustment extends TimestampedRecord {
  adjustmentNumber: string
  status: 'completed'
  reason: string
  createdByUserId: string
  adjustedOn: string
  lines: StockAdjustmentLine[]
  idempotencyKey?: string
  requestHash?: string
  resultMovements?: StockMovement[]
}

export interface StockMovement extends TimestampedRecord {
  movementType: StockMovementType
  sourceId: string
  batchId: string
  medicineId: string
  quantityDelta: number
  occurredAt: string
}

export interface PharmacySettings {
  id: 'set_pharmacy'
  name: string
  legalName: string
  phone: string
  email: string
  address: string
  city: string
  state: string
  pincode: string
  gstin: string
  currency: 'INR'
  openingStockAsOf: string
  createdAt: string
  updatedAt: string
}

export interface TaxSettings {
  id: 'set_tax'
  currency: 'INR'
  taxInclusivePricing: boolean
  rates: Array<{ name: string; rateBps: number; enabled: boolean }>
  createdAt: string
  updatedAt: string
}

export interface InvoiceSettings {
  id: 'set_invoice'
  salePrefix: string
  purchasePrefix: string
  quotationPrefix: string
  nextSaleNumber: number
  nextPurchaseNumber: number
  nextQuotationNumber: number
  showGstBreakdown: boolean
  footer: string
  createdAt: string
  updatedAt: string
}

export interface InventorySettings {
  id: 'set_inventory'
  lowStockAlertsEnabled: boolean
  nearExpiryAlertsEnabled: boolean
  nearExpiryDays: number
  createdAt: string
  updatedAt: string
}
