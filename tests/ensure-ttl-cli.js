const assert = require('assert')
const proxyquire = require('proxyquire')

// Ensure fresh load each test
function fresh(modulePath, stubs) {
  try { delete require.cache[require.resolve(modulePath)] } catch {}
  return proxyquire.noCallThru().noPreserveCache()(modulePath, stubs)
}

function makeMongoFake(indexes = []) {
  const calls = { connect: 0, close: 0 }
  class MongoClient {
    constructor() {}
    async connect() { calls.connect++ }
    async close() { calls.close++ }
    db() {
      return {
        collection() {
          return {
            async indexes() { return indexes },
            async dropIndex() { /* no-op */ },
            async createIndex() { /* no-op */ },
          }
        },
      }
    }
  }
  return { MongoClient, calls }
}

describe('ensure-ttl CLI main()', () => {
  const save = { log: console.log, error: console.error, exit: process.exit }
  let logs, errors, exitCode

  beforeEach(() => {
    logs = []
    errors = []
    exitCode = undefined
    console.log = (...a) => { logs.push(a.join(' ')) }
    console.error = (...a) => { errors.push(a.join(' ')) }
    process.exit = (code) => { exitCode = code }
    // minimal env for ensureCreatedAtTTLIndex
    process.env.MONGO_DATABASE = 'onehitter-test'
    process.env.MONGO_COLLECTION = 'otps'
  })

  afterEach(() => {
    console.log = save.log
    console.error = save.error
    process.exit = save.exit
  })

  it('logs success and exits 0 with TTL from OTP_EXPIRY', async () => {
    process.env.OTP_EXPIRY = '123'
    const { MongoClient } = makeMongoFake([])
    const mod = fresh('../dist/cjs/db/ensure-ttl.js', {
      '../config': { MONGO_CONNECTION: 'mongodb://unit-test', OTP_MONGO_CONNECTION: 'mongodb://unit-test' },
      'mongodb': { MongoClient, ServerApiVersion: { v1: 'v1' } },
    })

    try {
      await mod.main()
    } catch (e) {
      // process.exit is expected to throw our sentinel error
      if (!String(e.message).startsWith('exit:')) throw e
    }

    assert.strictEqual(exitCode, 0)
    assert(logs.some(l => l.includes('[ensure-ttl]') && l.includes('ttl=123s')))
  })

  it('throws when MONGO_CONNECTION missing (pre-flight)', async () => {
    delete process.env.OTP_EXPIRY
    const { MongoClient } = makeMongoFake([])
    const mod = fresh('../dist/cjs/db/ensure-ttl.js', {
      '../config': { MONGO_CONNECTION: undefined, OTP_MONGO_CONNECTION: undefined },
      'mongodb': { MongoClient, ServerApiVersion: { v1: 'v1' } },
    })

    await assert.rejects(() => mod.main(), /MONGO_CONNECTION is required to run ensure-ttl/)
    assert.strictEqual(exitCode, undefined)
  })
})