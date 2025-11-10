const assert = require('assert')
const proxyquireBase = require('proxyquire')
const pq = proxyquireBase.noCallThru().noPreserveCache()

function loadOneHitterWithConfig(cfg) {
  const defaults = {
    OTP_MESSAGE_FROM: 'noreply@example.com',
    OTP_MESSAGE_SUBJECT: 'One-time password',
    OTP_URL: 'https://example.com',
    OTP_EXPIRY: 1800,
    OTP_LENGTH: 6,
    OTP_LETTERS_UPPER: false,
    OTP_LETTERS_LOWER: false,
    OTP_DIGITS: true,
    OTP_SPECIAL_CHARS: false,
  }
  const c = Object.assign({}, defaults, cfg)
  const configStub = {
    OTP_MESSAGE_FROM: c.OTP_MESSAGE_FROM,
    OTP_MESSAGE_SUBJECT: c.OTP_MESSAGE_SUBJECT,
    OTP_URL: c.OTP_URL,
    OTP_EXPIRY: c.OTP_EXPIRY,
    OTP_LENGTH: c.OTP_LENGTH,
    OTP_LETTERS_UPPER: c.OTP_LETTERS_UPPER,
    OTP_LETTERS_LOWER: c.OTP_LETTERS_LOWER,
    OTP_DIGITS: c.OTP_DIGITS,
    OTP_SPECIAL_CHARS: c.OTP_SPECIAL_CHARS,
  }
  // Purge caches so stubs always apply
  for (const p of ['../dist/cjs/onehitter.js', '../dist/cjs/sender.js', '../dist/cjs/config.js']) {
    try {
      const abs = require.resolve(p)
      if (require.cache[abs]) delete require.cache[abs]
    } catch {}
  }
  // Stub both config and sender (noop) to avoid requiring real config via sender
  return pq('../dist/cjs/onehitter.js', {
    './config': configStub,
    './sender': function noopSend() { /* no-op in unit tests */ },
  }).default
}

describe('OneHitter.make()', function () {
  this.timeout(10000)

  it('parses OTP_LENGTH as a positive integer', () => {
    const OneHitter = loadOneHitterWithConfig({
      OTP_LENGTH: 8,
      OTP_LETTERS_UPPER: false,
      OTP_LETTERS_LOWER: false,
      OTP_DIGITS: true,
      OTP_SPECIAL_CHARS: false,
    })
    const one = new OneHitter()
    const code = one.make()
    assert.strictEqual(code.length, 8)
    assert.match(code, /^[0-9]+$/)
  })

  it('falls back to 6 when OTP_LENGTH is invalid or non-positive', () => {
    // invalid length -> default 6
    let OneHitter = loadOneHitterWithConfig({
      OTP_LENGTH: NaN,
      OTP_LETTERS_UPPER: false,
      OTP_LETTERS_LOWER: false,
      OTP_DIGITS: true,
      OTP_SPECIAL_CHARS: false,
    })
    let one = new OneHitter()
    let code = one.make()
    assert.strictEqual(code.length, 6)

    // non-positive -> default 6
    OneHitter = loadOneHitterWithConfig({
      OTP_LENGTH: 0,
      OTP_LETTERS_UPPER: false,
      OTP_LETTERS_LOWER: false,
      OTP_DIGITS: true,
      OTP_SPECIAL_CHARS: false,
    })
    one = new OneHitter()
    code = one.make()
    assert.strictEqual(code.length, 6)
  })

  it('defaults to digits when all character-class flags are false', () => {
    const OneHitter = loadOneHitterWithConfig({
      OTP_LENGTH: 6,
      OTP_LETTERS_UPPER: false,
      OTP_LETTERS_LOWER: false,
      OTP_DIGITS: false,
      OTP_SPECIAL_CHARS: false,
    })
    const one = new OneHitter()
    const code = one.make()
    assert.strictEqual(code.length, 6)
    assert.match(code, /^[0-9]+$/)
  })

  it('upper only produces A-Z', () => {
    const OneHitter = loadOneHitterWithConfig({
      OTP_LENGTH: 10,
      OTP_LETTERS_UPPER: true,
      OTP_LETTERS_LOWER: false,
      OTP_DIGITS: false,
      OTP_SPECIAL_CHARS: false,
    })
    const one = new OneHitter()
    const code = one.make()
    assert.strictEqual(code.length, 10)
    assert.match(code, /^[A-Z]+$/)
  })

  it('lower only produces a-z', () => {
    const OneHitter = loadOneHitterWithConfig({
      OTP_LENGTH: 10,
      OTP_LETTERS_UPPER: false,
      OTP_LETTERS_LOWER: true,
      OTP_DIGITS: false,
      OTP_SPECIAL_CHARS: false,
    })
    const one = new OneHitter()
    const code = one.make()
    assert.strictEqual(code.length, 10)
    assert.match(code, /^[a-z]+$/)
  })

  it('digits only produces 0-9', () => {
    const OneHitter = loadOneHitterWithConfig({
      OTP_LENGTH: 12,
      OTP_LETTERS_UPPER: false,
      OTP_LETTERS_LOWER: false,
      OTP_DIGITS: true,
      OTP_SPECIAL_CHARS: false,
    })
    const one = new OneHitter()
    const code = one.make()
    assert.strictEqual(code.length, 12)
    assert.match(code, /^[0-9]+$/)
  })

  it('special only produces non-alphanumeric', () => {
    const OneHitter = loadOneHitterWithConfig({
      OTP_LENGTH: 12,
      OTP_LETTERS_UPPER: false,
      OTP_LETTERS_LOWER: false,
      OTP_DIGITS: false,
      OTP_SPECIAL_CHARS: true,
    })
    const one = new OneHitter()
    const code = one.make()
    assert.strictEqual(code.length, 12)
    assert.match(code, /^[^A-Za-z0-9]+$/)
  })
})
