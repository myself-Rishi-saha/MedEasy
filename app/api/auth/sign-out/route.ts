import { successResponse } from '@/lib/api/responses'
import { assertSameOrigin, clearSessionCookie, jsonAuth, readSessionToken } from '@/lib/auth'
import { authErrorResponse } from '@/lib/auth/api-responses'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
    await jsonAuth.signOut(readSessionToken(request.headers.get('cookie')))
    const response = successResponse(null, 'Signed out successfully')
    response.headers.set('Set-Cookie', clearSessionCookie(request.url))
    return response
  } catch (error) {
    return authErrorResponse(error)
  }
}
