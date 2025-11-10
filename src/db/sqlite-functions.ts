import type { InsertOneResult } from 'mongodb'
import sqlite3 from 'sqlite3'
import { SQLITE_PATH, computeOtpHash, type OtpDoc, type ValidateStatus } from './shared'

let db: sqlite3.Database | null = null

function getDb(): sqlite3.Database {
  if (db) return db
  db = new sqlite3.Database(SQLITE_PATH)
  db.serialize(() => {
    db!.run(
      'CREATE TABLE IF NOT EXISTS otp (\n' +
        '  id INTEGER PRIMARY KEY AUTOINCREMENT,\n' +
        '  contact TEXT NOT NULL,\n' +
        '  otpHash TEXT NOT NULL,\n' +
        '  createdAt INTEGER NOT NULL\n' +
      ')',
    )
    db!.run('CREATE INDEX IF NOT EXISTS idx_otp_contact_hash ON otp(contact, otpHash)')
    db!.run('CREATE INDEX IF NOT EXISTS idx_otp_createdAt ON otp(createdAt)')
  })
  return db
}

export const otpCreate = async (otp: OtpDoc): Promise<InsertOneResult<unknown>> => {
  const database = getDb()
  const createdAt = otp.createdAt ? otp.createdAt.getTime() : Date.now()
  const otpHash = computeOtpHash(otp.contact, otp.otp)

  return await new Promise((resolve, reject) => {
    database.run(
      'INSERT INTO otp (contact, otpHash, createdAt) VALUES (?, ?, ?)',
      [otp.contact, otpHash, createdAt],
      function (this: sqlite3.RunResult, err) {
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

  return await new Promise<ValidateStatus>((resolve, reject) => {
    database.serialize(() => {
      database.run('BEGIN IMMEDIATE')
      database.get(
        'SELECT id, createdAt FROM otp WHERE contact = ? AND otpHash = ? ORDER BY id DESC LIMIT 1',
        [otp.contact, otpHash],
        function (err, row: any) {
          if (err) {
            database.run('ROLLBACK')
            return reject(err)
          }
          if (!row) {
            database.run('COMMIT')
            return resolve('not_found')
          }
          const id = row.id as number
          const createdAtMs = Number(row.createdAt)
          database.run('DELETE FROM otp WHERE id = ?', [id], function (delErr) {
            if (delErr) {
              database.run('ROLLBACK')
              return reject(delErr)
            }
            database.run('COMMIT')

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
  })
}