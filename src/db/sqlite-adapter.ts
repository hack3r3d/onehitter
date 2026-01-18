import type { InsertOneResult } from 'mongodb'
import type { DbAdapter, OtpDoc, ValidateStatus } from './shared.js'
import { otpCreate, otpValidateWithStatus } from './sqlite-functions.js'

export class SqliteAdapter implements DbAdapter {
  readonly name = 'sqlite' as const

  async create(args: { client?: unknown; otp: OtpDoc }): Promise<InsertOneResult<unknown>> {
    return await otpCreate(args.otp)
  }

  async validateWithStatus(args: { client?: unknown; otp: Pick<OtpDoc, 'contact' | 'otp'> }): Promise<ValidateStatus> {
    return await otpValidateWithStatus(args.otp)
  }
}