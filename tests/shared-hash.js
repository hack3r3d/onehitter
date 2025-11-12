const assert = require('assert')
const crypto = require('crypto')

// Load from built JS so nyc maps coverage to dist/cjs/**
const { computeOtpHash } = require('../dist/cjs/db/shared.js')

describe('computeOtpHash (env pepper and optional salt)', () => {
  const prevPepper = process.env.OTP_PEPPER
  const prevNodeEnv = process.env.NODE_ENV
  const prevAllow = process.env.ONEHITTER_ALLOW_INSECURE_HASH

  before(() => {
    // Default to production with a pepper so other tests are unaffected
    process.env.NODE_ENV = 'production'
    process.env.OTP_PEPPER = 'test-pepper'
    delete process.env.ONEHITTER_ALLOW_INSECURE_HASH
  })

  after(() => {
    if (prevPepper == null) delete process.env.OTP_PEPPER
    else process.env.OTP_PEPPER = prevPepper
    if (prevNodeEnv == null) delete process.env.NODE_ENV
    else process.env.NODE_ENV = prevNodeEnv
    if (prevAllow == null) delete process.env.ONEHITTER_ALLOW_INSECURE_HASH
    else process.env.ONEHITTER_ALLOW_INSECURE_HASH = prevAllow
  })

  it('uses HMAC-SHA256 with pepper and respects optional salt', () => {
    const contact = 'user@example.com'
    const otp = '123456'

    const h1 = computeOtpHash(contact, otp)
    const expected1 = crypto.createHmac('sha256', process.env.OTP_PEPPER)
      .update(`${contact}|${otp}`, 'utf8').digest('hex')
    assert.strictEqual(h1, expected1)

    const h2 = computeOtpHash(contact, otp, { salt: 's1' })
    const expected2 = crypto.createHmac('sha256', process.env.OTP_PEPPER)
      .update(`${contact}|${otp}|s1`, 'utf8').digest('hex')
    assert.strictEqual(h2, expected2)

    const h3 = computeOtpHash(contact, otp, { salt: 's2' })
    assert.notStrictEqual(h2, h3, 'different salt should change the HMAC output')
  })

  it('falls back to SHA-256 when no pepper in non-production', () => {
    const savedEnv = { NODE_ENV: process.env.NODE_ENV, OTP_PEPPER: process.env.OTP_PEPPER, ALLOW: process.env.ONEHITTER_ALLOW_INSECURE_HASH }
    try {
      process.env.NODE_ENV = 'development'
      delete process.env.OTP_PEPPER
      delete process.env.ONEHITTER_ALLOW_INSECURE_HASH

      const out = computeOtpHash('u@example.com', '654321')
      const expected = crypto.createHash('sha256').update('u@example.com|654321', 'utf8').digest('hex')
      assert.strictEqual(out, expected)
    } finally {
      process.env.NODE_ENV = savedEnv.NODE_ENV
      if (savedEnv.OTP_PEPPER == null) delete process.env.OTP_PEPPER; else process.env.OTP_PEPPER = savedEnv.OTP_PEPPER
      if (savedEnv.ALLOW == null) delete process.env.ONEHITTER_ALLOW_INSECURE_HASH; else process.env.ONEHITTER_ALLOW_INSECURE_HASH = savedEnv.ALLOW
    }
  })

  it('in production without pepper throws unless ONEHITTER_ALLOW_INSECURE_HASH=true', () => {
    const savedEnv = { NODE_ENV: process.env.NODE_ENV, OTP_PEPPER: process.env.OTP_PEPPER, ALLOW: process.env.ONEHITTER_ALLOW_INSECURE_HASH }
    try {
      process.env.NODE_ENV = 'production'
      delete process.env.OTP_PEPPER
      delete process.env.ONEHITTER_ALLOW_INSECURE_HASH

      assert.throws(() => computeOtpHash('x@example.com', '000000'), /OTP_PEPPER must be set/)

      process.env.ONEHITTER_ALLOW_INSECURE_HASH = 'true'
      const out = computeOtpHash('x@example.com', '000000')
      const expected = crypto.createHash('sha256').update('x@example.com|000000', 'utf8').digest('hex')
      assert.strictEqual(out, expected)
    } finally {
      process.env.NODE_ENV = savedEnv.NODE_ENV
      if (savedEnv.OTP_PEPPER == null) delete process.env.OTP_PEPPER; else process.env.OTP_PEPPER = savedEnv.OTP_PEPPER
      if (savedEnv.ALLOW == null) delete process.env.ONEHITTER_ALLOW_INSECURE_HASH; else process.env.ONEHITTER_ALLOW_INSECURE_HASH = savedEnv.ALLOW
    }
  })
})
