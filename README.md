# OneHitter

Minimal, single-use one-time password (OTP) verification for Node.js apps.

It generates an OTP, stores a hashed record, emails it to the user, then validates exactly once and deletes it. MongoDB is the default storage; an optional SQLite path exists for small apps and tests. Email delivery uses AWS SES via Nodemailer.

## Why it exists
- Simple, pragmatic OTP without a big auth stack
- Explicit single-use guarantee (consume on validate)
- Clear app ownership of DB client lifecycle (no hidden globals)
- Reasonable security posture by default (hashed OTP with pepper, rate-limiter hooks)

## Features
- Single-use validation: OTP is consumed (deleted) on successful validate
- Detailed outcomes with `validateStatus()`: 'ok' | 'not_found' | 'expired' | 'blocked'
- Pluggable storage: MongoDB (default) and SQLite (experimental)
- Expiry: code-level check plus MongoDB TTL helper (`npm run db:ensure-ttl`)
- Email delivery via AWS SES (Nodemailer) with configurable subject/text/HTML templates
- Secure hashing: HMAC with server-side pepper; plaintext OTP is never stored
- Rate limiting hooks and optional built-in in-memory limiter (env-flag enable)
- Explicit client lifecycle: you manage the MongoClient; no hidden globals
- ESM and CJS builds, bundled TypeScript types
- Node 18/20 supported (see engines in package.json)

## How it works (high level)
- OneHitter class exposes four main operations:
  - make(): create an OTP string according to env flags
  - create(...): persist a hashed OTP document
  - send(to, otp): email the OTP via SES (customizable template)
  - validate / validateStatus(...): consume once and return success or a detailed status
- Storage adapter: MongoDB (default) or SQLite (experimental). Choose with `DB_DRIVER`.
- Expiry: checked at validation time; MongoDB users should also create a TTL index on `createdAt` for cleanup.
- Rate limiting: bring your own limiter or enable a built-in in-memory limiter via env flags.

See docs/ARCHITECTURE.md for a deeper dive.

## Quick start
1) Install and build
```bash
npm install
npm run build
```

2) Configure minimal env
```env
MONGO_CONNECTION=mongodb+srv://...
MONGO_DATABASE=myapp
MONGO_COLLECTION=otps

OTP_MESSAGE_FROM=noreply@example.com
OTP_MESSAGE_SUBJECT=Your verification code
OTP_URL=https://example.com/verify
OTP_EXPIRY=1800

OTP_LENGTH=6
OTP_DIGITS=true
```

3) Use in your app (MongoDB)
```js
const { MongoClient, ServerApiVersion } = require('mongodb')
const OneHitter = require('onehitter').default

const client = new MongoClient(process.env.MONGO_CONNECTION, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
})
await client.connect()

const one = new OneHitter()
const otp = one.make()
await one.create(client, { contact: 'user@example.com', otp, createdAt: new Date() })
await one.send('user@example.com', otp)
const ok = await one.validate(client, { contact: 'user@example.com', otp })

await client.close()
```

- To automatically purge old OTPs in MongoDB, create a TTL index on `createdAt` (see docs/DB.md).
- For detailed validation outcomes (expired/not_found/blocked), use `validateStatus()` (see examples/validate-status.md).

## API at a glance
- `make(): string` — generate an OTP according to env flags (`OTP_LENGTH`, `OTP_*`)
- `create(client, { contact, otp, createdAt }): Promise<InsertOneResult>` — MongoDB
- `create({ contact, otp, createdAt }): Promise<InsertOneResult>` — SQLite (no client)
- `send(to, otp): Promise<void>` — emails via SES; template customizable
- `validate(...): Promise<boolean>` — true only when consumed successfully
- `validateStatus(...): Promise<'ok' | 'not_found' | 'expired' | 'blocked'>`

Example: validateStatus
```js
const status = await one.validateStatus(client, { contact: 'user@example.com', otp })
if (status === 'ok') {
  // proceed
} else if (status === 'expired') {
  // ask user to request a new OTP
} else if (status === 'blocked') {
  // tell user to slow down
} else {
  // not_found — wrong/already used/TTL-removed
}
```

## Databases
- Default: MongoDB. Your app owns the `MongoClient` (construct, connect/close, pass to `create`/`validate`).
- Optional: SQLite (`DB_DRIVER=sqlite`, optional `SQLITE_PATH`); good for tests/small apps.

Details and tradeoffs: docs/DB.md

## More docs and examples
- Architecture and design: [ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Database setup and TTL index: [DB.md](docs/DB.md)
- Email setup and templates (SES): [EMAIL.md](docs/EMAIL.md)
- Rate limiting: [RATE_LIMITING.md](docs/RATE_LIMITING.md)
- Security and hashing: [SECURITY.md](docs/SECURITY.md)
- Testing strategy and commands: [TESTING.md](docs/TESTING.md)
- Usage examples: [examples](examples)

## Limitations

- Storage drivers
  - MongoDB: fully supported and recommended for production.
  - SQLite: provided for small apps/tests. Not suitable for multi-instance deployments; there’s no shared state across processes and no background TTL cleanup.

- Email transport
  - SES-only via Nodemailer from the public API. You can customize message content (subject/text/HTML), but you cannot inject a custom Nodemailer transporter yet.
  - SES sandbox: you must verify recipients or request production access.

- Expiry and cleanup
  - Expiry is enforced at validation time. Automatic deletion of expired OTPs in MongoDB requires a TTL index on `createdAt` (run `npm run db:ensure-ttl`). Changing `OTP_EXPIRY` does not automatically change the TTL index—run the helper or recreate the index.
  - SQLite has no background cleanup; old rows persist until validated or removed by your app.

- Rate limiting
  - Default limiter is a no-op. You must wire a real, centralized limiter (e.g., Redis) for production. The built-in in-memory limiter is single-process only (not distributed).

- Security model
  - Requires a server-side pepper (`OTP_PEPPER`) in production to protect OTP hashes. Email is not a confidential channel; OTP length/charset should be tuned for your risk profile.
  - Not a full auth provider: no device binding, phishing resistance, or step-up auth; just email OTP.

- Concurrency and multiple OTPs
  - Single-use is guaranteed atomically for MongoDB; SQLite uses a “newest id wins” and delete-on-validate pattern. In multi-instance environments, prefer MongoDB.
  - The library allows multiple active OTPs per contact (e.g., resends). Only the matched one is consumed; older codes may remain until TTL/validation unless your app pre-cleans.

- Time assumptions
  - Expiry uses server time; keep clocks in sync across instances.

- Scope
  - Channel is email-only; SMS/push require a new sender/transport abstraction.
  - Internationalization, deliverability management, and compliance (PCI/HIPAA, etc.) are out of scope and depend on your environment.