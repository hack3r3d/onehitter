import type { MongoClient, InsertOneResult } from 'mongodb'

export type ValidateStatus = 'ok' | 'not_found' | 'expired'

export interface OtpDoc {
  contact: string
  otp: string
  createdAt: Date
  // _id is Mongo-specific; omitted here on purpose
}

export function currentDriver(): 'mongodb' | 'sqlite' {
  return (process.env.DB_DRIVER as any) === 'sqlite' ? 'sqlite' : 'mongodb'
}
export const SQLITE_PATH: string = process.env.SQLITE_PATH ?? ':memory:'

export interface DbAdapter {
  readonly name: 'mongodb' | 'sqlite'
  create(args: { client?: MongoClient; otp: OtpDoc }): Promise<InsertOneResult<unknown>>
  validateWithStatus(args: { client?: MongoClient; otp: Pick<OtpDoc, 'contact' | 'otp'> }): Promise<ValidateStatus>
}

export const computeOtpHash = (contact: string, otp: string): string => {
  const pepper = process.env.OTP_PEPPER || ''
  const message = `${contact}|${otp}`
  if (pepper) {
    // Use HMAC-SHA256 when a pepper (shared secret) is provided
    const crypto = require('crypto') as typeof import('crypto')
    return crypto.createHmac('sha256', pepper).update(message, 'utf8').digest('hex')
  }
  // Fallback to SHA-256 if no pepper provided
  const crypto = require('crypto') as typeof import('crypto')
  return crypto.createHash('sha256').update(message, 'utf8').digest('hex')
}
