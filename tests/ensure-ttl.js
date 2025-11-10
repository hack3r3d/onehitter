const assert = require('assert')
const proxyquire = require('proxyquire')

// Import the built JS so coverage maps correctly (nyc targets dist/cjs/**)
// Stub config at import time to avoid require-time env validation in config.js
// Ensure a fresh load so the stub is honored even if config.js was loaded earlier
for (const p of ['../dist/cjs/config.js', '../dist/cjs/db/ensure-ttl.js']) {
  try {
    const abs = require.resolve(p)
    if (require.cache[abs]) delete require.cache[abs]
  } catch {}
}

const pq = proxyquire.noCallThru().noPreserveCache()
const CONFIG_STUB = {
  MONGO_CONNECTION: 'mongodb://unit-test',
  MONGO_DATABASE: 'onehitter-test',
  MONGO_COLLECTION: 'otps',
  SES_REGION: 'us-east-1',
  OTP_MESSAGE_FROM: 'noreply@example.com',
  OTP_MESSAGE_SUBJECT: 'One-time password',
  OTP_URL: 'https://example.com',
  OTP_EXPIRY: 1800,
  OTP_LENGTH: 6,
  OTP_LETTERS_UPPER: false,
  OTP_LETTERS_LOWER: false,
  OTP_DIGITS: true,
  OTP_SPECIAL_CHARS: false,
}

const { ensureCreatedAtTTLIndex } = pq('../dist/cjs/db/ensure-ttl.js', {
  '../config': CONFIG_STUB,
})

// Ensure required env vars for the helper are present (used directly by ensure-ttl)
process.env.MONGO_DATABASE = process.env.MONGO_DATABASE || 'onehitter-test'
process.env.MONGO_COLLECTION = process.env.MONGO_COLLECTION || 'otps'

// Minimal in-memory fakes to satisfy the MongoDB calls used by ensureCreatedAtTTLIndex
function makeFake(clientState) {
  const calls = { createIndex: [], dropIndex: [] }

  const collection = {
    async indexes() {
      return clientState.indexes
    },
    async createIndex(spec, options) {
      calls.createIndex.push({ spec, options })
      return 'ok'
    },
    async dropIndex(name) {
      calls.dropIndex.push(name)
      return 'ok'
    },
  }

  const db = {
    collection() {
      return collection
    },
  }

  const client = {
    db() {
      return db
    },
  }

  return { client, calls }
}

describe('ensureCreatedAtTTLIndex()', () => {
  it('creates TTL index when missing', async () => {
    const state = { indexes: [] }
    const { client, calls } = makeFake(state)

    const res = await ensureCreatedAtTTLIndex(client, 1800)

    assert.strictEqual(res.action, 'created')
    assert.strictEqual(calls.dropIndex.length, 0)
    assert.strictEqual(calls.createIndex.length, 1)
    assert.deepStrictEqual(calls.createIndex[0].spec, { createdAt: 1 })
    assert.strictEqual(calls.createIndex[0].options.expireAfterSeconds, 1800)
  })

  it('updates TTL when existing index has different expireAfterSeconds', async () => {
    const state = {
      indexes: [
        { name: 'onehitter_createdAt_ttl', key: { createdAt: 1 }, expireAfterSeconds: 60 },
      ],
    }
    const { client, calls } = makeFake(state)

    const res = await ensureCreatedAtTTLIndex(client, 1800)

    assert.strictEqual(res.action, 'updated')
    assert.strictEqual(calls.dropIndex.length, 1)
    assert.strictEqual(calls.createIndex.length, 1)
    assert.strictEqual(calls.createIndex[0].options.expireAfterSeconds, 1800)
  })

  it('no-ops when existing TTL matches', async () => {
    const state = {
      indexes: [
        { name: 'onehitter_createdAt_ttl', key: { createdAt: 1 }, expireAfterSeconds: 1800 },
      ],
    }
    const { client, calls } = makeFake(state)

    const res = await ensureCreatedAtTTLIndex(client, 1800)

    assert.strictEqual(res.action, 'unchanged')
    assert.strictEqual(calls.dropIndex.length, 0)
    assert.strictEqual(calls.createIndex.length, 0)
  })

  it('throws when MONGO_DATABASE or MONGO_COLLECTION missing', async () => {
    const db = process.env.MONGO_DATABASE
    const coll = process.env.MONGO_COLLECTION
    delete process.env.MONGO_DATABASE
    try {
      const state = { indexes: [] }
      const { client } = makeFake(state)
      await assert.rejects(() => ensureCreatedAtTTLIndex(client, 100), /Missing MONGO_DATABASE or MONGO_COLLECTION/)
    } finally {
      process.env.MONGO_DATABASE = db
      process.env.MONGO_COLLECTION = coll
    }
  })
})
