import { z } from 'zod'
import { ApiError, parseJsonBody, successResponse } from '@/lib/api/responses'
import { authErrorResponse } from '@/lib/auth/api-responses'
import { assertSameOrigin, jsonAuth, sessionCookie } from '@/lib/auth'

export const runtime = 'nodejs'

const signUpSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(12).max(128),
  verificationToken: z.string().min(20).max(100).optional(),
}).strict()

export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
    const body = await parseJsonBody(request, signUpSchema)
    const result = await jsonAuth.completeSignUp(body)
    const response = successResponse({ user: result.user }, 'Account set up successfully', 201)
    response.headers.set('Set-Cookie', sessionCookie(result.token, result.expiresAt, request.url))
    return response
  } catch (error) {
    if (error instanceof SyntaxError) return authErrorResponse(new ApiError(400, 'INVALID_REQUEST', 'Request body must be valid JSON'))
    return authErrorResponse(error)
  }
}
