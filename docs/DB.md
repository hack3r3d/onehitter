# Database setup and drivers

OneHitter supports two storage drivers:

- MongoDB (default) — production-ready, single-use guarantee with an atomic operation; recommended TTL index for cleanup
- SQLite (experimental) — convenient for small apps and tests; single-use guarantee; no background TTL cleanup

Select driver via env:

```env
# Default is mongodb
DB_DRIVER=mongodb
# For SQLite
# DB_DRIVER=sqlite
# SQLITE_PATH=./onehitter.sqlite   # optional; default is :memory:
```

## MongoDB

Your application owns the MongoClient lifecycle:
- construct a MongoClient (e.g., with ServerApi v1)
- connect at startup and close on shutdown
- pass the client to `create`, `validate`, and `validateStatus`

Recommended automatic cleanup (TTL index on `createdAt`):

```bash
npm run db:ensure-ttl
```

What it does:
- creates a TTL index on `createdAt` if missing
- updates it when the TTL seconds differ from `OTP_EXPIRY`

Notes:
- Expiry is also checked in code at validation time; the TTL index is for background deletion
- Changing `OTP_EXPIRY` alone does not modify the TTL index until you run the helper above or recreate the index yourself

Schema (persisted shape):
- `{ contact: string, otpHash: string, createdAt: Date }`

## SQLite

- Set `DB_DRIVER=sqlite` and optionally `SQLITE_PATH` to a file path (default `:memory:`)
- No `MongoClient` is required; call `create(...)` and `validate(...)` without a client
- Expiry is enforced during validation using `OTP_EXPIRY`; there is no background deletion

Caveats:
- Use a centralized database for multi-instance deployments; in-memory or per-instance SQLite files won’t be shared
- For durability, point `SQLITE_PATH` to a persistent volume/file

## Adding new adapters

See `src/db/mongo-adapter.ts`, `src/db/sqlite-adapter.ts`, and the shared types in `src/db/shared.ts` for the adapter interface. Contributions for additional drivers are welcome.
