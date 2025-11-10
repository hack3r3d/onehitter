const assert = require('assert')
const path = require('path')
const dotenv = require('dotenv')

function setBaselineEnv(overrides = {}) {
  process.env.MONGO_CONNECTION = overrides.MONGO_CONNECTION || 'mongodb://localhost:27017'
  process.env.MONGO_DATABASE = overrides.MONGO_DATABASE || 'onehitter-test'
  process.env.MONGO_COLLECTION = overrides.MONGO_COLLECTION || 'otp'
  process.env.OTP_MESSAGE_FROM = overrides.OTP_MESSAGE_FROM || 'noreply@example.com'
  process.env.OTP_MESSAGE_SUBJECT = overrides.OTP_MESSAGE_SUBJECT || 'One-time password'
  process.env.OTP_URL = overrides.OTP_URL || 'https://example.com'
  process.env.OTP_EXPIRY = overrides.OTP_EXPIRY || '1800'
  process.env.SES_REGION = overrides.SES_REGION || 'us-east-1'
  process.env.OTP_MESSAGE_TEST_TO = overrides.OTP_MESSAGE_TEST_TO || 'user@example.com'
  // caller controls OTP_LENGTH and flags per-test
}

function clearModules() {
  const keys = Object.keys(require.cache)
  for (const k of keys) {
    if (k.endsWith(path.normalize('/dist/config.js')) ||
        k.endsWith(path.normalize('/dist/onehitter.js'))) {
      delete require.cache[k]
    }
  }
}

function loadOneHitter() {
  clearModules()
  return require('../dist/onehitter.js').default
}

describe('OneHitter.make()', () => {
  before(() => {
    // Do not auto-load .env files here; we set env explicitly per test
    dotenv.config({ override: true })
  })

  it('parses OTP_LENGTH as a positive integer', () => {
    setBaselineEnv({})
    process.env.OTP_LENGTH = '8'
    process.env.OTP_LETTERS_UPPER = 'false'
    process.env.OTP_LETTERS_LOWER = 'false'
    process.env.OTP_DIGITS = 'true'
    process.env.OTP_SPECIAL_CHARS = 'false'

    const OneHitter = loadOneHitter()
    const one = new OneHitter()
    const code = one.make()
    assert.strictEqual(code.length, 8)
    assert.match(code, /^[0-9]+$/)
  })

  it('falls back to 6 when OTP_LENGTH is invalid or non-positive', () => {
    setBaselineEnv({})
    process.env.OTP_LENGTH = 'abc' // invalid -> default 6
    process.env.OTP_LETTERS_UPPER = 'false'
    process.env.OTP_LETTERS_LOWER = 'false'
    process.env.OTP_DIGITS = 'true'
    process.env.OTP_SPECIAL_CHARS = 'false'

    let OneHitter = loadOneHitter()
    let one = new OneHitter()
    let code = one.make()
    assert.strictEqual(code.length, 6)

    // Non-positive -> default 6
    process.env.OTP_LENGTH = '0'
    OneHitter = loadOneHitter()
    one = new OneHitter()
    code = one.make()
    assert.strictEqual(code.length, 6)
  })

  it('defaults to digits when all character-class flags are false', () => {
    setBaselineEnv({})
    process.env.OTP_LENGTH = '' // present but empty; internal defaulting yields 6
    process.env.OTP_LETTERS_UPPER = 'false'
    process.env.OTP_LETTERS_LOWER = 'false'
    process.env.OTP_DIGITS = 'false'
    process.env.OTP_SPECIAL_CHARS = 'false'

    const OneHitter = loadOneHitter()
    const one = new OneHitter()
    const code = one.make()
    assert.strictEqual(code.length, 6)
    assert.match(code, /^[0-9]+$/)
  })

  it('upper only produces A-Z', () => {
    setBaselineEnv({})
    process.env.OTP_LENGTH = '10'
    process.env.OTP_LETTERS_UPPER = 'true'
    process.env.OTP_LETTERS_LOWER = 'false'
    process.env.OTP_DIGITS = 'false'
    process.env.OTP_SPECIAL_CHARS = 'false'

    const OneHitter = loadOneHitter()
    const one = new OneHitter()
    const code = one.make()
    assert.strictEqual(code.length, 10)
    assert.match(code, /^[A-Z]+$/)
  })

  it('lower only produces a-z', () => {
    setBaselineEnv({})
    process.env.OTP_LENGTH = '10'
    process.env.OTP_LETTERS_UPPER = 'false'
    process.env.OTP_LETTERS_LOWER = 'true'
    process.env.OTP_DIGITS = 'false'
    process.env.OTP_SPECIAL_CHARS = 'false'

    const OneHitter = loadOneHitter()
    const one = new OneHitter()
    const code = one.make()
    assert.strictEqual(code.length, 10)
    assert.match(code, /^[a-z]+$/)
  })

  it('digits only produces 0-9', () => {
    setBaselineEnv({})
    process.env.OTP_LENGTH = '12'
    process.env.OTP_LETTERS_UPPER = 'false'
    process.env.OTP_LETTERS_LOWER = 'false'
    process.env.OTP_DIGITS = 'true'
    process.env.OTP_SPECIAL_CHARS = 'false'

    const OneHitter = loadOneHitter()
    const one = new OneHitter()
    const code = one.make()
    assert.strictEqual(code.length, 12)
    assert.match(code, /^[0-9]+$/)
  })

  it('special only produces non-alphanumeric', () => {
    setBaselineEnv({})
    process.env.OTP_LENGTH = '12'
    process.env.OTP_LETTERS_UPPER = 'false'
    process.env.OTP_LETTERS_LOWER = 'false'
    process.env.OTP_DIGITS = 'false'
    process.env.OTP_SPECIAL_CHARS = 'true'

    const OneHitter = loadOneHitter()
    const one = new OneHitter()
    const code = one.make()
    assert.strictEqual(code.length, 12)
    // Ensure no letters or digits present
    assert.match(code, /^[^A-Za-z0-9]+$/)
  })
})
