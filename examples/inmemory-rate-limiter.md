# In-memory rate limiter example

This example shows how to enable the built-in in-memory limiter with environment variables, or wire a custom limiter explicitly.

## Using the env-flag built-in limiter
```bash
export ONEHITTER_ENABLE_INMEM_LIMITER=true
export ONEHITTER_LIMIT_MAX=3
export ONEHITTER_LIMIT_WINDOW_MS=60000
export ONEHITTER_LIMIT_COOLDOWN_MS=30000
```

```ts
import OneHitter from 'onehitter'
// When constructed, OneHitter reads the env flags and installs the in-memory limiter.
const onehitter = new OneHitter()
```

## Supplying your own limiter explicitly
```ts
import OneHitter from 'onehitter'
import { InMemoryRateLimiter } from 'onehitter/rate-limiter'

const limiter = new InMemoryRateLimiter({ max: 3, windowMs: 60_000, cooldownMs: 30_000 })
const onehitter = new OneHitter({ rateLimiter: limiter })
```
