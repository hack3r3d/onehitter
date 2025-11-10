const assert = require('assert')
const path = require('path')
const dotenv = require('dotenv')

// Load .env.test first, then fall back to .env
const testEnvPath = path.resolve(__dirname, '..', '.env.test')
const rootEnvPath = path.resolve(__dirname, '..', '.env')
dotenv.config({ path: testEnvPath })
if (!process.env.MONGO_CONNECTION) {
  dotenv.config({ path: rootEnvPath })
}

const OneHitter = require('../dist/cjs/onehitter.js').default
const { MongoClient, ServerApiVersion } = require('mongodb')
const { skipIfNoMongoConnection, skipIfNotTestDatabase } = require('./helpers/gating')
let client

class RecordingLimiter {
  constructor() {
    this.allowed = true
    this.success = 0
    this.failure = 0
    this.before = 0
  }
  async beforeValidate(_contact) {
    this.before += 1
    return this.allowed
  }
  async onSuccess(_contact) {
    this.success += 1
  }
  async onFailure(_contact) {
    this.failure += 1
  }
}

describe('RateLimiter hooks', () => {
  before(async function () {
    skipIfNoMongoConnection(this)
    skipIfNotTestDatabase(this)
    client = new MongoClient(process.env.MONGO_CONNECTION, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    })
    await client.connect()
  })

  after(async () => {
    if (client) await client.close()
  })

  it('blocks validation when beforeValidate returns false (no success/failure callbacks)', async function () {
    this.timeout(10000)
    const limiter = new RecordingLimiter()
    const onehitter = new OneHitter({ rateLimiter: limiter })

    const otp = onehitter.make()
    const contact = process.env.OTP_MESSAGE_TEST_TO || 'ratelimit-block@test.local'

    await onehitter.create(client, { contact, otp, createdAt: new Date() })

    limiter.allowed = false
    const r1 = await onehitter.validate(client, { contact, otp })
    assert.strictEqual(r1, false)
    assert.strictEqual(limiter.before > 0, true)
    assert.strictEqual(limiter.success, 0)
    assert.strictEqual(limiter.failure, 0)

    // OTP should still be present since we blocked; allow now and it should succeed
    limiter.allowed = true
    const r2 = await onehitter.validate(client, { contact, otp })
    assert.strictEqual(r2, true)
    assert.strictEqual(limiter.success, 1)
  })

  it('invokes onSuccess on success and onFailure when OTP no longer valid', async function () {
    this.timeout(10000)
    const limiter = new RecordingLimiter()
    const onehitter = new OneHitter({ rateLimiter: limiter })

    const otp = onehitter.make()
    const contact = process.env.OTP_MESSAGE_TEST_TO || 'ratelimit-callbacks@test.local'

    await onehitter.create(client, { contact, otp, createdAt: new Date() })

    // First validation should succeed
    limiter.allowed = true
    const ok1 = await onehitter.validate(client, { contact, otp })
    assert.strictEqual(ok1, true)
    assert.strictEqual(limiter.success, 1)

    // Second validation should fail; OTP was single-use
    const ok2 = await onehitter.validate(client, { contact, otp })
    assert.strictEqual(ok2, false)
    assert.strictEqual(limiter.failure, 1)
  })
})
