import { ZodError } from 'zod'

export type ApiErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND' | 'CONFLICT' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_REQUEST' | 'INTERNAL_ERROR' | 'AUTH_SETUP_REQUIRED' | 'RATE_LIMITED'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly errors: Array<{ path: string; message: string }> = [],
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function successResponse<T>(data: T, message = 'Operation completed', status = 200) {
  return Response.json({ success: true, message, data }, { status })
}

export function errorResponse(error: unknown, requestId?: string) {
  if (error instanceof ApiError) {
    return Response.json({ success: false, message: error.message, code: error.code, errors: error.errors }, { status: error.status })
  }
  if (error instanceof ZodError) {
    return Response.json({
      success: false,
      message: 'Request validation failed',
      code: 'VALIDATION_ERROR',
      errors: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    }, { status: 422 })
  }
  logApiError(requestId)
  return Response.json({ success: false, message: 'The request could not be completed', code: 'INTERNAL_ERROR', errors: [] }, { status: 500 })
}

function logApiError(requestId?: string) {
  console.error(JSON.stringify({ level: 'error', event: 'api_request_failed', requestId: requestId ?? null, occurredAt: new Date().toISOString() }))
}

export async function parseJsonBody<T>(request: Request, schema: { parse: (input: unknown) => T }): Promise<T> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new ApiError(400, 'INVALID_REQUEST', 'Request body must be valid JSON')
  }
  return schema.parse(body)
}
