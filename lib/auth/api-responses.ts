import { ApiError, errorResponse } from '@/lib/api/responses'
import { JsonAuthError } from './json-auth.mjs'

export function authErrorResponse(error: unknown) {
  if (error instanceof JsonAuthError) {
    return errorResponse(new ApiError(error.status, error.code as ConstructorParameters<typeof ApiError>[1], error.message))
  }
  return errorResponse(error)
}
