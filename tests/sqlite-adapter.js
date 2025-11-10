const assert = require('assert')
const proxyquire = require('proxyquire')

// Target module is built CJS so nyc attributes coverage: dist/cjs/db/sqlite-adapter.js
const MODULE_PATH = '../dist/cjs/db/sqlite-adapter.js'

describe('SqliteAdapter (unit)', () => {
  it('exposes name = "sqlite"', () => {
    const { SqliteAdapter } = proxyquire(MODULE_PATH, {
      './sqlite-functions': {}
    })
    const a = new SqliteAdapter()
    assert.strictEqual(a.name, 'sqlite')
  })

  it('create() forwards args.otp to otpCreate and returns its result', async () => {
    const calls = { otpCreate: [] }
    const stubResult = { acknowledged: true, insertedId: 42 }
    const { SqliteAdapter } = proxyquire(MODULE_PATH, {
      './sqlite-functions': {
        otpCreate: async (otp) => { calls.otpCreate.push(otp); return stubResult },
      },
    })

    const a = new SqliteAdapter()
    const otp = { contact: 'x@y.z', otp: '123456', createdAt: new Date() }

    // pass a fake client; adapter should ignore it and only pass otp
    const res = await a.create({ client: { any: 'thing' }, otp })

    assert.strictEqual(res, stubResult)
    assert.strictEqual(calls.otpCreate.length, 1)
    assert.deepStrictEqual(calls.otpCreate[0], otp)
  })

  it('validateWithStatus() forwards args.otp to otpValidateWithStatus and returns its result', async () => {
    const calls = { otpValidateWithStatus: [] }
    const stubStatus = 'ok'
    const { SqliteAdapter } = proxyquire(MODULE_PATH, {
      './sqlite-functions': {
        otpValidateWithStatus: async (otp) => { calls.otpValidateWithStatus.push(otp); return stubStatus },
      },
    })

    const a = new SqliteAdapter()
    const otp = { contact: 'user@example.com', otp: '999999' }

    // pass a fake client; adapter should ignore it and only pass otp
    const status = await a.validateWithStatus({ client: { not: 'used' }, otp })

    assert.strictEqual(status, stubStatus)
    assert.strictEqual(calls.otpValidateWithStatus.length, 1)
    assert.deepStrictEqual(calls.otpValidateWithStatus[0], otp)
  })
})
