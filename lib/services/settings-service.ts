import { z } from 'zod'
import { ApiError } from '@/lib/api/responses'
import { inventorySettingsSchema, invoiceSettingsSchema, pharmacySettingsSchema, taxSettingsSchema, userPreferencesSchema } from '@/lib/domain/schemas'
import type { InventorySettings, InvoiceSettings, PharmacySettings, TaxSettings, UserPreferences } from '@/lib/domain/types'
import { jsonStore } from '@/lib/storage/json-store'

const pharmacyInputSchema = pharmacySettingsSchema.omit({ id: true, createdAt: true, updatedAt: true }).strict()
const taxInputSchema = taxSettingsSchema.omit({ id: true, createdAt: true, updatedAt: true }).extend({
  rates: z.array(z.object({ name: z.string().trim().min(1).max(40), rateBps: z.number().int().min(0).max(10000), enabled: z.boolean() }).strict()).min(1).max(30),
}).strict().refine((settings) => new Set(settings.rates.map((rate) => rate.rateBps)).size === settings.rates.length, { message: 'GST rates must be unique', path: ['rates'] })
const invoiceInputSchema = invoiceSettingsSchema.omit({ id: true, createdAt: true, updatedAt: true }).strict()
const inventoryInputSchema = inventorySettingsSchema.omit({ id: true, createdAt: true, updatedAt: true }).strict()
const preferenceInputSchema = userPreferencesSchema.omit({ id: true, userId: true, createdAt: true, updatedAt: true }).partial().strict()

export const settingsInputSchemas = {
  pharmacy: pharmacyInputSchema,
  tax: taxInputSchema,
  invoice: invoiceInputSchema,
  inventory: inventoryInputSchema,
} as const

const defaultPreferences = {
  timezone: 'Asia/Kolkata',
  dateFormat: 'DD MMM YYYY' as const,
  dashboardRange: 'week' as const,
}

function preferenceId(userId: string) {
  return `prf_${userId.replace(/^usr_/, '')}`
}

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const records = await jsonStore.read<UserPreferences[]>('user-preferences')
  return records.find((record) => record.userId === userId) ?? userPreferencesSchema.parse({
    id: preferenceId(userId),
    userId,
    ...defaultPreferences,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  })
}

export async function updateUserPreferences(userId: string, input: unknown) {
  const changes = preferenceInputSchema.parse(input)
  const now = new Date().toISOString()
  let updated: UserPreferences | undefined
  await jsonStore.update<UserPreferences[]>('user-preferences', (records) => {
    const current = records.find((record) => record.userId === userId)
    updated = userPreferencesSchema.parse({
      id: current?.id ?? preferenceId(userId),
      userId,
      ...defaultPreferences,
      ...current,
      ...changes,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    })
    return current ? records.map((record) => record.userId === userId ? updated! : record) : [...records, updated]
  })
  return updated!
}

export async function getPharmacySummary() {
  const pharmacy = await jsonStore.read<PharmacySettings>('pharmacy-settings')
  return { name: pharmacy.name, city: pharmacy.city, state: pharmacy.state }
}

export async function getWorkspaceSettings() {
  const [pharmacy, tax, invoice, inventory] = await Promise.all([
    jsonStore.read<PharmacySettings>('pharmacy-settings'),
    jsonStore.read<TaxSettings>('tax-settings'),
    jsonStore.read<InvoiceSettings>('invoice-settings'),
    jsonStore.read<InventorySettings>('inventory-settings'),
  ])
  return { pharmacy, tax, invoice, inventory }
}

export async function updateWorkspaceSettings(section: keyof typeof settingsInputSchemas, input: unknown) {
  const parsed = settingsInputSchemas[section].parse(input)
  const collection = `${section === 'pharmacy' ? 'pharmacy' : section === 'tax' ? 'tax' : section === 'invoice' ? 'invoice' : 'inventory'}-settings`
  const ids = { pharmacy: 'set_pharmacy', tax: 'set_tax', invoice: 'set_invoice', inventory: 'set_inventory' } as const
  let updated: Record<string, unknown> | undefined
  await jsonStore.update<Record<string, unknown>>(collection, (current) => {
    if (section === 'invoice') {
      const currentInvoice = invoiceSettingsSchema.parse(current)
      const incoming = parsed as z.infer<typeof invoiceInputSchema>
      if (incoming.nextSaleNumber < currentInvoice.nextSaleNumber || incoming.nextPurchaseNumber < currentInvoice.nextPurchaseNumber || incoming.nextQuotationNumber < currentInvoice.nextQuotationNumber) {
        throw new ApiError(409, 'CONFLICT', 'Invoice counters cannot be moved backwards')
      }
    }
    const now = new Date().toISOString()
    updated = { ...current, ...parsed, id: ids[section], updatedAt: now }
    return updated
  })
  return updated
}
