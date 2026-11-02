import { z } from 'zod'
import { ApiError, parseJsonBody, successResponse } from '@/lib/api/responses'
import { authErrorResponse } from '@/lib/auth/api-responses'
import { assertSameOrigin, jsonAuth, sessionCookie } from '@/lib/auth'

export const runtime = 'nodejs'

const signInSchema = z.object({
  identifier: z.string().trim().min(1).max(254).optional(),
  email: z.string().trim().min(1).max(254).optional(),
  password: z.string().min(1).max(128),
}).strict().refine((value) => Boolean(value.identifier || value.email), { message: 'Enter your email or username', path: ['identifier'] })

export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
    const body = await parseJsonBody(request, signInSchema)
    const identifier = body.identifier ?? body.email ?? ''
    const forwardedAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const result = await jsonAuth.signIn({ identifier, password: body.password, rateLimitKey: `${identifier.toLowerCase()}|${forwardedAddress}` })
    const response = successResponse({ user: result.user }, 'Signed in successfully')
    response.headers.set('Set-Cookie', sessionCookie(result.token, result.expiresAt, request.url))
    return response
  } catch (error) {
    if (error instanceof SyntaxError) return authErrorResponse(new ApiError(400, 'INVALID_REQUEST', 'Request body must be valid JSON'))
    return authErrorResponse(error)
  }
}
