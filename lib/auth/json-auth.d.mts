import type { JsonFileStore } from '../storage/json-file-store.mjs'
import type { User } from '../domain/types'

export class JsonAuthError extends Error {
  status: number
  code: string
}

export function createJsonAuthService(options: {
  authStore: JsonFileStore
  userStore: { read<T = unknown>(collection: string): Promise<T>; update<T = unknown>(collection: string, updater: (current: T) => T | Promise<T>): Promise<T> }
  clock?: () => Date
}): {
  completeSignUp(input: { email: string; password: string; verificationToken?: string }): Promise<{ user: User; token: string; expiresAt: string }>
  signIn(input: { identifier: string; password: string; rateLimitKey?: string }): Promise<{ user: User; token: string; expiresAt: string }>
  issueAccountSetupToken(userId: string): Promise<string>
  getSessionByToken(token: string | null): Promise<{ user: User; expiresAt: string } | null>
  signOut(token: string | null): Promise<void>
}

export const PASSWORD_MIN_LENGTH: number
export const SESSION_LIFETIME_MS: number
