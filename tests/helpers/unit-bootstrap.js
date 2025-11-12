// Global bootstrap for unit tests to avoid require-time env assertions in config.js
// Keep this minimal and generic; integration tests still validate real env.
process.env.OTP_DB_DRIVER = process.env.OTP_DB_DRIVER || 'sqlite'
process.env.OTP_MESSAGE_FROM = process.env.OTP_MESSAGE_FROM || 'noreply@example.com'
process.env.OTP_URL = process.env.OTP_URL || 'https://example.com'
process.env.OTP_EXPIRY = process.env.OTP_EXPIRY || '1800'
process.env.SES_REGION = process.env.SES_REGION || 'us-east-1'

// Do NOT set MONGO_CONNECTION here to avoid masking missing env in integration runs.
// If a unit test imports a Mongo-only module that requires MONGO env at import,
// it should stub ./config or import the specific functions that don't touch MONGO.
