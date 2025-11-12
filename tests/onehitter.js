const assert = require('assert')
const path = require('path')
const dotenv = require('dotenv')
// Prefer .env.test; fall back to .env if missing
const testEnvPath = path.resolve(__dirname, '..', '.env.test')
const rootEnvPath = path.resolve(__dirname, '..', '.env')
dotenv.config({ path: testEnvPath })
if (!(process.env.OTP_MONGO_CONNECTION)) {
    dotenv.config({ path: rootEnvPath })
    if (!(process.env.OTP_MONGO_CONNECTION)) {
        console.warn('Skipping integration tests: OTP_MONGO_CONNECTION not set')
    }
}
const OneHitter = require('../dist/cjs/onehitter.js').default
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const send = require('../dist/cjs/sender.js').default
const { skipIfNoMongoConnection, skipIfNotTestDatabase } = require('./helpers/gating')
let client
beforeEach(async function () {
    skipIfNoMongoConnection(this)
    skipIfNotTestDatabase(this)
    client = new MongoClient(process.env.OTP_MONGO_CONNECTION || '', {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
        },
    })
    await client.connect()
})
afterEach(async () => {
    if (client) await client.close()
})
describe('OneHitter', () => {
    describe('#validate', () => {
        it('validate', async() => {
            const onehitter = new OneHitter()
            const otp = { contact: process.env.OTP_MESSAGE_TEST_TO, otp: onehitter.make(), createdAt: new Date() }
            await onehitter.create(client, otp)
            const res = await onehitter.validate(client, otp)
            assert.equal(res, true)
        })
    })
    describe('#validate-fail', () => {
        it('validate', async() => {
            const onehitter = new OneHitter()
            const otp = { contact: process.env.OTP_MESSAGE_TEST_TO, otp: onehitter.make(), createdAt: new Date() }
            await onehitter.create(client, otp)
            otp.otp = 'lovely'
            const res = await onehitter.validate(client, otp)
            assert.equal(res, false)
        })
    })
    describe('#send', () => {
        it('send-success', async function () {
            this.timeout(20000)
            if (!process.env.OTP_MESSAGE_TEST_TO || process.env.OTP_MESSAGE_TEST_TO.trim().length === 0) {
                throw new Error('OTP_MESSAGE_TEST_TO is not set; set it in .env.test (or .env) to run the email test')
            }
            if (!process.env.OTP_MESSAGE_FROM || process.env.OTP_MESSAGE_FROM.trim().length === 0) {
                throw new Error('OTP_MESSAGE_FROM is not set; set a verified SES sender address')
            }
            const onehitter = new OneHitter()
            await send(process.env.OTP_MESSAGE_TEST_TO, onehitter.make(), process.env.OTP_URL, process.env.OTP_EXPIRY)
        })
    })
    describe('#create', () => {
        it('create-success', async () => {
            const onehitter = new OneHitter()
            const res = await onehitter.create(client, { contact: process.env.OTP_MESSAGE_TEST_TO, otp: onehitter.make(), createdAt: new Date() })
            const insertId = res.insertedId
            assert.equal(ObjectId.isValid(insertId), true)
        })
    })
})
