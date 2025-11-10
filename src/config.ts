// IMPORTANT: Do not read or mutate env at import for library code.
// Applications should load and validate env; this module only parses values.

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

// Database driver selection (non-throwing)
const DB_DRIVER: 'mongodb' | 'sqlite' = (process.env.DB_DRIVER as any) === 'sqlite' ? 'sqlite' : 'mongodb'

// Mongo configuration (do not throw at import)
export const MONGO_CONNECTION: string | undefined = process.env.MONGO_CONNECTION
export const MONGO_DATABASE: string | undefined = process.env.MONGO_DATABASE
export const MONGO_COLLECTION: string | undefined = process.env.MONGO_COLLECTION

// Email/Sending configuration (safe defaults where reasonable)
export const SES_REGION: string = process.env.SES_REGION ?? 'us-east-1'
export const OTP_MESSAGE_FROM: string | undefined = process.env.OTP_MESSAGE_FROM
export const OTP_MESSAGE_SUBJECT: string = process.env.OTP_MESSAGE_SUBJECT ?? 'One-time password'
export const OTP_URL: string | undefined = process.env.OTP_URL
export const OTP_EXPIRY: number | undefined = numberOf('OTP_EXPIRY', undefined)

// OTP generation configuration
export const OTP_LENGTH: number = numberOf('OTP_LENGTH', 6) ?? 6
export const OTP_LETTERS_UPPER: boolean = boolOf('OTP_LETTERS_UPPER', false)
export const OTP_LETTERS_LOWER: boolean = boolOf('OTP_LETTERS_LOWER', false)
export const OTP_DIGITS: boolean = boolOf('OTP_DIGITS', true)
export const OTP_SPECIAL_CHARS: boolean = boolOf('OTP_SPECIAL_CHARS', false)

// Security
export const OTP_PEPPER: string | undefined = process.env.OTP_PEPPER

// Optional built-in limiter flags
export const ONEHITTER_ENABLE_INMEM_LIMITER: boolean = boolOf('ONEHITTER_ENABLE_INMEM_LIMITER', false)
export const ONEHITTER_LIMIT_MAX: number | undefined = numberOf('ONEHITTER_LIMIT_MAX', undefined)
export const ONEHITTER_LIMIT_WINDOW_MS: number | undefined = numberOf('ONEHITTER_LIMIT_WINDOW_MS', undefined)
export const ONEHITTER_LIMIT_COOLDOWN_MS: number | undefined = numberOf('ONEHITTER_LIMIT_COOLDOWN_MS', undefined)
