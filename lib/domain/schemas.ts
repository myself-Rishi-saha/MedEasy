import { z } from "zod";
import {
  entityStatuses,
  expenseCategories,
  movementTypes,
  paymentMethods,
  purchaseStatuses,
  quotationStatuses,
  saleStatuses,
  userRoles,
} from "./types";

export type EntityCollection = keyof typeof entitySchemas;

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
    );
  }, "Expected a valid YYYY-MM-DD date");
const timestamp = z.iso.datetime();
const id = z.string().regex(/^[a-z]{3}_[a-z0-9]{3,}$/);
const money = z.number().int().nonnegative();
const positiveQuantity = z.number().int().positive();
const status = z.enum(entityStatuses);
const timestamped = { id, createdAt: timestamp, updatedAt: timestamp };
const transactionTotals = {
  subtotalPaise: money,
  discountPaise: money,
  taxPaise: money,
  totalPaise: money,
};
const lineFinancials = {
  quantity: positiveQuantity,
  unitPricePaise: money,
  discountPaise: money,
  taxRateBps: z.number().int().min(0).max(10000),
  taxPaise: money,
  lineTotalPaise: money,
};

export const userSchema = z.object({
  ...timestamped,
  name: z.string().min(1),
  email: z.email(),
  role: z.enum(userRoles),
  status,
  lastLoginAt: timestamp.nullable(),
});
export const categorySchema = z.object({
  ...timestamped,
  name: z.string().min(1),
  description: z.string(),
  status,
});
export const unitSchema = z.object({
  ...timestamped,
  name: z.string().min(1),
  code: z.string().min(1),
  description: z.string(),
  status,
});
export const medicineSchema = z.object({
  ...timestamped,
  sku: z.string().min(1),
  name: z.string().min(1),
  genericName: z.string().min(1),
  categoryId: id,
  unitId: id,
  manufacturer: z.string().min(1),
  purchasePricePaise: money,
  sellingPricePaise: money,
  // stripSize: z.number().int().positive().nullable().optional(),
  stripSize: z.number().int().positive().default(1),
  gstRateBps: z.number().int().min(0).max(10000),
  reorderLevel: z.number().int().nonnegative(),
  requiresPrescription: z.boolean(),
  status,
});
export const supplierSchema = z.object({
  ...timestamped,
  name: z.string().min(1),
  contactName: z.string().min(1),
  phone: z.string().min(7),
  email: z.email(),
  gstin: z.string().length(15),
  address: z.string().min(1),
  city: z.string().min(1),
  status,
});
export const patientSchema = z.object({
  ...timestamped,
  name: z.string().trim().min(1, "Customer name is required"),
  phone: z.string().min(7, "Phone number is required"),
  email: z.union([z.email(), z.literal("")]).optional(),
  address: z.string().trim().min(1, "Address is required"),
  city: z.string().optional(),
  state: z.string().optional(),
  dateOfBirth: dateOnly.nullable(),
  status,
});
// export const patientSchema = z.object({ ...timestamped, name: z.string().min(1), phone: z.string().min(7), email: z.email(), address: z.string(), city: z.string().min(1), state: z.string().optional(), dateOfBirth: dateOnly.nullable(), status })
export const doctorSchema = z.object({
  ...timestamped,
  name: z.string().min(1),
  registrationNumber: z.string().min(1),
  specialization: z.string().min(1),
  phone: z.string().min(7),
  email: z.email(),
  clinic: z.string().min(1),
  city: z.string().min(1),
  status,
});
export const inventoryBatchSchema = z
  .object({
    ...timestamped,
    batchNumber: z.string().min(1),
    medicineId: id,
    supplierId: id,
    receivedOn: dateOnly,
    expiryDate: dateOnly,
    openingQuantity: z.number().int().nonnegative(),
    reorderLevel: z.number().int().nonnegative(),
    purchasePricePaise: money,
    sellingPricePaise: money,
  })
  .refine(
    (batch) => batch.expiryDate > batch.receivedOn,
    "Expiry must be after receipt",
  );
