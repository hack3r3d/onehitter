export interface RateLimiter {
  // Called before validate; return true to allow, false to block
  beforeValidate(contact: string): Promise<boolean> | boolean
  // Called after a successful validation
  onSuccess(contact: string): Promise<void> | void
  // Called after a failed validation attempt
  onFailure(contact: string): Promise<void> | void
}

export class NoopRateLimiter implements RateLimiter {
  beforeValidate(): boolean { return true }
  onSuccess(): void {}
  onFailure(): void {}
}

export interface InMemoryLimiterOptions {
  windowMs?: number // time window for counting failures
  max?: number // max failures within window before blocking
  cooldownMs?: number // optional cooldown after reaching max
}

export class InMemoryRateLimiter implements RateLimiter {
  private attempts = new Map<string, { times: number[]; cooldownUntil?: number }>()
  private windowMs: number
  private max: number
  private cooldownMs: number

  constructor(opts?: InMemoryLimiterOptions) {
    this.windowMs = opts?.windowMs ?? 5 * 60_000
    this.max = opts?.max ?? 5
    this.cooldownMs = opts?.cooldownMs ?? 60_000
  }

  private bucket(contact: string) {
    let b = this.attempts.get(contact)
    if (!b) { b = { times: [] }; this.attempts.set(contact, b) }
    return b
  }

  private prune(contact: string, now: number) {
    const b = this.bucket(contact)
    b.times = b.times.filter(t => now - t <= this.windowMs)
    return b
  }

  async beforeValidate(contact: string): Promise<boolean> {
    const now = Date.now()
    const b = this.prune(contact, now)
    if (b.cooldownUntil) {
      if (b.cooldownUntil > now) return false
      // cooldown elapsed: reset attempts and cooldown
      b.cooldownUntil = undefined
      b.times = []
    }
    return b.times.length < this.max
  }

  async onFailure(contact: string): Promise<void> {
    const now = Date.now()
    const b = this.prune(contact, now)
    b.times.push(now)
    if (b.times.length >= this.max) {
      b.cooldownUntil = now + this.cooldownMs
    }
  }

  async onSuccess(contact: string): Promise<void> {
    this.attempts.delete(contact)
  }
}

export interface OneHitterOptions {
  rateLimiter?: RateLimiter
}
