import { resolve } from 'node:path'
import { z } from 'zod'
import { entitySchemas } from '@/lib/domain/schemas'
import { JsonFileStore } from './json-file-store.mjs'

export const entityCollections = Object.keys(entitySchemas) as Array<keyof typeof entitySchemas>
const singletonCollections = new Set(['pharmacy-settings', 'tax-settings', 'invoice-settings', 'inventory-settings'])

function validateCollection(collection: string, value: unknown) {
  const schema = entitySchemas[collection as keyof typeof entitySchemas]
  if (!schema) throw new Error('Unknown collection')
  return singletonCollections.has(collection)
    ? schema.parse(value)
    : z.array(schema).parse(value)
}

const runtimeDirectory = process.env.MED_EASY_DATA_DIR
  ? resolve(process.env.MED_EASY_DATA_DIR)
  : resolve(process.cwd(), 'data/runtime')

export const jsonStore = new JsonFileStore({
  runtimeDir: runtimeDirectory,
  seedDir: resolve(process.cwd(), 'data/seeds'),
  collections: entityCollections,
  validate: validateCollection,
})
