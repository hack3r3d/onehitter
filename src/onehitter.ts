import type { MongoClient, InsertOneResult } from 'mongodb'
import type { OtpDoc, ValidateStatus } from './db/shared.js'
import { getAdapter } from './db/index.js'
import sendEmail, { type MessageConfig, type MessageTemplate } from './sender.js'
import otpGenerator from 'otp-generator'
import { NoopRateLimiter, InMemoryRateLimiter, type OneHitterOptions, type RateLimiter } from './rate-limiter.js'
import {
  ONEHITTER_ENABLE_INMEM_LIMITER,
  ONEHITTER_LIMIT_COOLDOWN_MS,
  ONEHITTER_LIMIT_MAX,
  ONEHITTER_LIMIT_WINDOW_MS,
  OTP_DIGITS,
  OTP_LETTERS_LOWER,
  OTP_LETTERS_UPPER,
  OTP_LENGTH,
  OTP_SPECIAL_CHARS,
  OTP_URL,
  OTP_EXPIRY,
} from './config.js'

type EmailOption = { message?: MessageConfig | MessageTemplate }

type EmailRuntimeOptions = { region?: string }

type OneHitterOpts = OneHitterOptions & EmailOption & { email?: EmailRuntimeOptions }

class OneHitter {
  private limiter: RateLimiter
  private message?: MessageConfig | MessageTemplate
  private email?: EmailRuntimeOptions
  
  /**
   * @class OneHitter
   * @constructor
   * @description
   * Initializes the OneHitter service, setting up essential dependencies like
   * the rate limiter and optional email/message configurations.
   *
   * The rate limiter is configured based on a three-tier priority:
   * 1. **User Provided (Highest Priority):** If an `options.rateLimiter` instance
   * is provided, it is used directly (Dependency Injection).
   * 2. **In-Memory Limiter (Configured Fallback):** If the global constant
   * `ONEHITTER_ENABLE_INMEM_LIMITER` is true, an internal `InMemoryRateLimiter`
   * is created, configured using global constants for max attempts, window time,
   * and cooldown period.
   * 3. **No-Operation Limiter (Default Fallback):** If no rate limiter is provided
   * and the in-memory limiter is not enabled, a `NoopRateLimiter` is used. This
   * stub limiter ensures rate limiting logic is always called but does nothing,
   * preventing runtime errors while effectively disabling the feature.
   *
   * @param {OneHitterOpts} [options] - Optional configuration object to customize
   * the service's behavior and dependencies.
   */
  constructor(options?: OneHitterOpts) {
    if (options?.rateLimiter) {
      this.limiter = options.rateLimiter
    } else if (ONEHITTER_ENABLE_INMEM_LIMITER) {
      this.limiter = new InMemoryRateLimiter({
        max: ONEHITTER_LIMIT_MAX,
        windowMs: ONEHITTER_LIMIT_WINDOW_MS,
        cooldownMs: ONEHITTER_LIMIT_COOLDOWN_MS,
      })
    } else {
      this.limiter = new NoopRateLimiter()
    }
    this.message = options?.message
    this.email = options?.email
  }

  /**
   * @async
   * @method create
   * @description
   * Creates a new One-Time Password (OTP) document in the database.
   *
   * This function is designed to support two distinct operational modes
   * (or "drivers") through its overloads:
   * 1. An **unmanaged mode** where only the OTP document is provided, and the
   * function uses an internal, pooled MongoClient.
   * 2. A **managed mode** where an existing MongoClient is provided (e.g., to
   * participate in an active transaction or session).
   *
   * The implementation uses type-checking heuristics to determine the calling
   * pattern and selects the appropriate data access adapter via `getAdapter()`.
   *
   * @param {MongoClient | OtpDoc} arg1 - Either the MongoClient instance (managed mode)
   * or the OtpDoc object (unmanaged mode).
   * @param {OtpDoc} [arg2] - The OtpDoc object, required only if `arg1` is the MongoClient.
   * @returns {Promise<InsertOneResult<unknown>>} A Promise that resolves to the
   * result of the MongoDB insertion operation.
  */
  async create(otp: OtpDoc): Promise<InsertOneResult<unknown>>
  async create(client: MongoClient, otp: OtpDoc): Promise<InsertOneResult<unknown>>
  async create(arg1: MongoClient | OtpDoc, arg2?: OtpDoc): Promise<InsertOneResult<unknown>> {
    const isOtpFirst = (arg1 as any)?.contact && !(arg1 as any)?.db
    const otp = (isOtpFirst ? (arg1 as OtpDoc) : (arg2 as OtpDoc))
    const client = isOtpFirst ? undefined : (arg1 as MongoClient)
    const adapter = getAdapter({ hasClient: !!client })
    return await adapter.create({ client, otp })
  }

