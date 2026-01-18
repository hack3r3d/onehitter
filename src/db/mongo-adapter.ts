import type { MongoClient, InsertOneResult } from 'mongodb'
import type { DbAdapter, OtpDoc, ValidateStatus } from './shared.js'
import { otpCreate, otpValidateWithStatus } from './mongodb-functions.js'

export class MongoAdapter implements DbAdapter {
  readonly name = 'mongodb' as const

  async create(args: { client?: MongoClient; otp: OtpDoc }): Promise<InsertOneResult<unknown>> {
    if (!args.client) throw new Error('MongoAdapter.create requires a MongoClient')
    return await otpCreate(args.client, args.otp)
  }

  async validateWithStatus(args: { client?: MongoClient; otp: Pick<OtpDoc, 'contact' | 'otp'> }): Promise<ValidateStatus> {
    if (!args.client) throw new Error('MongoAdapter.validateWithStatus requires a MongoClient')
    return await otpValidateWithStatus(args.client, args.otp)
  }
}