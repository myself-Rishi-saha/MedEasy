import { ApiError, successResponse } from '@/lib/api/responses'
import { authErrorResponse } from '@/lib/auth/api-responses'
import { getRequestUser, readSessionToken, jsonAuth } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const user = await getRequestUser(request)
    if (user?.status === 'inactive') throw new ApiError(403, 'FORBIDDEN', 'This user account is inactive')
    const token = readSessionToken(request.headers.get('cookie'))
    const session = await jsonAuth.getSessionByToken(token)
    return successResponse({ user, expiresAt: session?.expiresAt ?? null }, user ? 'Session is active' : 'No active session')
  } catch (error) {
    return authErrorResponse(error)
  }
}
