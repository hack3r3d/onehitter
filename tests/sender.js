const assert = require('assert')
const path = require('path')
const dotenv = require('dotenv')

// We'll stub nodemailer.createTransport to a fake transporter
const nodemailer = require('nodemailer')

function setEmailEnv(overrides = {}) {
  process.env.OTP_MESSAGE_FROM = overrides.OTP_MESSAGE_FROM || 'noreply@example.com'
  process.env.OTP_MESSAGE_SUBJECT = overrides.OTP_MESSAGE_SUBJECT || 'One-time password'
  process.env.OTP_URL = overrides.OTP_URL || 'https://example.com'
  process.env.OTP_EXPIRY = overrides.OTP_EXPIRY || '1800'
  process.env.SES_REGION = overrides.SES_REGION || 'us-east-1'
}

function clearSenderModule() {
  const senderPath = path.resolve(__dirname, '..', 'dist', 'sender.js')
  const configPath = path.resolve(__dirname, '..', 'dist', 'config.js')
  delete require.cache[senderPath]
  delete require.cache[configPath]
}

describe('sender', () => {
  let originalCreate
  let sent

  before(() => {
    // Avoid dotenv-safe errors from unrelated vars
    dotenv.config({ override: true })
  })

  beforeEach(() => {
    setEmailEnv({})
    sent = []
    originalCreate = nodemailer.createTransport
    nodemailer.createTransport = function fakeTransport(opts) {
      return {
        async sendMail(msg) {
          sent.push({ opts, msg })
        }
      }
    }
    clearSenderModule()
  })

  afterEach(() => {
    nodemailer.createTransport = originalCreate
  })

  it('throws when recipient is empty', async () => {
    const send = require('../dist/sender.js').default
    await assert.rejects(
      () => send('', 'OTP', 'https://x', 60),
      /Missing recipient email/
    )
    assert.strictEqual(sent.length, 0)
  })

  it('uses defaults for subject/from/text and formats expiry minutes', async () => {
    const send = require('../dist/sender.js').default
    await send('user@example.com', 'ABC123', 'https://site', undefined)
    assert.strictEqual(sent.length, 1)
    const { msg } = sent[0]
    assert.strictEqual(msg.subject, process.env.OTP_MESSAGE_SUBJECT)
    assert.strictEqual(msg.from, process.env.OTP_MESSAGE_FROM)
    assert.ok(typeof msg.text === 'string' && msg.text.includes('ABC123'))
    assert.ok(msg.text.includes('minutes') || msg.text.includes('minute'))
  })

  it('expiry argument overrides env and pluralizes correctly (round to minutes)', async () => {
    const send = require('../dist/sender.js').default
    // 90 seconds -> 2 minutes (rounded)
    await send('user@example.com', 'OTP', 'https://site', 90)
    const { msg } = sent.pop()
    assert.ok(msg.text.includes('2 minutes'))
  })

  it('singular minute formatting when exactly 60 seconds', async () => {
    const send = require('../dist/sender.js').default
    await send('user@example.com', 'SING', 'https://site', 60)
    const { msg } = sent.pop()
    assert.ok(msg.text.includes('1 minute'))
  })

  it('negative/invalid expiry falls back to default env (or 30 minutes)', async () => {
    const send = require('../dist/sender.js').default
    process.env.OTP_EXPIRY = '1800'
    await send('user@example.com', 'NEG', 'https://site', -10)
    const { msg } = sent.pop()
    assert.ok(msg.text.includes('30 minutes'))
  })

  it('message config supports text function override', async () => {
    const send = require('../dist/sender.js').default
    await send('user@example.com', 'ABC', 'https://site', 60, {
      text: ({ otp }) => `Custom ${otp}`,
    })
    const { msg } = sent.pop()
    assert.strictEqual(msg.text, 'Custom ABC')
  })

  it('message config supports template merger', async () => {
    const send = require('../dist/sender.js').default
    await send('user@example.com', 'TPL', 'https://site', 60, {
      template: ({ otp, url }) => ({
        subject: 'Templated',
        text: `OTP ${otp} at ${url}`,
        html: `<i>${otp}</i>`,
        from: 'tpl@example.com',
      })
    })
    const { msg } = sent.pop()
    assert.strictEqual(msg.subject, 'Templated')
    assert.strictEqual(msg.from, 'tpl@example.com')
    assert.ok(msg.text.includes('OTP TPL'))
    assert.ok(msg.html.includes('<i>TPL</i>'))
  })

  it('message config object overrides subject/text/html/from', async () => {
    const send = require('../dist/sender.js').default
    await send('user@example.com', 'XYZ', 'https://site', 60, {
      from: 'custom@example.com',
      subject: ({ minutesText }) => `Code (${minutesText})`,
      html: ({ otp, url }) => `<b>${otp}</b> @ <a href="${url}">link</a>`,
    })
    const { msg } = sent.pop()
    assert.strictEqual(msg.from, 'custom@example.com')
    assert.strictEqual(typeof msg.html, 'string')
    assert.ok(msg.html.includes('<b>XYZ</b>'))
    // default text is still provided when html is set
    assert.strictEqual(typeof msg.text, 'string')
  })

  it('message template function overrides return', async () => {
    const send = require('../dist/sender.js').default
    await send('user@example.com', 'TTT', 'https://u', 60, ({ otp }) => ({
      subject: 'Your login code',
      text: `Use ${otp}`,
    }))
    const { msg } = sent.pop()
    assert.strictEqual(msg.subject, 'Your login code')
    assert.strictEqual(msg.text, 'Use TTT')
  })

  it('constructs SES client with region from SES_REGION', async () => {
    process.env.SES_REGION = 'eu-west-1'
    clearSenderModule()
    const send = require('../dist/sender.js').default
    await send('user@example.com', 'REG', 'https://u', 60)
    const entry = sent.pop()
    const ses = entry.opts.SES.ses
    const regionCfg = ses && ses.config && ses.config.region
    if (typeof regionCfg === 'string') {
      assert.strictEqual(regionCfg, 'eu-west-1')
    } else if (typeof regionCfg === 'function') {
      const resolved = await regionCfg()
      assert.strictEqual(resolved, 'eu-west-1')
    } else {
      // Fallback: at least ensure the field exists
      assert.ok(regionCfg)
    }
  })
})
