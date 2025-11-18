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
- Storage adapter: MongoDB (default) or SQLite (experimental). Choose with `OTP_DB_DRIVER` (`mongodb` or `sqlite`).
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
- Optional: SQLite (`OTP_DB_DRIVER=sqlite`, optional `SQLITE_PATH`); good for tests/small apps.

### Database driver env
- `OTP_DB_DRIVER` (optional): selects the storage driver.
  - `mongodb` (default): uses the MongoDB adapter and only requires the `mongodb` dependency.
  - `sqlite`: uses the built-in SQLite adapter and requires the host app to install `sqlite3` (for example, `npm install sqlite3`). When `OTP_DB_DRIVER=mongodb`, `sqlite3` is not required and is not loaded.

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

## 🤝 Contributing

This project is an open-source effort, and all contributions are welcome, big or small. Whether you're fixing a typo, squashing a nasty bug, writing documentation, or proposing a major new feature, your help can have a real impact on this project.

Here are a few ways you can support the OneHitter:

🐛 Reporting Bugs

If you find a bug, please check the existing issues list to see if it has already been reported. If not, open a new issue and include:

Steps to reproduce the bug.

The expected behavior versus the actual behavior.

The environment (OS, Node version, browser, etc.) where the bug occurred.

✨ Feature Requests

Have an idea for how OneHitter could be improved? Open an issue and use the "Feature Request" label. Describe the proposed feature, why it would be useful, and how you imagine it working.

💻 Code Contributions (Pull Requests)

We encourage you to submit Pull Requests (PRs). If you're ready to dive into the code, here's our simple workflow:

1. Fork the repository and clone it locally.

2. Create a new branch for your fix or feature:

3. git checkout -b feature/your-feature-name
OR git checkout -b bugfix/issue-number

4. Make your changes. Please ensure your code follows the existing style, includes appropriate comments, and passes all existing tests.

5. Write tests for any new features or bug fixes.

6. Commit your changes with a descriptive commit message.

7. Push your branch and open a Pull Request against the main branch of this repository.

It's a simple seven step process.

I'm especially looking for ...

* TypeScript Refactoring: Improving type safety and clarity across the codebase.

* Performance Optimizations: Identifying and improving bottlenecks.

* Security Improvements: Making sure the otp are as secure in the db and code as possible.

* Databases: Currently OneHitter really only supports MongoDB. An adapter for Postgresql, MySQL/Maria, or any other databases.

* Documentation: Adding more examples, tutorials, or clarifying existing docs.

Thank you for helping build great software. I look forward to reviewing your contributions.

If you don't want to write code, you can still help by sending me money via [Venmo](https://venmo.com/unifly)
