// Mocha gating helpers to skip integration tests when env is unsafe/missing.
// Logs an explicit reason before skipping so CI logs are informative.
module.exports = {
  skipIfNoMongoConnection(ctx) {
    if (!(process.env.OTP_MONGO_CONNECTION || process.env.MONGO_CONNECTION)) {
      console.warn('[SKIP] Integration tests: OTP_MONGO_CONNECTION not set. Set OTP_MONGO_CONNECTION or run "npm run test:integration:tc" to use Testcontainers.')
      ctx.skip()
    }
  },
  skipIfNotTestDatabase(ctx) {
    const db = process.env.OTP_MONGO_DATABASE || process.env.MONGO_DATABASE
    if (!db || db.search(/test/) < 0) {
      console.warn(`[SKIP] Integration tests: OTP_MONGO_DATABASE must include "test" to protect data. Current value: ${db || '<unset>'}`)
      ctx.skip()
    }
  },
}
