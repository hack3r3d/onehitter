const assert = require('assert')
const path = require('path')
const dotenv = require('dotenv')
// Prefer .env.test; fall back to .env if missing
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
const OneHitter = require('../dist/onehitter.js').default
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const client = new MongoClient(process.env.MONGO_CONNECTION, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
})
const send = require('../dist/sender.js').default
beforeEach(async () => {
    try {
        if (!process.env.MONGO_DATABASE || process.env.MONGO_DATABASE.search(/test/) < 0) {
            console.error('You can not run these tests on a database that does not include "test" in the name.')
            process.exit(1)
        }
        await client.connect()
    } catch (ex) {
        new Error(ex)
    }
})
afterEach(async () => {
    await client.close()
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
