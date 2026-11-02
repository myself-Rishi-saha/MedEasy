import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000
const VERIFICATION_LIFETIME_MS = 48 * 60 * 60 * 1000
const PASSWORD_MIN_LENGTH = 12

export class JsonAuthError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'JsonAuthError'
    this.status = status
    this.code = code
  }
}

const id = (prefix) => `${prefix}_${randomUUID().replaceAll('-', '')}`
const nowIso = (date) => date.toISOString()
const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase()
const tokenDigest = (token) => createHash('sha256').update(token).digest('hex')

async function passwordDigest(password) {
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, 64)
  return `scrypt$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`
}

async function passwordMatches(password, encoded) {
  const [algorithm, saltText, digestText] = String(encoded).split('$')
  if (algorithm !== 'scrypt' || !saltText || !digestText) return false
  let salt
  let expected
  try {
    salt = Buffer.from(saltText, 'base64url')
    expected = Buffer.from(digestText, 'base64url')
  } catch {
    return false
  }
  if (salt.length !== 16 || expected.length !== 64) return false
  const actual = Buffer.from(await scrypt(password, salt, expected.length))
  return timingSafeEqual(actual, expected)
}

function matchesIdentifier(user, identifier) {
  const normalized = normalizeEmail(identifier)
  const email = normalizeEmail(user.email)
  return normalized.includes('@') ? email === normalized : email.split('@')[0] === normalized
}

