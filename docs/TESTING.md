# Testing modes

This repo has two categories of tests:

- Unit (default for CI): no external services. Uses stubs/fakes.
- Integration (optional): requires a real MongoDB; the email send test is opt-in and is excluded from the default test run.

## Unit tests (recommended default)

- Run all unit tests:

```
npm run test:unit
```

- Coverage for unit tests only:

```
npm run test:coverage:unit
```

Included unit suites:
- `tests/make.js` — OTP generation behavior
- `tests/rate-limiter-defaults.js` — rate limiter defaults
- `tests/sender.js` — email construction (nodemailer is stubbed)
- `tests/sqlite-functions.js` — SQLite path with stubbed sqlite3
- `tests/sqlite-adapter.js` — adapter forwarding behavior
- `tests/ensure-ttl.js` — Mongo TTL helper logic with fakes (no DB)

## Integration tests (optional)

Requires MongoDB. Either use Testcontainers (no Docker CLI commands) or Docker Compose.

Option A — Testcontainers (recommended):

- Runs a MongoDB container automatically via Mocha bootstrap, sets envs.
- Command:

```
npm run test:integration:tc
```

Option B — Docker Compose:

```
docker-compose up -d mongo
export MONGO_CONNECTION="mongodb://localhost:27017"
export MONGO_DATABASE="onehitter-test"
export MONGO_COLLECTION="otp"
```

Then run:

```
npm run test:integration
```

Email/SES tests: The default `npm test` excludes the email-send test by grep. To explicitly run it:

```
npm run test:send
```

## Notes

- CI runs `test:unit` and enforces coverage thresholds on unit tests only.
- Integration tests are suitable for local or scheduled CI jobs with a Mongo service. If desired, add a separate workflow job that uses `services: mongo` or Testcontainers.