  /**
   * @async
   * @method send
   * @description
   * Sends the generated OTP to the specified contact ('to' address).
   *
   * This method acts as a critical security check and configuration point:
   * 1. **Configuration Check:** It first validates that the required global constant
   * or configuration value, `OTP_URL`, is present and not empty. This URL is
   * typically needed for template generation (e.g., a link to the application).
   * If missing, it throws an immediate configuration error.
   * 2. **Delegation:** It then delegates the actual delivery logic (formatting,
   * template rendering, and sending) to the underlying `sendEmail` utility,
   * passing all necessary data, including the OTP code, expiry time, and custom messages.
   *
   * @param {string} to - The recipient's contact identifier (e.g., email address or phone number).
   * @param {string} otp - The actual generated One-Time Password code to be sent.
   * @returns {Promise<void>} A Promise that resolves when the email has been successfully queued or sent.
   * @throws {Error} If the required configuration value `OTP_URL` is missing.
   */
  async send(to: string, otp: string): Promise<void> {
    if (!OTP_URL || String(OTP_URL).trim().length === 0) {
      throw new Error('Missing OTP_URL: set environment variable OTP_URL or provide it via config')
    }
    await sendEmail(to, otp, OTP_URL, OTP_EXPIRY, this.message, this.email)
  }

  /**
   * @async
   * @method validate
   * @description
   * Validates a user-provided One-Time Password (OTP) against the stored record,
   * checking for correctness, expiration, and whether it has already been used.
   *
   * This function supports two signatures (overloads):
   * 1. `(otp: Pick<...>)` - Unmanaged mode. Uses an internally managed database connection.
   * 2. `(client: MongoClient, otp: Pick<...>)` - Managed/Transactional mode. Uses the
   * provided MongoClient instance, allowing the validation to be part of a larger
   * transaction or specific database session.
   *
   * It delegates the full validation logic to the private method `this.validateStatus`
   * and returns a simple boolean indicating success.
   *
   * @param {MongoClient | Pick<OtpDoc, 'contact' | 'otp'>} arg1 - The MongoClient instance
   * (in managed mode) or the partial OtpDoc object (in unmanaged mode).
   * @param {Pick<OtpDoc, 'contact' | 'otp'>} [arg2] - The partial OtpDoc object containing
   * the contact identifier and the OTP code. Required only if `arg1` is the MongoClient.
   * @returns {Promise<boolean>} A Promise that resolves to `true` if the OTP is valid
   * and ready for use, or `false` otherwise.
  */
  async validate(otp: Pick<OtpDoc, 'contact' | 'otp'>): Promise<boolean>
  async validate(client: MongoClient, otp: Pick<OtpDoc, 'contact' | 'otp'>): Promise<boolean>
  async validate(arg1: MongoClient | Pick<OtpDoc, 'contact' | 'otp'>, arg2?: Pick<OtpDoc, 'contact' | 'otp'>): Promise<boolean> {
    const status = await this.validateStatus(arg1 as any, arg2 as any)
    return status === 'ok'
  }