export function createJsonAuthService({ authStore, userStore, clock = () => new Date() }) {
  const attemptsByKey = new Map()

  async function findActiveProfile(identifier) {
    const users = await userStore.read('users')
    return users.find((user) => matchesIdentifier(user, identifier) && user.status === 'active') ?? null
  }

  async function createSession(user) {
    const token = randomBytes(32).toString('base64url')
    const timestamp = nowIso(clock())
    const expiresAt = nowIso(new Date(clock().getTime() + SESSION_LIFETIME_MS))
    const session = {
      id: id('ses'),
      userId: user.id,
      tokenHash: tokenDigest(token),
      expiresAt,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await authStore.update('sessions', (sessions) => [...sessions.filter((entry) => Date.parse(entry.expiresAt) > clock().getTime()), session])
    return { token, expiresAt }
  }

  async function completeSignUp({ email, password, verificationToken }) {
    const normalizedEmail = normalizeEmail(email)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new JsonAuthError(422, 'VALIDATION_ERROR', 'Enter a valid email address')
    if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH || password.length > 128) {
      throw new JsonAuthError(422, 'VALIDATION_ERROR', `Password must be between ${PASSWORD_MIN_LENGTH} and 128 characters`)
    }
    const user = await findActiveProfile(normalizedEmail)
    if (!user) throw new JsonAuthError(404, 'NOT_FOUND', 'No active workspace profile matches this email')
    const accounts = await authStore.read('accounts')
    if (accounts.some((account) => account.userId === user.id || account.email === normalizedEmail)) {
      throw new JsonAuthError(409, 'CONFLICT', 'An account is already set up for this profile')
    }

    let verification = null
    if (verificationToken) {
      const digest = tokenDigest(verificationToken)
      const records = await authStore.read('verifications')
      verification = records.find((entry) => entry.userId === user.id
        && entry.identifier === normalizedEmail
        && entry.purpose === 'account_setup'
        && entry.tokenHash === digest
        && entry.consumedAt === null
        && Date.parse(entry.expiresAt) > clock().getTime()) ?? null
      if (!verification) throw new JsonAuthError(400, 'INVALID_REQUEST', 'The account setup token is invalid or expired')
    } else if (accounts.length > 0 || user.role !== 'admin') {
      throw new JsonAuthError(403, 'FORBIDDEN', 'A valid account setup token is required')
    }
    const isBootstrapAccount = verification === null

    const timestamp = nowIso(clock())
    const account = {
      id: id('acc'),
      userId: user.id,
      email: normalizedEmail,
      passwordHash: await passwordDigest(password),
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await authStore.update('accounts', (current) => {
      if (current.some((entry) => entry.userId === user.id || entry.email === normalizedEmail) || (isBootstrapAccount && current.length > 0)) {
        throw new JsonAuthError(409, 'CONFLICT', 'An account is already set up or the initial workspace setup is complete')
      }
      return [...current, account]
    })
    if (verification) {
      await authStore.update('verifications', (records) => records.map((entry) => entry.id === verification.id
        ? { ...entry, consumedAt: timestamp, updatedAt: timestamp }
        : entry))
    }
    await userStore.update('users', (users) => users.map((entry) => entry.id === user.id ? { ...entry, lastLoginAt: timestamp, updatedAt: timestamp } : entry))
    const session = await createSession({ ...user, lastLoginAt: timestamp })
    return { user: { ...user, lastLoginAt: timestamp }, ...session }
  }

  async function signIn({ identifier, password, rateLimitKey = 'unknown' }) {
    const now = clock().getTime()
    const attempt = attemptsByKey.get(rateLimitKey)
    if (attempt && attempt.resetAt > now && attempt.count >= 10) throw new JsonAuthError(429, 'RATE_LIMITED', 'Too many sign-in attempts. Try again shortly.')
    const updatedAttempt = attempt && attempt.resetAt > now ? { ...attempt, count: attempt.count + 1 } : { count: 1, resetAt: now + 60_000 }
    attemptsByKey.set(rateLimitKey, updatedAttempt)

    const user = await findActiveProfile(identifier)
    const normalized = user ? normalizeEmail(user.email) : normalizeEmail(identifier)
    const accounts = await authStore.read('accounts')
    const account = accounts.find((entry) => entry.email === normalized && (!user || entry.userId === user.id))
    const valid = Boolean(account && typeof password === 'string' && await passwordMatches(password, account.passwordHash))
    if (!valid || !user || !account) throw new JsonAuthError(401, 'UNAUTHORIZED', 'Email or password is incorrect')
    attemptsByKey.delete(rateLimitKey)
    const timestamp = nowIso(clock())
    await userStore.update('users', (users) => users.map((entry) => entry.id === user.id ? { ...entry, lastLoginAt: timestamp, updatedAt: timestamp } : entry))
    const session = await createSession(user)
    return { user: { ...user, lastLoginAt: timestamp }, ...session }
  }

  async function issueAccountSetupToken(userId) {
    const users = await userStore.read('users')
    const user = users.find((entry) => entry.id === userId && entry.status === 'active')
    if (!user) throw new JsonAuthError(404, 'NOT_FOUND', 'Active user profile not found')
    const accounts = await authStore.read('accounts')
    if (accounts.some((entry) => entry.userId === userId)) throw new JsonAuthError(409, 'CONFLICT', 'An account is already set up for this profile')
    const token = randomBytes(24).toString('base64url')
    const timestamp = nowIso(clock())
    const record = {
      id: id('ver'),
      userId,
      identifier: normalizeEmail(user.email),
      purpose: 'account_setup',
      tokenHash: tokenDigest(token),
      expiresAt: nowIso(new Date(clock().getTime() + VERIFICATION_LIFETIME_MS)),
      consumedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await authStore.update('verifications', (records) => [
      ...records.filter((entry) => entry.userId !== userId || entry.consumedAt !== null || Date.parse(entry.expiresAt) <= clock().getTime()),
      record,
    ])
    return token
  }

  async function getSessionByToken(token) {
    if (!token || typeof token !== 'string' || token.length > 200) return null
    const digest = tokenDigest(token)
    const sessions = await authStore.read('sessions')
    const session = sessions.find((entry) => entry.tokenHash === digest && Date.parse(entry.expiresAt) > clock().getTime())
    if (!session) return null
    const users = await userStore.read('users')
    const user = users.find((entry) => entry.id === session.userId)
    if (!user) return null
    return { user, expiresAt: session.expiresAt }
  }

  async function signOut(token) {
    if (!token || typeof token !== 'string') return
    const digest = tokenDigest(token)
    await authStore.update('sessions', (sessions) => sessions.filter((entry) => entry.tokenHash !== digest))
  }

  return { completeSignUp, signIn, issueAccountSetupToken, getSessionByToken, signOut }
}

export { PASSWORD_MIN_LENGTH, SESSION_LIFETIME_MS }
