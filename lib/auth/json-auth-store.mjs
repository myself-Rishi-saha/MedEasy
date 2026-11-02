import path from 'node:path'
import { z } from 'zod'
import { JsonFileStore } from '../storage/json-file-store.mjs'

const timestamp = z.iso.datetime()
const accountSchema = z.object({
  id: z.string().regex(/^acc_[a-z0-9]+$/),
  userId: z.string().regex(/^[a-z]{3}_[a-z0-9]+$/),
  email: z.email(),
  passwordHash: z.string().regex(/^scrypt\$[A-Za-z0-9_-]{10,}\$[A-Za-z0-9_-]{40,}$/),
  createdAt: timestamp,
  updatedAt: timestamp,
})
const sessionSchema = z.object({
  id: z.string().regex(/^ses_[a-z0-9]+$/),
  userId: z.string().regex(/^[a-z]{3}_[a-z0-9]+$/),
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
})
const verificationSchema = z.object({
  id: z.string().regex(/^ver_[a-z0-9]+$/),
  userId: z.string().regex(/^[a-z]{3}_[a-z0-9]+$/),
  identifier: z.email(),
  purpose: z.literal('account_setup'),
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: timestamp,
  consumedAt: timestamp.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

const schemas = { accounts: z.array(accountSchema), sessions: z.array(sessionSchema), verifications: z.array(verificationSchema) }
const runtimeDir = process.env.MED_EASY_DATA_DIR
  ? path.resolve(process.env.MED_EASY_DATA_DIR)
  : path.resolve(process.cwd(), 'data/runtime')

export const authJsonStore = new JsonFileStore({
  runtimeDir,
  seedDir: path.resolve(process.cwd(), 'data/seeds'),
  collections: Object.keys(schemas),
  validate(collection, value) {
    const schema = schemas[collection]
    if (!schema) throw new Error('Unknown auth collection')
    return schema.parse(value)
  },
})

export { accountSchema, sessionSchema, verificationSchema }
