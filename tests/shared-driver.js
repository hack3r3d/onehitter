const assert = require('assert')

// Use built artifact so nyc maps to dist/cjs/db/shared.js
const shared = require('../dist/cjs/db/shared.js')
const { currentDriver } = shared

describe('currentDriver (shared.js line 6)', () => {
  const prev = process.env.OTP_DB_DRIVER

  afterEach(() => {
    if (prev == null) delete process.env.OTP_DB_DRIVER
    else process.env.OTP_DB_DRIVER = prev
  })

  it('returns "sqlite" when OTP_DB_DRIVER=sqlite', () => {
    process.env.OTP_DB_DRIVER = 'sqlite'
    assert.strictEqual(currentDriver(), 'sqlite')
  })

  it('returns "mongodb" by default and when OTP_DB_DRIVER is anything else', () => {
    delete process.env.OTP_DB_DRIVER
    assert.strictEqual(currentDriver(), 'mongodb')

    process.env.OTP_DB_DRIVER = 'not-sqlite'
    assert.strictEqual(currentDriver(), 'mongodb')
  })
})
