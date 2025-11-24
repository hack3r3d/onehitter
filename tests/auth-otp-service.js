const assert = require('assert')

// NOTE: Tests use the compiled CJS build, consistent with other unit tests.
const {
  OtpAuthService,
} = require('../dist/cjs/auth-otp-service.js')

function makeStubOneHitterWithStatus(statusSequence) {
  const seq = Array.isArray(statusSequence) ? [...statusSequence] : [statusSequence]
  return {
    async validateStatus() {
      if (seq.length === 0) return 'not_found'
      return seq.shift()
    },
  }
}

describe('OtpAuthService', () => {
  it('emits AUTH_SUCCESS with merged payload and returns true on ok', async () => {
    const oneHitter = makeStubOneHitterWithStatus('ok')
    const svc = new OtpAuthService({ oneHitter })

    const events = []
    svc.on(OtpAuthService.AUTH_SUCCESS, (payload) => {
      events.push(payload)
    })

    const extra = { ip: '203.0.113.42', userAgent: 'TestAgent/1.0' }
    const result = await svc.authenticateUser('OTP123', 'user-success@test', extra)

    assert.strictEqual(result, true)
    assert.strictEqual(events.length, 1)
    const ev = events[0]
    assert.strictEqual(ev.userId, 'user-success@test')
    assert.ok(ev.authTime instanceof Date)
    // Extra fields should be merged
    assert.strictEqual(ev.ip, extra.ip)
    assert.strictEqual(ev.userAgent, extra.userAgent)
  })

  it('emits AUTH_FAILURE with reason and returns false on non-ok status', async () => {
    const oneHitter = makeStubOneHitterWithStatus('expired')
    const svc = new OtpAuthService({ oneHitter })

    const successEvents = []
    const failureEvents = []

    svc.on(OtpAuthService.AUTH_SUCCESS, (p) => successEvents.push(p))
    svc.on(OtpAuthService.AUTH_FAILURE, (p) => failureEvents.push(p))

    const extra = { ip: '198.51.100.5' }
    const result = await svc.authenticateUser('OTP-FAIL', 'user-fail@test', extra)

    assert.strictEqual(result, false)
    // Should not emit success on failure
    assert.strictEqual(successEvents.length, 0)
    assert.strictEqual(failureEvents.length, 1)

    const ev = failureEvents[0]
    assert.strictEqual(ev.userId, 'user-fail@test')
    assert.ok(ev.authTime instanceof Date)
    assert.strictEqual(ev.reason, 'expired')
    // Extra fields should be merged into failure payload as well
    assert.strictEqual(ev.ip, extra.ip)
  })

  it('maps unknown underlying status to reason="unknown"', async () => {
    // Even if the underlying implementation somehow returns an unexpected
    // status string at runtime, the public reason should stay within the
    // AuthFailureReason union.
    const oneHitter = makeStubOneHitterWithStatus('weird-status')
    const svc = new OtpAuthService({ oneHitter })

    const failureEvents = []
    svc.on(OtpAuthService.AUTH_FAILURE, (p) => failureEvents.push(p))

    const result = await svc.authenticateUser('OTP', 'user-unknown@test')
    assert.strictEqual(result, false)
    assert.strictEqual(failureEvents.length, 1)
    const ev = failureEvents[0]
    assert.strictEqual(ev.reason, 'unknown')
  })

  it('uses injected buildPayload for success events', async () => {
    const oneHitter = makeStubOneHitterWithStatus('ok')
    const built = []
    const svc = new OtpAuthService({
      oneHitter,
      buildPayload(userId, extra) {
        const payload = {
          userId,
          authTime: new Date('2000-01-01T00:00:00Z'),
          tag: 'success',
          ...(extra || {}),
        }
        built.push(payload)
        return payload
      },
    })

    const events = []
    svc.on(OtpAuthService.AUTH_SUCCESS, (p) => events.push(p))

    const extra = { attempt: 1 }
    const result = await svc.authenticateUser('OTP', 'user-di-success@test', extra)

    assert.strictEqual(result, true)
    assert.strictEqual(events.length, 1)
    assert.strictEqual(built.length, 1)
    const ev = events[0]
    assert.strictEqual(ev.userId, 'user-di-success@test')
    assert.strictEqual(ev.tag, 'success')
    assert.strictEqual(ev.attempt, 1)
  })

  it('uses injected buildFailurePayload for failure events', async () => {
    const oneHitter = makeStubOneHitterWithStatus('not_found')
    const built = []
    const svc = new OtpAuthService({
      oneHitter,
      buildFailurePayload(userId, reason, extra) {
        const payload = {
          userId,
          authTime: new Date('2000-01-02T00:00:00Z'),
          reason,
          tag: 'failure',
          ...(extra || {}),
        }
        built.push(payload)
        return payload
      },
    })

    const events = []
    svc.on(OtpAuthService.AUTH_FAILURE, (p) => events.push(p))

    const extra = { attempt: 2 }
    const result = await svc.authenticateUser('OTP', 'user-di-fail@test', extra)

    assert.strictEqual(result, false)
    assert.strictEqual(events.length, 1)
    assert.strictEqual(built.length, 1)
    const ev = events[0]
    assert.strictEqual(ev.userId, 'user-di-fail@test')
    assert.strictEqual(ev.reason, 'not_found')
    assert.strictEqual(ev.tag, 'failure')
    assert.strictEqual(ev.attempt, 2)
  })
})
