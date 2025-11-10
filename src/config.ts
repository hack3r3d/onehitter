import 'dotenv-safe/config'

function must(key: string): string {
  const v = process.env[key]
  if (v == null || String(v).trim().length === 0) {
    throw new Error(`Missing required env: ${key}`)
  }
  return v
}

function mustNumber(key: string): number {
  const raw = must(key)
  const num = Number(raw)
  if (!Number.isFinite(num)) throw new Error(`Env ${key} must be a finite number, got: ${raw}`)
  return num
}

function boolOf(key: string, def = false): boolean {
  const v = process.env[key]
  if (v == null) return def
  return v === 'true' || v === '1'
}

function numberOf(key: string, def: number | undefined): number | undefined {
  const v = process.env[key]
  if (v == null) return def
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

// Database driver selection
const DB_DRIVER: 'mongodb' | 'sqlite' = (process.env.DB_DRIVER as any) === 'sqlite' ? 'sqlite' : 'mongodb'

// Mongo configuration (required when DB_DRIVER=mongodb)
export const MONGO_CONNECTION = DB_DRIVER === 'mongodb' ? must('MONGO_CONNECTION') : ''
export const MONGO_DATABASE = DB_DRIVER === 'mongodb' ? must('MONGO_DATABASE') : ''
export const MONGO_COLLECTION = DB_DRIVER === 'mongodb' ? must('MONGO_COLLECTION') : ''

// Email/Sending configuration
export const SES_REGION = process.env.SES_REGION ?? 'us-east-1'
export const OTP_MESSAGE_FROM = must('OTP_MESSAGE_FROM')
export const OTP_MESSAGE_SUBJECT = process.env.OTP_MESSAGE_SUBJECT ?? 'One-time password'
export const OTP_URL = must('OTP_URL')
export const OTP_EXPIRY = mustNumber('OTP_EXPIRY')

// OTP generation configuration
export const OTP_LENGTH = numberOf('OTP_LENGTH', 6) ?? 6
export const OTP_LETTERS_UPPER = boolOf('OTP_LETTERS_UPPER', false)
export const OTP_LETTERS_LOWER = boolOf('OTP_LETTERS_LOWER', false)
export const OTP_DIGITS = boolOf('OTP_DIGITS', true)
export const OTP_SPECIAL_CHARS = boolOf('OTP_SPECIAL_CHARS', false)

// Security
export const OTP_PEPPER = process.env.OTP_PEPPER

// Optional built-in limiter flags
export const ONEHITTER_ENABLE_INMEM_LIMITER = boolOf('ONEHITTER_ENABLE_INMEM_LIMITER', false)
export const ONEHITTER_LIMIT_MAX = numberOf('ONEHITTER_LIMIT_MAX', undefined)
export const ONEHITTER_LIMIT_WINDOW_MS = numberOf('ONEHITTER_LIMIT_WINDOW_MS', undefined)
export const ONEHITTER_LIMIT_COOLDOWN_MS = numberOf('ONEHITTER_LIMIT_COOLDOWN_MS', undefined)