  /**
   * @async
   * @private
   * @method validateStatus
   * @description
   * Performs the comprehensive validation of an OTP, checking the code, expiration,
   * and usage status against the database record. This method is also responsible
   * for integrating **rate limiting (throttling)** before and after the database check.
   *
   * It uses a status string for fine-grained results, allowing the caller to differentiate
   * between failure reasons (e.g., 'mismatch', 'expired', 'blocked').
   *
   * **Argument Resolution:**
   * - It determines if a `MongoClient` was passed in `arg1` (managed mode) by checking
   * for the existence of a database-like property (`.db`).
   * - It then correctly assigns the OTP data from either `arg1` or `arg2`.
   *
   * **Security Flow:**
   * 1. Calls `this.limiter.beforeValidate` to check if the contact is currently rate-limited.
   * If blocked, returns 'blocked' immediately.
   * 2. Selects the appropriate database adapter.
   * 3. Calls the adapter to perform the database-level validation (`adapter.validateWithStatus`).
   * 4. Reports success or failure back to the rate limiter (`this.limiter.onSuccess`/`onFailure`)
   * to update the throttling status for that contact.
   *
   * @param {MongoClient | Pick<OtpDoc, 'contact' | 'otp'>} arg1 - The MongoClient or the OTP data.
   * @param {Pick<OtpDoc, 'contact' | 'otp'>} [arg2] - Optional OTP data.
   * @returns {Promise<ValidateStatus | 'blocked'>} A status string indicating the result.
   * Possible values include: 'ok', 'expired', 'mismatch', 'used', or 'blocked'.
   */
  async validateStatus(otp: Pick<OtpDoc, 'contact' | 'otp'>): Promise<ValidateStatus | 'blocked'>
  async validateStatus(client: MongoClient, otp: Pick<OtpDoc, 'contact' | 'otp'>): Promise<ValidateStatus | 'blocked'>
  async validateStatus(arg1: MongoClient | Pick<OtpDoc, 'contact' | 'otp'>, arg2?: Pick<OtpDoc, 'contact' | 'otp'>): Promise<ValidateStatus | 'blocked'> {
    const hasClient = typeof (arg1 as any)?.db === 'function'
    const otp = (hasClient ? (arg2 as any) : (arg1 as any)) as Pick<OtpDoc, 'contact' | 'otp'>
    const allowed = await this.limiter.beforeValidate(otp.contact)
    if (!allowed) return 'blocked'

    const adapter = getAdapter({ hasClient })
    const status = await adapter.validateWithStatus({ client: hasClient ? (arg1 as any) : undefined, otp })
    if (status === 'ok') await this.limiter.onSuccess(otp.contact)
    else await this.limiter.onFailure(otp.contact)
    return status
  }

  /**
   * @method make
   * @description
   * Generates a new One-Time Password (OTP) string based on predefined global
   * configuration constants (OTP_LENGTH, OTP_DIGITS, etc.).
   *
   * This method ensures safe generation by applying the following configuration rules:
   * 1. **Length Check:** If the global `OTP_LENGTH` is not a positive finite number,
   * it defaults the OTP length to 6. Extremely large values are capped at 64 to
   * avoid excessive memory usage.
   * 2. **Character Set Guardrail:** It checks which character sets (digits, upper/lower
   * alphabets, special characters) are enabled via global constants. If *no* set
   * is enabled, it defaults to including **only digits** to prevent generating
   * an empty or invalid code.
   *
   * The final parameters are passed to the external `otpGenerator` utility.
   *
   * @returns {string} The newly generated OTP string.
   */
  make(): string {
    const rawLength = Number.isFinite(OTP_LENGTH) && OTP_LENGTH > 0 ? OTP_LENGTH : 6
    const length = Math.min(rawLength, 64)
    const base = {
      upperCaseAlphabets: OTP_LETTERS_UPPER,
      lowerCaseAlphabets: OTP_LETTERS_LOWER,
      digits: OTP_DIGITS,
      specialChars: OTP_SPECIAL_CHARS,
    }
    const hasAny = base.upperCaseAlphabets || base.lowerCaseAlphabets || base.digits || base.specialChars
    const options = hasAny ? base : { ...base, digits: true }
    return otpGenerator.generate(length, options)
  }
}

export default OneHitter
