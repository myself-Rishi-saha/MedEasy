export class JsonStoreError extends Error {
  code: string
  constructor(code: string, message: string)
}

export class JsonFileStore {
  constructor(options: {
    runtimeDir: string
    seedDir: string
    collections: readonly string[]
    validate: (collection: string, value: unknown) => unknown
  })
  read<T = unknown>(collection: string): Promise<T>
  update<T = unknown>(collection: string, updater: (current: T) => T | Promise<T>): Promise<T>
  updateMany<T extends Record<string, unknown> = Record<string, unknown>>(collections: readonly string[], updater: (current: T) => T | Promise<T>): Promise<T>
  resetToSeeds(): Promise<string[]> 
}
