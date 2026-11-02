import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { JsonFileStore } from '../lib/storage/json-file-store.mjs'
import { createJsonAuthService, JsonAuthError } from '../lib/auth/json-auth.mjs'

async function createHarness() {
  const root = await mkdtemp(path.join(tmpdir(), 'med-easy-auth-'))
  const seedDir = path.join(root, 'seeds')
  const runtimeDir = path.join(root, 'runtime')
  await mkdir(seedDir, { recursive: true })
  const admin = { id: 'usr_001', name: 'Aarav Patel', email: 'aarav.admin@example.test', role: 'admin', status: 'active', lastLoginAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
  await Promise.all([
    writeFile(path.join(seedDir, 'users.json'), JSON.stringify([admin])),
    writeFile(path.join(seedDir, 'accounts.json'), '[]'),
    writeFile(path.join(seedDir, 'sessions.json'), '[]'),
    writeFile(path.join(seedDir, 'verifications.json'), '[]'),
  ])
  const validate = (_collection, value) => {
    if (!Array.isArray(value)) throw new Error('Expected an array')
    return value
  }
  const userStore = new JsonFileStore({ runtimeDir, seedDir, collections: ['users'], validate })
  const authStore = new JsonFileStore({ runtimeDir, seedDir, collections: ['accounts', 'sessions', 'verifications'], validate })
  let currentTime = new Date('2026-10-31T12:00:00.000Z')
  const auth = createJsonAuthService({ authStore, userStore, clock: () => new Date(currentTime) })
  return { root, runtimeDir, auth, authStore, userStore, admin, setTime: (value) => { currentTime = new Date(value) } }
}

test('bootstraps one admin and stores only password and session-token hashes', async (context) => {
  const harness = await createHarness()
  context.after(() => rm(harness.root, { recursive: true, force: true }))
  const created = await harness.auth.completeSignUp({ email: harness.admin.email, password: 'A secure local password 2026' })
  assert.equal(created.user.id, harness.admin.id)
  assert.ok(created.token)

  const accounts = await harness.authStore.read('accounts')
  const sessions = await harness.authStore.read('sessions')
  assert.equal(accounts.length, 1)
  assert.notEqual(accounts[0].passwordHash, 'A secure local password 2026')
  assert.match(accounts[0].passwordHash, /^scrypt\$/)
  assert.notEqual(sessions[0].tokenHash, created.token)
  assert.equal((await harness.auth.getSessionByToken(created.token)).user.email, harness.admin.email)

  await assert.rejects(
    harness.auth.completeSignUp({ email: harness.admin.email, password: 'Another secure password 2026' }),
    (error) => error instanceof JsonAuthError && error.status === 409,
  )
})

test('supports email or username sign-in, rejects wrong passwords, and revokes sessions', async (context) => {
  const harness = await createHarness()
  context.after(() => rm(harness.root, { recursive: true, force: true }))
  await harness.auth.completeSignUp({ email: harness.admin.email, password: 'A secure local password 2026' })
  await assert.rejects(
    harness.auth.signIn({ identifier: 'aarav.admin', password: 'incorrect password', rateLimitKey: 'test' }),
    (error) => error instanceof JsonAuthError && error.status === 401,
  )
  const signedIn = await harness.auth.signIn({ identifier: 'aarav.admin', password: 'A secure local password 2026', rateLimitKey: 'test' })
  assert.equal(signedIn.user.id, harness.admin.id)
  assert.ok(await harness.auth.getSessionByToken(signedIn.token))
  await harness.auth.signOut(signedIn.token)
  assert.equal(await harness.auth.getSessionByToken(signedIn.token), null)
})

test('uses expiring one-time JSON verification tokens for invited staff', async (context) => {
  const harness = await createHarness()
  context.after(() => rm(harness.root, { recursive: true, force: true }))
  await harness.auth.completeSignUp({ email: harness.admin.email, password: 'A secure local password 2026' })
  const staff = { ...harness.admin, id: 'usr_002', name: 'Neha Kulkarni', email: 'neha.pharmacist@example.test', role: 'pharmacist' }
  await harness.userStore.update('users', (users) => [...users, staff])
  const token = await harness.auth.issueAccountSetupToken(staff.id)
  const enrolled = await harness.auth.completeSignUp({ email: staff.email, password: 'Another secure local password 2026', verificationToken: token })
  assert.equal(enrolled.user.role, 'pharmacist')
  const verifications = await harness.authStore.read('verifications')
  assert.equal(verifications.length, 1)
  assert.notEqual(verifications[0].tokenHash, token)
  assert.ok(verifications[0].consumedAt)
  await assert.rejects(
    harness.auth.completeSignUp({ email: staff.email, password: 'A third secure password 2026', verificationToken: token }),
    (error) => error instanceof JsonAuthError && error.status === 409,
  )
})

test('expires sessions when their fixed lifetime elapses', async (context) => {
  const harness = await createHarness()
  context.after(() => rm(harness.root, { recursive: true, force: true }))
  const created = await harness.auth.completeSignUp({ email: harness.admin.email, password: 'A secure local password 2026' })
  assert.ok(await harness.auth.getSessionByToken(created.token))
  harness.setTime(created.expiresAt)
  assert.equal(await harness.auth.getSessionByToken(created.token), null)
})

test('auth storage contains no raw password or setup token', async (context) => {
  const harness = await createHarness()
  context.after(() => rm(harness.root, { recursive: true, force: true }))
  await harness.auth.completeSignUp({ email: harness.admin.email, password: 'A secure local password 2026' })
  const staff = { ...harness.admin, id: 'usr_002', email: 'neha.pharmacist@example.test', role: 'pharmacist' }
  await harness.userStore.update('users', (users) => [...users, staff])
  const token = await harness.auth.issueAccountSetupToken(staff.id)
  const stored = await Promise.all(['accounts.json', 'sessions.json', 'verifications.json'].map((name) => readFile(path.join(harness.runtimeDir, name), 'utf8')))
  assert.ok(stored.every((content) => !content.includes('A secure local password 2026') && !content.includes(token)))
})
