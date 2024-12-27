const assert = require('assert')
require("dotenv").config({ path: '../.env.test' })
const OneHitter = require('../onehitter.js')
const client = require('../db/mongodb.js')
const {ObjectId} = require('mongodb')
const send = require('../sender.js')
beforeEach(async () => {
    try {
        if (process.env.MONGO_DATABASE.search(/test/) < 0) {
            console.error('You can not run these tests on database that does not include "test" in the name.')
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
        it('send-success', async () => {
            const onehitter = new OneHitter()
            send(process.env.OTP_MESSAGE_TEST_TO, onehitter.make(), process.env.OTP_URL, process.env.OTP_EXPIRY)
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
