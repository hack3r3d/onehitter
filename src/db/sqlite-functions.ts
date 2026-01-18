import type { InsertOneResult } from 'mongodb'
import { SQLITE_PATH, computeOtpHash, computeContactId, type OtpDoc, type ValidateStatus } from './shared.js'

let sqlite3: any | undefined
let db: any | null = null

// Bundler-safe loader for optional sqlite3 dependency.
// Using eval('require') prevents bundlers from eagerly resolving the sqlite3
// module when the SQLite driver is not used (e.g. when OTP_DB_DRIVER=mongodb).
function loadSqlite3(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const req = eval('require') as NodeRequire
    return req('sqlite3')
  } catch (err: any) {
    // Provide a clear error when the SQLite driver is selected but sqlite3
    // is not installed in the host application.
    const message =
      err && (err as any).code === 'MODULE_NOT_FOUND'
        ? 'The sqlite3 package is not installed. Install it with "npm install sqlite3" to use OTP_DB_DRIVER=sqlite.'
        : `Failed to load sqlite3 driver: ${String(err)}`
    throw new Error(message)
  }
}

function getDb(): any {
  if (db) return db
  // Lazy-load sqlite3 only when the SQLite driver is actually used
  const s: any = sqlite3 ?? (sqlite3 = loadSqlite3())
  db = new s.Database(SQLITE_PATH)
  db.serialize(() => {
    db!.run(
      'CREATE TABLE IF NOT EXISTS otp (\n' +
        '  id INTEGER PRIMARY KEY AUTOINCREMENT,\n' +
        '  contactId TEXT NOT NULL,\n' +
        '  otpHash TEXT NOT NULL,\n' +
        '  createdAt INTEGER NOT NULL\n' +
      ')',
    )
    db!.run('CREATE INDEX IF NOT EXISTS idx_otp_contact_hash ON otp(contactId, otpHash)')
    db!.run('CREATE INDEX IF NOT EXISTS idx_otp_createdAt ON otp(createdAt)')
  })
  return db
}

export const otpCreate = async (otp: OtpDoc): Promise<InsertOneResult<unknown>> => {
  const database = getDb()
  const createdAt = otp.createdAt ? otp.createdAt.getTime() : Date.now()
  const otpHash = computeOtpHash(otp.contact, otp.otp)
  const contactId = computeContactId(otp.contact)

  return await new Promise((resolve, reject) => {
    database.run(
      'INSERT INTO otp (contactId, otpHash, createdAt) VALUES (?, ?, ?)',
      [contactId, otpHash, createdAt],
      function (this: any, err: any) {
        if (err) return reject(err)
        // Shape it like a Mongo InsertOneResult enough for callers
        resolve({ acknowledged: true, insertedId: this.lastID } as unknown as InsertOneResult<unknown>)
      },
    )
  })
}

export const otpValidateWithStatus = async (
  otp: Pick<OtpDoc, 'contact' | 'otp'>,
  now: Date = new Date(),
  ttlSeconds?: number,
): Promise<ValidateStatus> => {
  const database = getDb()
  const otpHash = computeOtpHash(otp.contact, otp.otp)
  const contactId = computeContactId(otp.contact)

  return await new Promise<ValidateStatus>((resolve, reject) => {
    // Single-statement atomicity: select the newest id, then conditionally delete it.
    // We avoid explicit BEGIN/COMMIT to prevent nested transaction errors under concurrency.
    database.get(
      'SELECT id, createdAt FROM otp WHERE contactId = ? AND otpHash = ? ORDER BY id DESC LIMIT 1',
      [contactId, otpHash],
      function (err: any, row: any) {
        if (err) return reject(err)
        if (!row) return resolve('not_found')

        const id = row.id as number
        const createdAtMs = Number(row.createdAt)
        database.run('DELETE FROM otp WHERE id = ?', [id], function (this: any, delErr: any) {
          if (delErr) return reject(delErr)
          // If another concurrent validator deleted it first, changes will be 0
          if (this.changes !== 1) return resolve('not_found')

          const ttlEnv = Number(process.env.OTP_EXPIRY)
          const ttl = Number.isFinite(ttlEnv) ? ttlEnv : (typeof ttlSeconds === 'number' ? ttlSeconds : undefined)
          if (typeof ttl === 'number' && ttl > 0) {
            const ageMs = now.getTime() - createdAtMs
            if (ageMs > ttl * 1000) return resolve('expired')
          }
          return resolve('ok')
        })
      },
    )
  })
}
