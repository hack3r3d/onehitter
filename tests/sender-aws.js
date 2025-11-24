const assert = require('assert')
const path = require('path')
const dotenv = require('dotenv')
const nodemailer = require('nodemailer')
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2')

// Prefer .env.test, then fall back to .env, mirroring other integration-style tests.
const testEnvPath = path.resolve(__dirname, '..', '.env.test')

dotenv.config({ path: testEnvPath })

const send = require('../dist/cjs/sender.js').default

// Real AWS SES integration test (SESv2). This will actually send an email.
// Safety: test auto-skips unless all required env vars are present.
// Required env:
//   - OTP_SES_REGION           e.g. us-east-1
//   - OTP_MESSAGE_FROM         a verified SES identity (email or domain)
//   - OTP_MESSAGE_TEST_TO      a verified recipient (sandbox) or any address (prod)
// Optional env:
//   - AWS_PROFILE / AWS creds via default provider chain
//   - OTP_URL, OTP_MESSAGE_SUBJECT

function required(name) { return (process.env[name] || '').trim() }

describe('sender (AWS SESv2 real)', function () {
  const region = required('OTP_SES_REGION')
  const from = required('OTP_MESSAGE_FROM')
  const to = required('OTP_MESSAGE_TEST_TO')

  if (!region || !from || !to) {
    it('skipped (set OTP_SES_REGION, OTP_MESSAGE_FROM, OTP_MESSAGE_TEST_TO to run against real SES)', function () {
      this.skip()
    })
    return
  }

  let transporter

  before(async function () {
    // Ensure sender picks up env
    process.env.OTP_MESSAGE_SUBJECT = process.env.OTP_MESSAGE_SUBJECT || 'One-time password'
    process.env.OTP_URL = process.env.OTP_URL || 'https://example.com'

    const client = new SESv2Client({ region }) // credentials via default provider chain
    transporter = nodemailer.createTransport({
      SES: { sesClient: client, SendEmailCommand },
      logger: true,
    })
  })

  it('sends via AWS SESv2 without error', async function () {
    await assert.doesNotReject(() =>
      send(to, 'REAL123', process.env.OTP_URL, 300, undefined, { transporter })
    )
  })
})
