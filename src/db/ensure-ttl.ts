import { MongoClient, ServerApiVersion } from 'mongodb'
import { MONGO_CONNECTION } from '../config'

/**
 * Ensure there is a TTL index on createdAt.
 * If an index exists with a different expireAfterSeconds, it will be recreated.
 */
export async function ensureCreatedAtTTLIndex(client: MongoClient, ttlSeconds: number) {
  const dbName = process.env.OTP_MONGO_DATABASE
  const collName = process.env.OTP_MONGO_COLLECTION
  if (!dbName || !collName) {
    throw new Error('Missing OTP_MONGO_DATABASE or OTP_MONGO_COLLECTION')
  }

  const db = client.db(dbName)
  const coll = db.collection(collName)

  const indexes = await coll.indexes()
  const existing = indexes.find((idx: any) => idx.key && idx.key.createdAt === 1 && typeof idx.expireAfterSeconds !== 'undefined')

  const name = existing?.name || 'onehitter_createdAt_ttl'

  if (!existing) {
    await coll.createIndex({ createdAt: 1 }, { expireAfterSeconds: ttlSeconds, name })
    return { action: 'created', name, expireAfterSeconds: ttlSeconds }
  }

  if (Number(existing.expireAfterSeconds) !== Number(ttlSeconds)) {
    // Recreate with new TTL
    await coll.dropIndex(String(existing.name))
    await coll.createIndex({ createdAt: 1 }, { expireAfterSeconds: ttlSeconds, name })
    return { action: 'updated', name, expireAfterSeconds: ttlSeconds }
  }

  return { action: 'unchanged', name, expireAfterSeconds: existing.expireAfterSeconds }
}

// CLI entrypoint (exported for tests)
export async function main() {
  const parsed = Number(process.env.OTP_EXPIRY)
  const ttlSeconds = Number.isFinite(parsed) && parsed > 0 ? parsed : 1800

  const conn = MONGO_CONNECTION
  if (!conn) throw new Error('MONGO_CONNECTION is required to run ensure-ttl')
  const client = new MongoClient(conn, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  })

  try {
    await client.connect()
    const result = await ensureCreatedAtTTLIndex(client, ttlSeconds)
    console.log(`[ensure-ttl] ${result.action}: index=${result.name} ttl=${result.expireAfterSeconds}s`)
    process.exit(0)
  } catch (err) {
    console.error('[ensure-ttl] error:', err)
    process.exit(1)
  } finally {
    try { await client.close() } catch {}
  }
}

// Only run when executed directly (not when imported)
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  main()
}
