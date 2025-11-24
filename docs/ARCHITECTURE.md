# Architecture

High-level components:

- OneHitter (src/onehitter.ts)
  - make(): builds an OTP string using `otp-generator` and env flags
  - create(): persists a record via the selected DB adapter
  - send(): composes and sends an email via Nodemailer + AWS SES
  - validate()/validateStatus(): enforces single-use and returns status
  - Rate limiter integration: calls `beforeValidate`/`onSuccess`/`onFailure`

- Auth event emitter (src/auth-otp-service.ts)
  - `OtpAuthService` extends Node's `EventEmitter`
  - Emits `auth:success` (`AUTH_SUCCESS`) with a typed payload when `OneHitter.validateStatus` returns `"ok"`
  - Emits `auth:failure` (`AUTH_FAILURE`) with a typed payload when validation fails (`"not_found" | "expired" | "blocked" | "unknown"`)
  - Payloads are extensible via optional `buildPayload` / `buildFailurePayload` dependencies and an `extra` bag passed to `authenticateUser`

- Storage adapters (src/db)
  - MongoAdapter 	 `mongodb-functions.ts` (atomic findOneAndDelete + expiry check)
  - SqliteAdapter 	 `sqlite-functions.ts` (newest id wins + expiry check)
  - Adapter selection comes from `OTP_DB_DRIVER` or from passing a `MongoClient`

- Email sender (src/sender.ts)
  - Builds message from env or user overrides (text or HTML)
  - Uses AWS SES v3 transport via Nodemailer

- Security and hashing (src/db/shared.ts)
  - Stores `otpHash` (HMAC with a server-side pepper); plaintext OTP is never persisted
  - Derives a pseudonymous `contactId` from the original contact using the same peppered hashing strategy; raw contacts are not stored in the default adapters
  - In production, a pepper is required unless explicitly overridden for tests

- Rate limiting (src/rate-limiter.ts)
  - Interface with three hooks
  - Noop (default) and in-memory implementations; bring your own for production

- Configuration (src/config.ts)
  - Parses env at runtime (no import-time throws) and provides typed values

Key behaviors:
- Single-use: validation always deletes the matching record
- Expiry: enforced in code at validation time; MongoDB users should also create a TTL index on `createdAt`
- Client ownership: applications manage their own `MongoClient` and pass it to DB operations
