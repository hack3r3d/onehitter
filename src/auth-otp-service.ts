import { EventEmitter } from 'events'
import OneHitter from './onehitter.js'

// Define a standardized payload for type safety
export interface AuthSuccessPayload {
  userId: string
  authTime: Date
}

// Arbitrary extra fields that can be attached to auth events
export type AuthExtra = Record<string, unknown>

export type AuthSuccessExtra = AuthExtra

export type AuthFailureExtra = AuthExtra

export type AuthSuccessEventPayload = AuthSuccessPayload & AuthSuccessExtra

export type AuthFailureReason = 'not_found' | 'expired' | 'blocked' | 'unknown'

export interface AuthFailurePayload {
  userId: string
  authTime: Date
  reason: AuthFailureReason
}

export type AuthFailureEventPayload = AuthFailurePayload & AuthFailureExtra

/**
 * Optional dependencies for OtpAuthService.
 *
 * You can inject an existing OneHitter instance (for example, one that is
 * already configured with a custom rate limiter or database driver). If not
 * provided, a default OneHitter instance is created internally.
 *
 * You can also override the `buildPayload` function to control the exact
 * structure of the emitted success event payload (including additional fields),
 * and `buildFailurePayload` to control the structure of failure payloads.
 */
export interface OtpAuthServiceDeps {
  oneHitter?: OneHitter
  buildPayload?: (userId: string, extra?: AuthSuccessExtra) => AuthSuccessEventPayload
  buildFailurePayload?: (
    userId: string,
    reason: AuthFailureReason,
    extra?: AuthFailureExtra,
  ) => AuthFailureEventPayload
}

/**
 * The core OTP service. Extends EventEmitter to provide fan-out capabilities
 * via the 'auth:success' and 'auth:failure' events.
 *
 * This class delegates OTP validation to the OneHitter service. On successful
 * validation it emits a typed AUTH_SUCCESS event, and on failure it emits a
 * typed AUTH_FAILURE event, allowing multiple listeners (logging, sessions,
 * metrics, etc.) to react without coupling them to the underlying
 * authentication logic.
 */
export class OtpAuthService extends EventEmitter {
  // Use static readonly property for event names to prevent typos
  static readonly AUTH_SUCCESS = 'auth:success'
  static readonly AUTH_FAILURE = 'auth:failure'

  private readonly oneHitter: OneHitter
  private readonly buildPayload: (userId: string, extra?: AuthSuccessExtra) => AuthSuccessEventPayload
  private readonly buildFailurePayload: (
    userId: string,
    reason: AuthFailureReason,
    extra?: AuthFailureExtra,
  ) => AuthFailureEventPayload

  constructor(deps?: OtpAuthServiceDeps) {
    super()
    this.oneHitter = deps?.oneHitter ?? new OneHitter()
    this.buildPayload =
      deps?.buildPayload ??
      ((userId: string, extra?: AuthSuccessExtra): AuthSuccessEventPayload => ({
        userId,
        authTime: new Date(),
        ...(extra ?? {}),
      }))
    this.buildFailurePayload =
      deps?.buildFailurePayload ??
      ((
        userId: string,
        reason: AuthFailureReason,
        extra?: AuthFailureExtra,
      ): AuthFailureEventPayload => ({
        userId,
        authTime: new Date(),
        reason,
        ...(extra ?? {}),
      }))
  }

  /**
   * Authenticates the user and broadcasts the 'auth:success' event upon success.
   *
   * This method calls into the OneHitter `validate` API, using the provided
   * `userId` as the OTP contact identifier (for example, an email address or
   * phone number). If validation succeeds, a typed payload is emitted via the
   * AUTH_SUCCESS event.
   *
   * @param otp The one-time password provided by the user.
   * @param userId The logical user identifier (often the same as the OTP
   *               contact, such as an email address).
   * @param extra Optional bag of extra fields to attach to the emitted payload.
   * @returns A promise resolving to true if authentication succeeded, false otherwise.
   */
  public async authenticateUser(otp: string, userId: string, extra?: AuthSuccessExtra): Promise<boolean> {
    // In a real application you would remove or route this through a logger.
    // It is left here as an example of contextual logging around auth attempts.
    // eslint-disable-next-line no-console
    console.log(`Attempting authentication for user: ${userId}`)

    // Delegate to OneHitter for secure OTP validation with status information.
    // We assume that `userId` maps to the OTP contact identifier (e.g., email
    // or phone). If your application treats these differently, you can inject a
    // customized OneHitter instance or wrap this method accordingly.
    const status = await this.oneHitter.validateStatus({ contact: userId, otp })

    if (status === 'ok') {
      // 1. Prepare the payload (base + optional extras) for success
      const payload = this.buildPayload(userId, extra)

      // 2. Broadcast the success event (Fan-Out)
      this.emit(OtpAuthService.AUTH_SUCCESS, payload)

      return true
    }

    // Map underlying status to a stable, public failure reason
    const reason: AuthFailureReason =
      status === 'expired' || status === 'not_found' || status === 'blocked'
        ? status
        : 'unknown'

    const failurePayload = this.buildFailurePayload(userId, reason, extra)

    // Broadcast the failure event (Fan-Out)
    this.emit(OtpAuthService.AUTH_FAILURE, failurePayload)

    return false
  }
}
