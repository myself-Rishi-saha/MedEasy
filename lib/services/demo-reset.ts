import { ApiError } from '@/lib/api/responses'
import { jsonStore } from '@/lib/storage/json-store'
import type { UserRole } from '@/lib/domain/types'

export async function resetDemoData(role: UserRole, confirmation: string) {
  if (process.env.NODE_ENV !== 'development') throw new ApiError(404, 'NOT_FOUND', 'Resource not found')
  if (role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Administrator permission is required')
  if (confirmation !== 'RESET DEMO DATA') throw new ApiError(422, 'VALIDATION_ERROR', 'Explicit demo reset confirmation is required')
  await jsonStore.resetToSeeds()
  return { reset: true }
}
