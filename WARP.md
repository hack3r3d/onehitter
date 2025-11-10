# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Project overview
- Purpose: Minimal one-time-password (OTP) verification library. Generates an OTP, stores it in MongoDB, emails it via Amazon SES, validates it once, and deletes it.
- Tech: Node.js (no build step), MongoDB, Nodemailer + AWS SES, dotenv-based configuration.

Architecture (big picture)
- onehitter.js: Exposes class OneHitter with four methods:
  - make(): uses otp-generator to produce an OTP based on env configuration flags.
  - create(client, otp): persists an OTP document to MongoDB via db/mongodb-functions.js.
  - send(to, otp): sends email via sender.js using AWS SES through Nodemailer.
  - validate(client, otp): checks for an exact match in MongoDB and deletes it if found (single-use guarantee).
- db/mongodb.js: Creates and exports a MongoClient using MONGO_CONNECTION and ServerApi v1. All DB operations share this client.
- db/mongodb-functions.js: Implements otpCreate and otpValidate.
  - otpCreate: ensures createdAt exists, inserts document into MONGO_DATABASE/MONGO_COLLECTION.
  - otpValidate: finds exact match; if found, deletes it and returns true; otherwise false.
  - OTP document shape assumed in code/tests: { contact, otp, createdAt }.
- sender.js: Configures Nodemailer transport backed by AWS SES (region us-east-1). Email fields sourced from env. Message text includes target URL and expiry (minutes) derived from OTP_EXPIRY.
- tests/onehitter.js: Integration-style tests that connect to a real MongoDB and can send a real email. Guard requires MONGO_DATABASE to include the substring "test" before running. Loads env from ./../.env.test.
- Expiry policy: Actual OTP expiry relies on a MongoDB TTL index on createdAt (see README). OTP_EXPIRY only affects the email message copy; it does not enforce deletion.

Environment and configuration
- Copy .env.example to .env for application usage and to .env.test for tests. Required keys per .env.example: MONGO_CONNECTION, MONGO_COLLECTION, MONGO_DATABASE, OTP_MESSAGE_FROM, OTP_MESSAGE_SUBJECT, OTP_URL, OTP_EXPIRY, OTP_LENGTH, OTP_LETTERS_UPPER, OTP_LETTERS_LOWER, OTP_DIGITS, OTP_SPECIAL_CHARS.
- Tests also expect OTP_MESSAGE_TEST_TO (not in .env.example) for the recipient used in the email-send test.
- To enable automatic OTP expiry, create a TTL index on createdAt in your MongoDB collection (value should align with OTP_EXPIRY; details in README.md).

Common commands
- Install dependencies
  - npm install
  - For CI: npm ci
- Lint/format: Not configured in this repo.
- Build: No build step; sources are plain Node.js.
- Tests (Mocha is configured as a devDependency):
  - Run integration tests (default excludes email send):
    - npm run test
  - Run all tests (includes email send):
    - npm run test:all
  - Run a single file:
    - npm run test:file
  - Run only the email-send suite:
    - npm run test:send
  - Run a single test by title (example):
    - npm run test:file -- -g "validate-fail"

Operational notes
- Tests are integration tests; they connect to a real MongoDB instance and can trigger real emails via SES. Ensure MONGO_DATABASE contains the substring "test" (guard enforced in tests). Consider pointing .env.test to isolated resources.
- The library does not start a server or CLI; use OneHitter class directly from your application code.

Key references
- README.md: Contains configuration details and guidance for the MongoDB TTL index on createdAt.
