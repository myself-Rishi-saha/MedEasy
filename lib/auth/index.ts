import { ApiError } from '@/lib/api/responses'
import { authJsonStore } from './json-auth-store.mjs'
import { createJsonAuthService } from './json-auth.mjs'
import { jsonStore } from '@/lib/storage/json-store'

export const jsonAuth = createJsonAuthService({ authStore: authJsonStore, userStore: jsonStore })

export const SESSION_COOKIE_NAME = 'med_easy_session'

export function readSessionToken(cookieHeader: string | null) {
  if (!cookieHeader) return null
  const entry = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
  if (!entry) return null
  return entry.slice(SESSION_COOKIE_NAME.length + 1) || null
}

export function sessionCookie(token: string, expiresAt: string, requestUrl: string) {
  const maxAge = Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000))
  const secure = new URL(requestUrl).protocol === 'https:'
  const sameSite = secure && process.env.NODE_ENV !== 'production' ? 'None' : 'Lax'
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
}

export function clearSessionCookie(requestUrl: string) {
  const secure = new URL(requestUrl).protocol === 'https:'
  const sameSite = secure && process.env.NODE_ENV !== 'production' ? 'None' : 'Lax'
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=0${secure ? '; Secure' : ''}`
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return
  let trustedOrigin = ''
  let requestOrigin = ''
  try {
    const host = request.headers.get('host')
    const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
    const protocol = forwardedProto || new URL(request.url).protocol.slice(0, -1)
    if (!host || !['http', 'https'].includes(protocol)) throw new Error('Missing trusted request host')
    trustedOrigin = new URL(`${protocol}://${host}`).origin
    const originUrl = new URL(origin)
    if (!['http:', 'https:'].includes(originUrl.protocol) || originUrl.origin !== origin) throw new Error('Origin must be an HTTP origin')
    requestOrigin = originUrl.origin
  } catch {
    throw new ApiError(400, 'INVALID_REQUEST', 'Invalid request origin')
  }
  // Next.js may expose an internal URL behind Vercel; the request host plus forwarded protocol identify the browser-facing origin.
  if (requestOrigin !== trustedOrigin) throw new ApiError(403, 'FORBIDDEN', 'Cross-origin authentication request')
}

export async function getRequestUser(request: Request) {
  const token = readSessionToken(request.headers.get('cookie'))
  const session = await jsonAuth.getSessionByToken(token)
  if (!session) return null
  return session.user
}

export async function requireRequestUser(request: Request) {
  const user = await getRequestUser(request)
  if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required')
  if (user.status !== 'active') throw new ApiError(403, 'FORBIDDEN', 'This user account is inactive')
  return user
}
