export interface EntityRepository<T extends { id: string }> {
  list(): Promise<T[]>
  findById(id: string): Promise<T | null>
  create(record: T): Promise<T>
  update(id: string, changes: Partial<T>): Promise<T>
  deactivate(id: string): Promise<T>
}

export interface SingletonRepository<T> {
  get(): Promise<T>
  update(changes: Partial<T>): Promise<T>
}