export const purchaseSchema = z
  .object({
    ...timestamped,
    supplierId: id,
    invoiceNumber: z.string().min(1),
    supplierInvoiceNumber: z.string().optional(),
    purchasedOn: dateOnly,
    status: z.enum(purchaseStatuses),
    ...transactionTotals,
    paidPaise: money,
    idempotencyKey: z.string().max(200).optional(),
    requestHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    receiptIdempotencyKey: z.string().max(200).optional(),
    receiptRequestHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    cancellationIdempotencyKey: z.string().max(200).optional(),
    cancellationRequestHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .refine(
    (purchase) => purchase.paidPaise <= purchase.totalPaise,
    "Paid amount cannot exceed total",
  );
export const purchaseLineItemSchema = z.object({
  ...timestamped,
  purchaseId: id,
  medicineId: id,
  batchId: id.nullable(),
  batchNumber: z.string().min(1).optional(),
  expiryDate: dateOnly.optional(),
  reorderLevel: z.number().int().nonnegative().optional(),
  sellingPricePaise: money.optional(),
  cgstPaise: money.optional(),
  sgstPaise: money.optional(),
  igstPaise: money.optional(),
  ...lineFinancials,
});
export const saleSchema = z
  .object({
    ...timestamped,
    patientId: id.nullable(),
    doctorId: id.nullable(),
    invoiceNumber: z.string().min(1),
    soldOn: dateOnly,
    status: z.enum(saleStatuses),
    ...transactionTotals,
    paidPaise: money,
    createdByUserId: id,
    sourceQuotationId: id.nullable().optional(),
    placeOfSupplyState: z.string().optional(),
    settlementMethod: z.enum(paymentMethods).optional(),
    idempotencyKey: z.string().max(200).optional(),
    requestHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    completionIdempotencyKey: z.string().max(200).optional(),
    completionRequestHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    cancellationIdempotencyKey: z.string().max(200).optional(),
    cancellationRequestHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .refine(
    (sale) => sale.paidPaise <= sale.totalPaise,
    "Paid amount cannot exceed total",
  );
export const saleLineItemSchema = z.object({
  ...timestamped,
  saleId: id,
  medicineId: id,
  batchId: id.nullable(),
  cgstPaise: money.optional(),
  sgstPaise: money.optional(),
  igstPaise: money.optional(),
  ...lineFinancials,
});
export const quotationSchema = z
  .object({
    ...timestamped,
    patientId: id.nullable(),
    quotationNumber: z.string().min(1),
    issuedOn: dateOnly,
    validUntil: dateOnly,
    status: z.enum(quotationStatuses),
    ...transactionTotals,
    createdByUserId: id,
    placeOfSupplyState: z.string().optional(),
    convertedSaleId: id.nullable().optional(),
    idempotencyKey: z.string().max(200).optional(),
    requestHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .refine(
    (quotation) => quotation.validUntil >= quotation.issuedOn,
    "Quotation validity must not precede issue date",
  );
export const quotationLineItemSchema = z.object({
  ...timestamped,
  quotationId: id,
  medicineId: id,
  cgstPaise: money.optional(),
  sgstPaise: money.optional(),
  igstPaise: money.optional(),
  ...lineFinancials,
});
export const paymentSchema = z.object({
  ...timestamped,
  direction: z.enum(["received", "paid"]),
  partyType: z.enum(["patient", "supplier"]),
  partyId: id.nullable(),
  transactionType: z.enum(["sale", "purchase"]),
  transactionId: id,
  method: z.enum(paymentMethods),
  amountPaise: money.refine((value) => value > 0),
  reference: z.string().min(1),
  status: z.literal("completed"),
  paidOn: dateOnly,
  idempotencyKey: z.string().max(200).optional(),
  requestHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
export const expenseSchema = z.object({
  ...timestamped,
  category: z.enum(expenseCategories),
  description: z.string().min(1),
  incurredOn: dateOnly,
  amountPaise: money.refine((value) => value > 0),
  method: z.enum(paymentMethods),
  reference: z.string(),
  notes: z.string(),
  paidInCash: z.boolean(),
  idempotencyKey: z.string().max(200).optional(),
  requestHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  updateIdempotencyKey: z.string().max(200).optional(),
  updateRequestHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
export const cashBookEntrySchema = z
  .object({
    ...timestamped,
    entryType: z.enum(["inflow", "outflow"]),
    amountPaise: money.refine((value) => value > 0),
    occurredOn: dateOnly,
    description: z.string().min(1),
    paymentId: id.nullable(),
    expenseId: id.nullable(),
    manualEntry: z.boolean().optional(),
    reference: z.string().optional(),
    idempotencyKey: z.string().max(200).optional(),
    requestHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .refine(
    (entry) =>
      entry.manualEntry
        ? !entry.paymentId &&
          !entry.expenseId &&
          Boolean(entry.reference?.trim())
        : Number(Boolean(entry.paymentId)) +
            Number(Boolean(entry.expenseId)) ===
          1,
    "A manual entry requires a reference and must not link another source",
  );
export const stockAdjustmentLineSchema = z.object({
  batchId: id,
  medicineId: id,
  quantityDelta: z
    .number()
    .int()
    .refine((value) => value !== 0),
  reason: z.string().min(1),
});
export const stockMovementSchema = z.object({
  ...timestamped,
  movementType: z.enum(movementTypes),
  sourceId: id,
  batchId: id,
  medicineId: id,
  quantityDelta: z
    .number()
    .int()
    .refine((value) => value !== 0),
  occurredAt: timestamp,
});
export const stockAdjustmentSchema = z.object({
  ...timestamped,
  adjustmentNumber: z.string().min(1),
  status: z.literal("completed"),
  reason: z.string().min(1),
  createdByUserId: id,
  adjustedOn: dateOnly,
  lines: z.array(stockAdjustmentLineSchema).min(1),
  idempotencyKey: z.string().min(1).max(200).optional(),
  requestHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  resultMovements: z.array(stockMovementSchema).optional(),
});
export const pharmacySettingsSchema = z.object({
  id: z.literal("set_pharmacy"),
  name: z.string().min(1),
  legalName: z.string().min(1),
  phone: z.string().min(7),
  email: z.email(),
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  pincode: z.string().regex(/^\d{6}$/),
  gstin: z.string().length(15),
  currency: z.literal("INR"),
  openingStockAsOf: dateOnly,
  createdAt: timestamp,
  updatedAt: timestamp,
});
export const taxSettingsSchema = z.object({
  id: z.literal("set_tax"),
  currency: z.literal("INR"),
  taxInclusivePricing: z.boolean(),
  rates: z
    .array(
      z.object({
        name: z.string().min(1),
        rateBps: z.number().int().min(0).max(10000),
        enabled: z.boolean(),
      }),
    )
    .min(1),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export const invoiceSettingsSchema = z.object({
  id: z.literal("set_invoice"),
  salePrefix: z.string().trim().min(1).max(20),
  purchasePrefix: z.string().trim().min(1).max(20),
  quotationPrefix: z.string().trim().min(1).max(20),
  nextSaleNumber: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  nextPurchaseNumber: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  nextQuotationNumber: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  showGstBreakdown: z.boolean(),
  footer: z.string().max(500),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export const inventorySettingsSchema = z.object({
  id: z.literal("set_inventory"),
  lowStockAlertsEnabled: z.boolean(),
  nearExpiryAlertsEnabled: z.boolean(),
  nearExpiryDays: z.number().int().min(1).max(365),
  createdAt: timestamp,
  updatedAt: timestamp,
});
const validTimezone = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((timezone) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }, "Expected a valid IANA timezone");
export const userPreferencesSchema = z.object({
  ...timestamped,
  userId: id,
  timezone: validTimezone,
  dateFormat: z.enum(["DD MMM YYYY", "DD/MM/YYYY", "YYYY-MM-DD"]),
  dashboardRange: z.enum(["week", "month", "year"]),
});

export const entitySchemas = {
  users: userSchema,
  categories: categorySchema,
  units: unitSchema,
  medicines: medicineSchema,
  suppliers: supplierSchema,
  patients: patientSchema,
  doctors: doctorSchema,
  batches: inventoryBatchSchema,
  purchases: purchaseSchema,
  "purchase-items": purchaseLineItemSchema,
  sales: saleSchema,
  "sale-items": saleLineItemSchema,
  quotations: quotationSchema,
  "quotation-items": quotationLineItemSchema,
  payments: paymentSchema,
  expenses: expenseSchema,
  "cash-book-entries": cashBookEntrySchema,
  "stock-movements": stockMovementSchema,
  "stock-adjustments": stockAdjustmentSchema,
  "pharmacy-settings": pharmacySettingsSchema,
  "tax-settings": taxSettingsSchema,
  "invoice-settings": invoiceSettingsSchema,
  "inventory-settings": inventorySettingsSchema,
  "user-preferences": userPreferencesSchema,
} as const;
