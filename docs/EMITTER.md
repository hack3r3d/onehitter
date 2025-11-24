# Auth event emitter (OtpAuthService)

`OtpAuthService` is an optional wrapper around `OneHitter` that turns OTP validation into a fan-out event stream using Node's built-in `EventEmitter`.

Use it when you want to keep OTP validation logic centralized but let multiple subsystems react independently to authentication outcomes (sessions, logging, metrics, notifications, etc.).

## Overview

- Lives in `src/auth-otp-service.ts` and is compiled to `dist/{cjs,esm}/auth-otp-service.js`.
- Extends `EventEmitter`.
- Delegates OTP checks to a `OneHitter` instance via `validateStatus(...)`.
- Emits **typed** success and failure events:
  - `auth:success` (`OtpAuthService.AUTH_SUCCESS`)
  - `auth:failure` (`OtpAuthService.AUTH_FAILURE`)

By default, `userId` is treated as the OTP contact identifier (for many apps this will be the user's email address).

## API (TypeScript shape)

```ts
import { EventEmitter } from 'events'
import OneHitter from './onehitter'

export type AuthFailureReason = 'not_found' | 'expired' | 'blocked' | 'unknown'

export interface AuthSuccessPayload {
  userId: string
  authTime: Date
}

export type AuthExtra = Record<string, unknown>
export type AuthSuccessEventPayload = AuthSuccessPayload & AuthExtra

export interface AuthFailurePayload {
  userId: string
  authTime: Date
  reason: AuthFailureReason
}

export type AuthFailureEventPayload = AuthFailurePayload & AuthExtra

export interface OtpAuthServiceDeps {
  oneHitter?: OneHitter
  buildPayload?: (userId: string, extra?: AuthExtra) => AuthSuccessEventPayload
  buildFailurePayload?: (
    userId: string,
    reason: AuthFailureReason,
    extra?: AuthExtra,
  ) => AuthFailureEventPayload
}

export class OtpAuthService extends EventEmitter {
  static readonly AUTH_SUCCESS = 'auth:success'
  static readonly AUTH_FAILURE = 'auth:failure'

  constructor(deps?: OtpAuthServiceDeps)

  authenticateUser(otp: string, userId: string, extra?: AuthExtra): Promise<boolean>
}
```

Key points:
- If you do not inject `oneHitter`, the service creates its own `OneHitter` with default configuration.
- `extra` is an arbitrary bag of fields that is merged into emitted payloads (both success and failure).
- You can fully control the payload structure by providing `buildPayload` / `buildFailurePayload`.

## Events

### `AUTH_SUCCESS` / `"auth:success"`

Emitted when `OneHitter.validateStatus({ contact: userId, otp })` returns `'ok'`.

Default payload shape:

```ts
{
  userId: string
  authTime: Date
  // plus any fields from `extra`, or whatever your custom buildPayload returns
}
```

### `AUTH_FAILURE` / `"auth:failure"`

Emitted when validation fails.

- Underlying statuses from `validateStatus` are mapped to a public `reason` union:
  - `'not_found'` – no matching OTP (wrong, already used, or TTL-purged)
  - `'expired'` – matching OTP exists but is past the configured TTL
  - `'blocked'` – rate limiter blocked the attempt
  - `'unknown'` – fallback for any unexpected internal status

Default payload shape:

```ts
{
  userId: string
  authTime: Date
  reason: 'not_found' | 'expired' | 'blocked' | 'unknown'
  // plus any fields from `extra`, or whatever your custom buildFailurePayload returns
}
```

## Usage example (Node.js, CommonJS)

```js
const { OtpAuthService } = require('onehitter/dist/cjs/auth-otp-service.js')

// Use a shared service instance for your app
const authSvc = new OtpAuthService()

authSvc.on(OtpAuthService.AUTH_SUCCESS, (event) => {
  // Example: create a session and log metrics
  console.log('[auth success]', event.userId, event.authTime)
})

authSvc.on(OtpAuthService.AUTH_FAILURE, (event) => {
  // Example: log failures and maybe trigger alerts
  console.warn('[auth failure]', event.userId, event.reason)
})

async function handleLogin(req, res) {
  const { otp, userId } = req.body

  const ok = await authSvc.authenticateUser(otp, userId, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  })

  if (!ok) {
    return res.status(401).json({ ok: false })
  }

  // Success path
  return res.json({ ok: true })
}
```

## Customizing payloads

You can inject your own payload builders to add required fields or integrate with existing event schemas:

```ts
import OneHitter from 'onehitter'
import { OtpAuthService } from 'onehitter/dist/esm/auth-otp-service.js'

const oneHitter = new OneHitter(/* options */)

const authSvc = new OtpAuthService({
  oneHitter,
  buildPayload(userId, extra) {
    return {
      userId,
      authTime: new Date('2000-01-01T00:00:00Z'),
      kind: 'auth_success',
      ...extra,
    }
  },
  buildFailurePayload(userId, reason, extra) {
    return {
      userId,
      authTime: new Date('2000-01-02T00:00:00Z'),
      reason,
      kind: 'auth_failure',
      ...extra,
    }
  },
})
```

This lets you plug `OtpAuthService` into an existing event bus or logging pipeline while keeping OTP logic decoupled from downstream concerns.
