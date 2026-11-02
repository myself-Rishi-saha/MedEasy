import { randomUUID } from 'node:crypto'
import { ApiError } from '@/lib/api/responses'
import type { UserRole } from '@/lib/domain/types'

export type IdPrefix = 'usr' | 'cat' | 'uni' | 'med' | 'sup' | 'pat' | 'doc' | 'bat' | 'pur' | 'pli' | 'sal' | 'sli' | 'quo' | 'qli' | 'pay' | 'exp' | 'cbe' | 'mov' | 'adj'

export function generateId(prefix: IdPrefix) {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`
}

export function calculateTaxPaise(taxablePaise: number, rateBps: number) {
  assertSafeInteger(taxablePaise, 'Taxable amount')
  assertSafeInteger(rateBps, 'Tax rate')
  if (taxablePaise < 0 || rateBps < 0 || rateBps > 10000) throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid tax calculation inputs')
  return Math.round((taxablePaise * rateBps) / 10000)
}

export function calculateLineTotalPaise(quantity: number, unitPricePaise: number, discountPaise: number, rateBps: number) {
  for (const [label, value] of [['Quantity', quantity], ['Unit price', unitPricePaise], ['Discount', discountPaise]] as const) assertSafeInteger(value, label)
  if (quantity <= 0 || unitPricePaise < 0 || discountPaise < 0) throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid line item amount or quantity')
  const taxable = quantity * unitPricePaise - discountPaise
  if (!Number.isSafeInteger(taxable) || taxable < 0) throw new ApiError(422, 'VALIDATION_ERROR', 'Discount cannot exceed the line amount')
  const taxPaise = calculateTaxPaise(taxable, rateBps)
  return { taxablePaise: taxable, taxPaise, lineTotalPaise: taxable + taxPaise }
}

function assertSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value)) throw new ApiError(422, 'VALIDATION_ERROR', `${label} must be a safe integer`)
}

export function isValidDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

export function requireDateOnly(value: string) {
  if (!isValidDateOnly(value)) throw new ApiError(422, 'VALIDATION_ERROR', 'Date must be a valid YYYY-MM-DD value')
  return value
}

export function toIsoTimestamp(date: Date = new Date()) {
  if (Number.isNaN(date.valueOf())) throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid date')
  return date.toISOString()
}

export const rolePermissions = {
  admin: ['*'],
  pharmacist: ['dashboard:read', 'catalog:read', 'inventory:read', 'inventory:write', 'sales:read', 'sales:write', 'purchases:read', 'purchases:write', 'patients:read', 'patients:write', 'doctors:read', 'doctors:write', 'quotations:read', 'quotations:write', 'reports:read'],
  cashier: ['dashboard:read', 'catalog:read', 'inventory:read', 'sales:read', 'sales:write', 'patients:read', 'patients:write', 'quotations:read', 'quotations:write', 'payments:read', 'payments:write'],
} as const satisfies Record<UserRole, readonly string[]>

export type Permission = (typeof rolePermissions)[UserRole][number]

export function hasPermission(role: UserRole, permission: string) {
  const allowed = rolePermissions[role] as readonly string[]
  return allowed.includes('*') || allowed.includes(permission)
}

export function requirePermission(role: UserRole, permission: string) {
  if (!hasPermission(role, permission)) throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to perform this action')
}
