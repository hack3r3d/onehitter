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

// Ensure Mongo driver for this suite
process.env.DB_DRIVER = 'mongodb'
const OneHitter = require('../dist/onehitter.js').default
const { MongoClient, ServerApiVersion } = require('mongodb')
const { skipIfNoMongoConnection, skipIfNotTestDatabase } = require('./helpers/gating')
let client

describe('OneHitter concurrency', () => {
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

  it('validate-atomic-single-success', async function () {
    this.timeout(10000)

    const onehitter = new OneHitter()
    const otp = onehitter.make()
    const contact = process.env.OTP_MESSAGE_TEST_TO || 'concurrency@test.local'

    // Insert OTP
    await onehitter.create(client, { contact, otp, createdAt: new Date() })

    const payload = { contact, otp }

    // Validate concurrently
    const [r1, r2] = await Promise.all([
      onehitter.validate(client, payload),
      onehitter.validate(client, payload),
    ])

    const successes = [r1, r2].filter(Boolean).length
    assert.strictEqual(successes, 1, `expected exactly one success, got r1=${r1}, r2=${r2}`)
  })
})
