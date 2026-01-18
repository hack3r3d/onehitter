# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OneHitter is a minimal, single-use one-time password (OTP) verification library for Node.js. It generates OTPs, stores hashed records, emails them via AWS SES, validates exactly once, and deletes them upon successful consumption.

## Build & Development Commands

```bash
# Build (dual ESM + CJS output)
npm run build              # Build both ESM and CJS
npm run build:esm          # TypeScript → ES2020 modules (dist/esm/)
npm run build:cjs          # TypeScript → CommonJS (dist/cjs/)
npm run typecheck          # Type check only, no emit

# Code Quality
npm run lint               # ESLint check
npm run lint:fix           # Auto-fix ESLint issues
npm run format             # Prettier check
npm run format:fix         # Auto-format

# Testing
npm run test               # Default tests (excludes email send tests)
npm run test:unit          # Unit tests only (no external services)
npm run test:integration   # Integration tests (needs MongoDB)
npm run test:integration:tc # Integration via Testcontainers (auto-starts MongoDB)
npm run test:coverage      # Full coverage with thresholds
npm run test:send          # Email send tests (requires AWS SES credentials)

# Run single test file
npx mocha tests/<filename>.js

# Database utility
npm run db:ensure-ttl      # Create/verify TTL index in MongoDB
```

## Architecture

### Core Flow
1. `OneHitter.make()` → generates OTP string
2. `OneHitter.create()` → stores hashed OTP in database
3. `OneHitter.send()` → emails OTP via AWS SES
4. `OneHitter.validate()` / `validateStatus()` → single-use validation with atomic delete

### Source Structure
```
src/
├── onehitter.ts           # Core class with make/create/send/validate
├── auth-otp-service.ts    # EventEmitter wrapper (auth:success/auth:failure)
├── sender.ts              # Email composition & AWS SES integration
├── rate-limiter.ts        # RateLimiter interface + InMemoryRateLimiter
├── config.ts              # Env var parsing (deferred, no import-time throws)
└── db/
    ├── index.ts           # Adapter selection (mongodb/sqlite)
    ├── shared.ts          # computeOtpHash, computeContactId (HMAC-SHA256)
    ├── mongo-adapter.ts   # MongoDB adapter
    ├── mongo-functions.ts # otpCreate, otpValidateWithStatus (atomic ops)
    ├── sqlite-adapter.ts  # SQLite adapter (lazy-loaded)
    └── sqlite-functions.ts # SQLite create/validate
```

### Key Patterns
- **Adapter Pattern**: Database layer abstracts MongoDB vs SQLite
- **Method Overloading**: Managed mode (pass MongoClient) vs unmanaged mode
- **Lazy Loading**: sqlite3 only imported when `OTP_DB_DRIVER=sqlite`
- **Peppered Hashing**: OTP and contact IDs hashed with server-side pepper (required in production)

### Exports
- Main: `dist/esm/onehitter.js` and `dist/cjs/onehitter.js`
- Sub-exports: `./rate-limiter`, `./sender`, `./db/ensure-ttl`

## Testing Notes

- Unit tests use stubs and don't require external services
- Integration tests require MongoDB (use `test:integration:tc` for Testcontainers auto-setup)
- Email send tests (`test:send`) require AWS SES credentials and are excluded from default run
- Coverage thresholds: 80% lines/functions/statements, 70% branches

## Environment Variables

Key variables (see `.env.example` for full list):
- `OTP_MONGO_CONNECTION` / `OTP_MONGO_DATABASE` / `OTP_MONGO_COLLECTION` - MongoDB config
- `OTP_DB_DRIVER` - "mongodb" (default) or "sqlite"
- `OTP_PEPPER` - HMAC pepper (required in production)
- `OTP_EXPIRY` - OTP lifetime in seconds
- `OTP_LENGTH` - OTP length (default: 6)
- `OTP_MESSAGE_FROM` / `OTP_MESSAGE_SUBJECT` - Email sender config
- `ONEHITTER_ALLOW_INSECURE_HASH=true` - Disable pepper requirement (tests only)

## Security Model

- OTPs and contacts are never stored in plaintext
- Uses HMAC-SHA256 with server-side pepper for hashing
- Single-use guarantee via atomic `findOneAndDelete`
- Production requires `OTP_PEPPER` to be set (or explicit override)
