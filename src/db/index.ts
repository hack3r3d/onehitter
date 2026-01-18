import type { DbAdapter } from './shared.js'
import { currentDriver } from './shared.js'
import { MongoAdapter } from './mongo-adapter.js'
import { SqliteAdapter } from './sqlite-adapter.js'

let mongoAdapter: DbAdapter | null = null
let sqliteAdapter: DbAdapter | null = null

export function getAdapter(opts?: { hasClient?: boolean }): DbAdapter {
  // If a MongoClient is provided by the caller, prefer Mongo regardless of env
  const d: 'mongodb' | 'sqlite' = opts?.hasClient ? 'mongodb' : currentDriver()
  if (d === 'sqlite') {
    if (!sqliteAdapter) sqliteAdapter = new SqliteAdapter()
    return sqliteAdapter
  }
  if (!mongoAdapter) mongoAdapter = new MongoAdapter()
  return mongoAdapter
}
