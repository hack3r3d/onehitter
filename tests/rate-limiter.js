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
if (!process.env.MONGO_CONNECTION) {
  console.error('Missing MONGO_CONNECTION. Create .env.test (preferred) or .env with required variables.')
  process.exit(1)
}

const OneHitter = require('../dist/cjs/onehitter.js').default
const { MongoClient, ServerApiVersion } = require('mongodb')
const client = new MongoClient(process.env.MONGO_CONNECTION, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

class RecordingLimiter {
  constructor() {
    this.allowed = true
    this.success = 0
    this.failure = 0
    this.before = 0
  }
  async beforeValidate(contact) {
    this.before += 1
    return this.allowed
  }
  async onSuccess(contact) {
    this.success += 1
  }
  async onFailure(contact) {
    this.failure += 1
  }
}

describe('RateLimiter hooks', () => {
  before(async () => {
    if (!process.env.MONGO_DATABASE || process.env.MONGO_DATABASE.search(/test/) < 0) {
      console.error('You can not run these tests on a database that does not include "test" in the name.')
      process.exit(1)
    }
    await client.connect()
  })

  after(async () => {
    await client.close()
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
