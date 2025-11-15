# Security considerations

Short-lived OTPs are easy to brute-force if stored with a plain hash. This library supports HMAC with a server-side pepper and enforces safer defaults in production.

Recommendations
- Production requirement: set `OTP_PEPPER`. In production (`NODE_ENV=production`), the library will throw when hashing OTPs if `OTP_PEPPER` is not set.
- Keep OTP length and character space sufficiently large (e.g., 8–10 chars, include letters + digits) to reduce online guessing.
- Rate limit validation attempts per contact/IP.
- Prefer transport security and destination controls (e.g., SES production, verified senders/recipients, DMARC/SPF/DKIM).

Optional hardening
- Per-contact salt (pepper + salt):
  - The hasher for OTPs accepts an optional salt parameter (`computeOtpHash(contact, otp, { salt })`).
  - Contact identifiers are also derived via a peppered hash (`computeContactId(contact)`), so the raw contact (e.g., email) is not stored in the default adapters.
  - You can generate and store a separate random salt alongside the OTP hash or contact ID per record and include it in validation.
  - Current adapters do not persist `salt` by default; extend your storage schema and adapt create/validate to include it.

Examples

MongoDB (custom adapter with salt persistence)
```js
// Example only — place in your app layer
const { MongoClient } = require('mongodb')
const { computeOtpHash } = require('onehitter/dist/cjs/db/shared.js')

async function createOtpWithSalt(client, { contact, otp, createdAt }) {
  const db = client.db(process.env.MONGO_DATABASE)
  const coll = db.collection(process.env.MONGO_COLLECTION)
  const salt = require('crypto').randomBytes(16).toString('hex')
  const otpHash = computeOtpHash(contact, otp, { salt })
  return await coll.insertOne({ contact, otpHash, salt, createdAt: createdAt || new Date() })
}

async function validateOtpWithSalt(client, { contact, otp }) {
  const db = client.db(process.env.MONGO_DATABASE)
  const coll = db.collection(process.env.MONGO_COLLECTION)
  // Fetch newest record to get its salt
  const doc = await coll.find({ contact }).sort({ _id: -1 }).limit(1).next()
  if (!doc) return false
  const otpHash = computeOtpHash(contact, otp, { salt: doc.salt })
  const res = await coll.findOneAndDelete({ _id: doc._id, otpHash })
  return !!(res && (res.value || res.createdAt))
}
```

SQLite (custom table with a salt column)
```js
// Example only — place in your app layer
const sqlite3 = require('sqlite3')
const { computeOtpHash } = require('onehitter/dist/cjs/db/shared.js')

const db = new sqlite3.Database(process.env.SQLITE_PATH || ':memory:')
db.serialize(() => {
  db.run('CREATE TABLE IF NOT EXISTS otp (\n' +
         '  id INTEGER PRIMARY KEY AUTOINCREMENT,\n' +
         '  contact TEXT NOT NULL,\n' +
         '  otpHash TEXT NOT NULL,\n' +
         '  salt TEXT NOT NULL,\n' +
         '  createdAt INTEGER NOT NULL\n' +
         ')')
  db.run('CREATE INDEX IF NOT EXISTS idx_otp_contact_hash ON otp(contact, otpHash)')
})

function createOtpWithSalt({ contact, otp, createdAt }) {
  const salt = require('crypto').randomBytes(16).toString('hex')
  const otpHash = computeOtpHash(contact, otp, { salt })
  const ts = (createdAt ? createdAt.getTime() : Date.now())
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO otp (contact, otpHash, salt, createdAt) VALUES (?, ?, ?, ?)',
      [contact, otpHash, salt, ts], function (err) {
        if (err) return reject(err)
        resolve({ acknowledged: true, insertedId: this.lastID })
      })
  })
}

function validateOtpWithSalt({ contact, otp }) {
  return new Promise((resolve, reject) => {
    db.get('SELECT id, salt, createdAt FROM otp WHERE contact = ? ORDER BY id DESC LIMIT 1',
      [contact], function (err, row) {
        if (err) return reject(err)
        if (!row) return resolve(false)
        const otpHash = computeOtpHash(contact, otp, { salt: row.salt })
        db.run('DELETE FROM otp WHERE id = ? AND otpHash = ?', [row.id, otpHash], function (delErr) {
          if (delErr) return reject(delErr)
          resolve(this.changes === 1)
        })
      })
  })
}
```

Escape hatch (testing only)
- In production, a pepper is required. For exceptional cases (e.g., end-to-end tests that set NODE_ENV=production), set:
  - `ONEHITTER_ALLOW_INSECURE_HASH=true`
- Do not use this in real production; it disables the protection against offline brute-force of OTP hashes.

Tradeoffs and rationale
- Pepper (HMAC) offers strong protection even without per-record salt, given the tiny OTP space; without a pepper, a 6–10 char OTP is trivial to brute-force offline.
- We avoid import-time env requirements; checks happen at runtime when you actually hash or send, with clear error messages.
