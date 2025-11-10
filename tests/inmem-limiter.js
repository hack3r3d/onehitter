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
const { InMemoryRateLimiter } = require('../dist/cjs/rate-limiter.js')
const { MongoClient, ServerApiVersion } = require('mongodb')
const client = new MongoClient(process.env.MONGO_CONNECTION, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

function sleep(ms) { return new Promise(res => setTimeout(res, ms)) }

describe('Env-backed InMemoryRateLimiter', () => {
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

  it('blocks after N failures, then allows after cooldown, preserving OTP while blocked', async function () {
    this.timeout(10000)
    const limiter = new InMemoryRateLimiter({ max: 2, windowMs: 60000, cooldownMs: 50 })
    const onehitter = new OneHitter({ rateLimiter: limiter })

    const otp = onehitter.make()
    const contact = process.env.OTP_MESSAGE_TEST_TO || 'inmem-limit@test.local'

    await onehitter.create(client, { contact, otp, createdAt: new Date() })

    // Two failures to hit the max
    const bad = 'not-the-otp'
    const f1 = await onehitter.validate(client, { contact, otp: bad })
    const f2 = await onehitter.validate(client, { contact, otp: bad })
    assert.strictEqual(f1, false)
    assert.strictEqual(f2, false)

    // Immediately after reaching max, correct OTP should be blocked by limiter (not consumed)
    const blocked = await onehitter.validate(client, { contact, otp })
    assert.strictEqual(blocked, false, 'expected limiter to block after reaching max failures')

    // Wait for cooldown to elapse, then correct OTP should validate successfully
    await sleep(80)
    const success = await onehitter.validate(client, { contact, otp })
    assert.strictEqual(success, true)
  })
})
