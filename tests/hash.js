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

// Ensure Mongo driver for this suite
process.env.DB_DRIVER = 'mongodb'
const OneHitter = require('../dist/cjs/onehitter.js').default
const { MongoClient, ServerApiVersion } = require('mongodb')
const { skipIfNoMongoConnection, skipIfNotTestDatabase } = require('./helpers/gating')
let client

// Ensure a pepper exists for this test context to avoid storing plain SHA-256
if (!process.env.OTP_PEPPER) {
  process.env.OTP_PEPPER = 'test-pepper'
}

describe('OneHitter hashing', () => {
  before(async function () {
    this.timeout(10000)
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

  it('does not store plaintext otp and stores a hash instead', async function () {
    this.timeout(10000)

    const onehitter = new OneHitter()
    const otp = onehitter.make()
    const contact = process.env.OTP_MESSAGE_TEST_TO || 'hashcheck@test.local'

    const res = await onehitter.create(client, { contact, otp, createdAt: new Date() })
    const insertedId = res.insertedId

    const db = client.db(process.env.OTP_MONGO_DATABASE)
    const coll = db.collection(process.env.OTP_MONGO_COLLECTION)
    const stored = await coll.findOne({ _id: insertedId })

    assert.ok(stored, 'expected a stored document')
    // Should not have plaintext otp
    assert.ok(!('otp' in stored), 'stored document should not contain plaintext "otp"')
    // Should have otpHash string
    assert.strictEqual(typeof stored.otpHash, 'string', 'stored document should include "otpHash"')
  })
})
