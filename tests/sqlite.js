const assert = require('assert')
const path = require('path')
const dotenv = require('dotenv')

// Do not require Mongo envs for this suite
const testEnvPath = path.resolve(__dirname, '..', '.env.test')
// Load integration env from .env.test only (optional for this suite)
dotenv.config({ path: testEnvPath })

// Force SQLite driver for this file within this suite only
const __PREV_DB_DRIVER = process.env.OTP_DB_DRIVER
process.env.SQLITE_PATH = process.env.SQLITE_PATH || ':memory:'
// Provide required non-Mongo envs if missing
process.env.OTP_MESSAGE_FROM = process.env.OTP_MESSAGE_FROM || 'noreply@example.com'
process.env.OTP_MESSAGE_SUBJECT = process.env.OTP_MESSAGE_SUBJECT || 'One-time password'
process.env.OTP_URL = process.env.OTP_URL || 'https://example.com'
process.env.OTP_EXPIRY = process.env.OTP_EXPIRY || '1800'

const OneHitter = require('../dist/cjs/onehitter.js').default

const hasSqlite = (() => {
  try { require.resolve('sqlite3'); return true } catch { return false }
})()
const d = hasSqlite ? describe : describe.skip

d('OneHitter (SQLite driver)', () => {
  before(() => { process.env.OTP_DB_DRIVER = 'sqlite' })
  after(() => { process.env.OTP_DB_DRIVER = __PREV_DB_DRIVER })

  it('create and validate success path (no client required)', async () => {
    const one = new OneHitter()
    const otp = one.make()
    const contact = 'sqlite-user@test.local'

    const res = await one.create({ contact, otp, createdAt: new Date() })
    assert.ok(res && res.insertedId != null)

    const ok = await one.validate({ contact, otp })
    assert.strictEqual(ok, true)
  })

  it('validate-fail with wrong code (no client required)', async () => {
    const one = new OneHitter()
    const otp = one.make()
    const contact = 'sqlite-fail@test.local'

    await one.create({ contact, otp, createdAt: new Date() })

    const bad = 'not-the-code'
    const ok = await one.validate({ contact, otp: bad })
    assert.strictEqual(ok, false)
  })
})
