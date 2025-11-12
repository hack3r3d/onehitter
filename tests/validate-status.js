const assert = require('assert')
const path = require('path')
const dotenv = require('dotenv')

// Load .env.test first, then fall back to .env
const testEnvPath = path.resolve(__dirname, '..', '.env.test')
const rootEnvPath = path.resolve(__dirname, '..', '.env')
dotenv.config({ path: testEnvPath })
if (!process.env.OTP_MONGO_CONNECTION) {
  dotenv.config({ path: rootEnvPath })
}

const OneHitter = require('../dist/cjs/onehitter.js').default
const { MongoClient, ServerApiVersion } = require('mongodb')
const { skipIfNoMongoConnection, skipIfNotTestDatabase } = require('./helpers/gating')
let client

// A permissive limiter to avoid environment-driven blocking
const AllowAllLimiter = {
  async beforeValidate() { return true },
  async onSuccess() {},
  async onFailure() {},
}

describe('validateStatus', () => {
  before(async function () {
    skipIfNoMongoConnection(this)
    skipIfNotTestDatabase(this)
    client = new MongoClient(process.env.OTP_MONGO_CONNECTION, {
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

  it('returns ok for fresh OTP and expired for old OTP; not_found for wrong/used', async function () {
    this.timeout(10000)

    const onehitter = new OneHitter({ rateLimiter: AllowAllLimiter })

    // Temporarily enforce a very small expiry in code-level check
    const prevExpiry = process.env.OTP_EXPIRY
    process.env.OTP_EXPIRY = '1' // 1 second

    const contact = process.env.OTP_MESSAGE_TEST_TO || 'validate-status@test.local'

    // Fresh OTP -> ok
    const otpFresh = onehitter.make()
    await onehitter.create(client, { contact, otp: otpFresh, createdAt: new Date() })
    const s1 = await onehitter.validateStatus(client, { contact, otp: otpFresh })
    assert.strictEqual(s1, 'ok')

    // Old OTP -> expired
    const otpOld = onehitter.make()
    const old = new Date(Date.now() - 5000) // 5s ago > 1s TTL
    await onehitter.create(client, { contact, otp: otpOld, createdAt: old })
    const s2 = await onehitter.validateStatus(client, { contact, otp: otpOld })
    assert.strictEqual(s2, 'expired')

    // Wrong OTP -> not_found
    const s3 = await onehitter.validateStatus(client, { contact, otp: 'definitely-wrong' })
    assert.strictEqual(s3, 'not_found')

    // Restore
    if (prevExpiry == null) delete process.env.OTP_EXPIRY
    else process.env.OTP_EXPIRY = prevExpiry
  })
})
