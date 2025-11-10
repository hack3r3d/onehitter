const assert = require('assert')
const { InMemoryRateLimiter, NoopRateLimiter } = require('../dist/cjs/rate-limiter.js')

describe('InMemoryRateLimiter defaults', () => {
  it('blocks after default max (5) failures without options', async () => {
    const rl = new InMemoryRateLimiter() // use defaults: max=5
    const user = 'rl-defaults@test'

    // Initially allowed
    assert.strictEqual(await rl.beforeValidate(user), true)

    // 4 failures -> still allowed
    for (let i = 0; i < 4; i++) {
      await rl.onFailure(user)
    }
    assert.strictEqual(await rl.beforeValidate(user), true)

    // 5th failure -> should block
    await rl.onFailure(user)
    assert.strictEqual(await rl.beforeValidate(user), false)
  })
})

describe('NoopRateLimiter', () => {
  it('always allows and no-ops on success/failure', async () => {
    const rl = new NoopRateLimiter()
    assert.strictEqual(await rl.beforeValidate('x'), true)
    await rl.onFailure('x')
    await rl.onSuccess('x')
    assert.strictEqual(await rl.beforeValidate('x'), true)
  })
})
