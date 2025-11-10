import type { MongoClient, InsertOneResult } from 'mongodb'
import type { OtpDoc, ValidateStatus } from './db/shared'
import { getAdapter } from './db'
import sendEmail, { type MessageConfig, type MessageTemplate } from './sender'
import otpGenerator from 'otp-generator'
import { NoopRateLimiter, InMemoryRateLimiter, type OneHitterOptions, type RateLimiter } from './rate-limiter'
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
} from './config'

type EmailOption = { message?: MessageConfig | MessageTemplate }

type OneHitterOpts = OneHitterOptions & EmailOption

class OneHitter {
  private limiter: RateLimiter
  private message?: MessageConfig | MessageTemplate

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
  }

  // Overloads to support both drivers ergonomically
  async create(otp: OtpDoc): Promise<InsertOneResult<unknown>>
  async create(client: MongoClient, otp: OtpDoc): Promise<InsertOneResult<unknown>>
  async create(arg1: MongoClient | OtpDoc, arg2?: OtpDoc): Promise<InsertOneResult<unknown>> {
    const adapter = getAdapter()
    const isOtpFirst = (arg1 as any)?.contact && !(arg1 as any)?.db
    const otp = (isOtpFirst ? (arg1 as OtpDoc) : (arg2 as OtpDoc))
    const client = isOtpFirst ? undefined : (arg1 as MongoClient)
    return await adapter.create({ client, otp })
  }

  async send(to: string, otp: string): Promise<void> {
    await sendEmail(to, otp, OTP_URL, OTP_EXPIRY, this.message)
  }

  /**
   * Back-compat wrapper; true only when validateStatus returns 'ok'.
   */
  async validate(otp: Pick<OtpDoc, 'contact' | 'otp'>): Promise<boolean>
  async validate(client: MongoClient, otp: Pick<OtpDoc, 'contact' | 'otp'>): Promise<boolean>
  async validate(arg1: MongoClient | Pick<OtpDoc, 'contact' | 'otp'>, arg2?: Pick<OtpDoc, 'contact' | 'otp'>): Promise<boolean> {
    const status = await this.validateStatus(arg1 as any, arg2 as any)
    return status === 'ok'
  }

  /**
   * Rich status validation that distinguishes blocked/not_found/expired/ok.
   */
  async validateStatus(otp: Pick<OtpDoc, 'contact' | 'otp'>): Promise<ValidateStatus | 'blocked'>
  async validateStatus(client: MongoClient, otp: Pick<OtpDoc, 'contact' | 'otp'>): Promise<ValidateStatus | 'blocked'>
  async validateStatus(arg1: MongoClient | Pick<OtpDoc, 'contact' | 'otp'>, arg2?: Pick<OtpDoc, 'contact' | 'otp'>): Promise<ValidateStatus | 'blocked'> {
    const hasClient = typeof (arg1 as any)?.db === 'function'
    const otp = (hasClient ? (arg2 as any) : (arg1 as any)) as Pick<OtpDoc, 'contact' | 'otp'>
    const allowed = await this.limiter.beforeValidate(otp.contact)
    if (!allowed) return 'blocked'

    const adapter = getAdapter()
    const status = await adapter.validateWithStatus({ client: hasClient ? (arg1 as any) : undefined, otp })
    if (status === 'ok') await this.limiter.onSuccess(otp.contact)
    else await this.limiter.onFailure(otp.contact)
    return status
  }

  make(): string {
    const length = Number.isFinite(OTP_LENGTH) && OTP_LENGTH > 0 ? OTP_LENGTH : 6
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
