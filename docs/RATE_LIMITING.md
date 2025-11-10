# Rate limiting and brute-force protection

This library provides hooks so you can integrate your own rate limiting and brute-force protections. By default, a no-op limiter is used (does nothing), so you must wire in your own limiter for protection in production.

## How it works
- OneHitter now accepts an optional `rateLimiter` in its constructor.
- Hooks invoked:
  - `beforeValidate(contact)`: return `true` to allow validation, `false` to block (e.g., cooldown).
  - `onSuccess(contact)`: called after a successful OTP validation.
  - `onFailure(contact)`: called after a failed OTP validation.

Types (from `src/rate-limiter.ts`):
```ts
export interface RateLimiter {
  beforeValidate(contact: string): Promise<boolean> | boolean
  onSuccess(contact: string): Promise<void> | void
  onFailure(contact: string): Promise<void> | void
}
```

## Usage examples

### Example: Redis sliding window (pseudo-code)
```ts
import Redis from 'ioredis'
import OneHitter from 'onehitter'
import { RateLimiter } from 'onehitter/dist/rate-limiter'

class RedisLimiter implements RateLimiter {
  constructor(private redis = new Redis()) {}

  async beforeValidate(contact: string): Promise<boolean> {
    const key = `otp:attempts:${contact}`
    const now = Date.now()
    const windowMs = 5 * 60 * 1000 // 5 minutes
    const max = 5

    await this.redis.zremrangebyscore(key, 0, now - windowMs)
    const count = await this.redis.zcard(key)
    return count < max
  }

  async onFailure(contact: string) {
    const key = `otp:attempts:${contact}`
    const now = Date.now()
    const windowMs = 5 * 60 * 1000
    await this.redis.zadd(key, now, String(now))
    await this.redis.pexpire(key, windowMs)
  }

  async onSuccess(contact: string) {
    // Optionally clear or decrement counters
  }
}

const limiter = new RedisLimiter()
const onehitter = new OneHitter({ rateLimiter: limiter })
```

### Example: Mongo-backed cooldown (pseudo-code)
```ts
import { Collection } from 'mongodb'
import OneHitter from 'onehitter'
import { RateLimiter } from 'onehitter/dist/rate-limiter'

class MongoCooldown implements RateLimiter {
  constructor(private coll: Collection) {}

  async beforeValidate(contact: string): Promise<boolean> {
    const doc = await this.coll.findOne({ contact })
    const now = new Date()
    if (!doc || !doc.cooldownUntil) return true
    return doc.cooldownUntil < now
  }

  async onFailure(contact: string) {
    const now = new Date()
    const cooldownMs = 60_000 // 1 minute cooldown per failure (example)
    await this.coll.updateOne(
      { contact },
      {
        $setOnInsert: { contact },
        $max: { cooldownUntil: new Date(Date.now() + cooldownMs) },
      },
      { upsert: true },
    )
  }

  async onSuccess(contact: string) {
    await this.coll.deleteOne({ contact })
  }
}
```

## Quick local limiter via env flag
For quick local testing (not production), you can enable a built-in in-memory limiter without writing any code by setting env variables before constructing `OneHitter`:

```bash
export ONEHITTER_ENABLE_INMEM_LIMITER=true
# Optional tunables (defaults: max=5, window=300000 ms (5m), cooldown=60000 ms)
export ONEHITTER_LIMIT_MAX=5
export ONEHITTER_LIMIT_WINDOW_MS=300000
export ONEHITTER_LIMIT_COOLDOWN_MS=60000
```

Behavior:
- Counts failed validations per contact within `WINDOW_MS`.
- When failures reach `MAX`, further validations are blocked until `COOLDOWN_MS` elapses.
- A successful validation clears counters.

## Recommendations
- Prefer centralized, shared infrastructure for rate limiting (e.g., Redis) when you run multiple app instances.
- Use IP + contact bucketing where appropriate.
- Consider exponential backoff for cooldowns and a maximum daily attempt cap.
- Log blocked attempts for monitoring.
