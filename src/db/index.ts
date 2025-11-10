import type { DbAdapter } from './shared'
import { DB_DRIVER } from './shared'
import { MongoAdapter } from './mongo-adapter'
import { SqliteAdapter } from './sqlite-adapter'

let adapter: DbAdapter | null = null

export function getAdapter(): DbAdapter {
  if (adapter) return adapter
  adapter = DB_DRIVER === 'sqlite' ? new SqliteAdapter() : new MongoAdapter()
  return adapter
}