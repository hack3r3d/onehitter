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

  /**
   * @class InMemoryRateLimiter
   * @constructor
   * @description
   * Initializes an in-memory rate limiting mechanism. This limiter stores attempt
   * counts in the application's memory and is used to prevent brute-force attacks
   * on the OTP validation endpoint.
   *
   * It uses a flexible configuration pattern where options are prioritized:
   * 1. **User Provided:** Uses values from the optional `opts` object.
   * 2. **Hardcoded Defaults:** If options are not provided or invalid, it falls back to
   * secure hardcoded defaults.
   *
   * **Default Settings:**
   * - `windowMs`: 5 minutes (5 * 60,000 milliseconds)
   * - `max`: 5 attempts
   * - `cooldownMs`: 60 seconds (60,000 milliseconds)
   *
   * @param {InMemoryLimiterOptions} [opts] - Optional configuration object to customize
   * the rate limiting behavior.
   */
  constructor(opts?: InMemoryLimiterOptions) {
    this.windowMs = opts?.windowMs ?? 5 * 60_000
    this.max = opts?.max ?? 5
    this.cooldownMs = opts?.cooldownMs ?? 60_000
  }

  /**
   * @method bucket
   * @private
   * @description
   * Retrieves or initializes the rate-limiting "bucket" (a record of attempt timestamps)
   * for a given contact identifier.
   *
   * This method is central to the in-memory rate limiting logic:
   * 1. It attempts to fetch an existing bucket from the internal `this.attempts` Map
   * using the `contact` string as the key.
   * 2. If no bucket exists (first attempt or after a cleanup/restart), it initializes
   * a new bucket `{ times: [] }` and stores it in the Map.
   * 3. It always returns a valid bucket object, ensuring subsequent rate-limiting
   * logic can safely push new timestamps.
   *
   * @param {string} contact - The unique identifier for the contact (e.g., email or phone number).
   * @returns {{ times: number[] }} The rate-limiting bucket object containing an array of previous attempt timestamps.
   */
  private bucket(contact: string) {
    let b = this.attempts.get(contact)
    if (!b) { b = { times: [] }; this.attempts.set(contact, b) }
    return b
  }

  /**
   * @method prune
   * @private
   * @description
   * Cleans up the attempt history ("bucket") for a specific contact identifier,
   * removing any timestamps that fall outside the current rate-limiting window.
   *
   * This function is critical for:
   * 1. **Accurate Counting:** It ensures that only recent, relevant attempts are considered
   * when checking if the `max` attempt limit has been exceeded.
   * 2. **Memory Management:** It prevents the `times` array from growing indefinitely
   * by discarding old, stale data, helping manage the memory usage of the in-memory limiter.
   *
   * **Mechanism:** It filters the timestamps (`b.times`) array, keeping only those
   * where the time difference between the current time (`now`) and the recorded timestamp (`t`)
   * is less than or equal to the configured window size (`this.windowMs`).
   *
   * @param {string} contact - The unique identifier for the contact being pruned.
   * @param {number} now - The current timestamp in milliseconds.
   * @returns {{ times: number[] }} The pruned rate-limiting bucket object.
   */
  private prune(contact: string, now: number) {
    const b = this.bucket(contact)
    b.times = b.times.filter(t => now - t <= this.windowMs)
    return b
  }

  /**
   * @async
   * @method beforeValidate
   * @description
   * Determines whether a new OTP validation attempt should be allowed for the given contact.
   * This method enforces both the attempt limit (`max`) and the optional cooldown period.
   *
   * **Flow and Logic:**
   * 1. **Pruning:** Calls `this.prune()` to discard any expired attempts from the contact's bucket,
   * ensuring only attempts within the current `windowMs` are considered.
   * 2. **Cooldown Check:** Checks if `b.cooldownUntil` is set and is in the future. If so,
   * the attempt is immediately **denied** (`return false`).
   * 3. **Cooldown Reset:** If a cooldown was set but has elapsed (`b.cooldownUntil <= now`),
   * the cooldown is cleared, and the attempt history is reset (`b.times = []`).
   * 4. **Limit Check:** If no cooldown is active, the function checks if the remaining
   * number of attempts in the pruned history (`b.times.length`) is less than the
   * configured maximum (`this.max`).
   *
   * @param {string} contact - The unique identifier for the contact attempting validation.
   * @returns {Promise<boolean>} A Promise that resolves to `true` if the validation attempt
   * is allowed to proceed, or `false` if the attempt is blocked due to rate limiting or cooldown.
   */
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

  /**
   * @async
   * @method onFailure
   * @description
   * Processes a failed OTP validation attempt for a given contact, updating the
   * in-memory rate-limiting bucket.
   *
   * **Flow and Logic:**
   * 1. **Pruning:** Calls `this.prune()` to ensure the attempt history only contains
   * records relevant to the current `windowMs`.
   * 2. **Recording Failure:** Records the current time (`now`) into the contact's
   * attempt history (`b.times`).
   * 3. **Cooldown Trigger:** Checks if the updated number of attempts (`b.times.length`)
   * meets or exceeds the configured maximum limit (`this.max`).
   * 4. **Setting Cooldown:** If the limit is reached, it calculates and sets the
   * `cooldownUntil` timestamp to the current time plus the configured cooldown duration
   * (`this.cooldownMs`), effectively locking out the contact for a period.
   *
   * @param {string} contact - The unique identifier for the contact who failed validation.
   * @returns {Promise<void>} A Promise that resolves after the attempt history has been updated.
   */
  async onFailure(contact: string): Promise<void> {
    const now = Date.now()
    const b = this.prune(contact, now)
    b.times.push(now)
    if (b.times.length >= this.max) {
      b.cooldownUntil = now + this.cooldownMs
    }
  }

  /**
   * @async
   * @method onSuccess
   * @description
   * Processes a successful OTP validation attempt for a given contact.
   *
   * The policy implemented here is that a successful validation resets the rate-limiting
   * history for that contact entirely. This ensures that a legitimate user who
   * successfully verifies their OTP is immediately removed from any failure tracking
   * or active cooldown status.
   *
   * **Logic:** It simply deletes the entire attempt bucket associated with the `contact`
   * identifier from the in-memory Map (`this.attempts`).
   *
   * @param {string} contact - The unique identifier for the contact who successfully validated their OTP.
   * @returns {Promise<void>} A Promise that resolves after the contact's failure history has been cleared.
   */
  async onSuccess(contact: string): Promise<void> {
    this.attempts.delete(contact)
  }
}

export interface OneHitterOptions {
  rateLimiter?: RateLimiter
}
