const assert = require('assert')
const proxyquire = require('proxyquire')

// Build-time product path; nyc collects coverage from dist/cjs/**
const MODULE_PATH = '../dist/cjs/db/sqlite-functions.js'

function makeFakeSqlite() {
  let idSeq = 0
  const state = {
    rows: [], // { id, contact, otpHash, createdAt }
    createdIndexes: [],
    serialized: false,
  }

  class Database {
    constructor(_path) {}
    serialize(fn) {
      state.serialized = true
      fn && fn()
    }
    run(sql, params, cb) {
      // params optional
      if (typeof params === 'function') { cb = params; params = undefined }
      const sqlUp = String(sql).toUpperCase()
      if (sqlUp.startsWith('CREATE TABLE') || sqlUp.startsWith('CREATE INDEX')) {
        state.createdIndexes.push(sql)
        cb && cb.call({})
        return
      }
      if (sqlUp.startsWith('INSERT INTO OTP')) {
        const [contactId, otpHash, createdAt] = params
        const id = ++idSeq
        state.rows.push({ id, contactId, otpHash, createdAt })
        cb && cb.call({ lastID: id }, null)
        return
      }
      if (sqlUp.startsWith('DELETE FROM OTP')) {
        const [id] = params
        const before = state.rows.length
        state.rows = state.rows.filter(r => r.id !== id)
        const changes = before - state.rows.length
        cb && cb.call({ changes }, null)
        return
      }
      throw new Error('Unhandled SQL in fake DB: ' + sql)
    }
    get(sql, params, cb) {
      const sqlUp = String(sql).toUpperCase()
      if (sqlUp.startsWith('SELECT ID, CREATEDAT FROM OTP')) {
        const [contactId, otpHash] = params
        const found = state.rows
          .filter(r => r.contactId === contactId && r.otpHash === otpHash)
          .sort((a, b) => b.id - a.id)[0]
        cb && cb(null, found ? { id: found.id, createdAt: found.createdAt } : undefined)
        return
      }
      throw new Error('Unhandled SELECT in fake DB: ' + sql)
    }
  }

  return { sqlite3: { Database }, state }
}

describe('sqlite-functions (unit, stubbed sqlite3)', () => {
  it('otpCreate inserts and returns InsertOne-like result', async () => {
    const { sqlite3, state } = makeFakeSqlite()
    const { otpCreate } = proxyquire(MODULE_PATH, { sqlite3 })

    const now = new Date('2020-01-01T00:00:00Z')
    const res = await otpCreate({ contact: 'a@b.com', otp: '123456', createdAt: now })

    assert.strictEqual(res.acknowledged, true)
    assert.ok(res.insertedId)
    assert.strictEqual(state.rows.length, 1)
  })

  it('otpValidateWithStatus returns ok for fresh OTP and consumes it', async () => {
    const { sqlite3 } = makeFakeSqlite()
    const { otpCreate, otpValidateWithStatus } = proxyquire(MODULE_PATH, { sqlite3 })

    const createdAt = new Date('2020-01-01T00:00:00Z')
    await otpCreate({ contact: 'c@d.com', otp: '111111', createdAt })

    const status = await otpValidateWithStatus({ contact: 'c@d.com', otp: '111111' }, new Date('2020-01-01T00:05:00Z'), 1800)
    assert.strictEqual(status, 'ok')
  })

  it('otpValidateWithStatus returns expired when older than TTL', async () => {
    const { sqlite3 } = makeFakeSqlite()
    const { otpCreate, otpValidateWithStatus } = proxyquire(MODULE_PATH, { sqlite3 })

    const createdAt = new Date('2020-01-01T00:00:00Z')
    await otpCreate({ contact: 'e@f.com', otp: '222222', createdAt })

    const status = await otpValidateWithStatus({ contact: 'e@f.com', otp: '222222' }, new Date('2020-01-01T01:00:01Z'), 1800)
    assert.strictEqual(status, 'expired')
  })

  it('otpValidateWithStatus returns not_found when wrong code or already consumed', async () => {
    const { sqlite3 } = makeFakeSqlite()
    const { otpCreate, otpValidateWithStatus } = proxyquire(MODULE_PATH, { sqlite3 })

    const createdAt = new Date('2020-01-01T00:00:00Z')
    await otpCreate({ contact: 'x@y.com', otp: '999999', createdAt })

    // wrong code
    const s1 = await otpValidateWithStatus({ contact: 'x@y.com', otp: '000000' }, new Date('2020-01-01T00:00:10Z'), 1800)
    assert.strictEqual(s1, 'not_found')

    // correct code once
    const s2 = await otpValidateWithStatus({ contact: 'x@y.com', otp: '999999' }, new Date('2020-01-01T00:00:10Z'), 1800)
    assert.strictEqual(s2, 'ok')

    // second attempt should be not_found
    const s3 = await otpValidateWithStatus({ contact: 'x@y.com', otp: '999999' }, new Date('2020-01-01T00:00:20Z'), 1800)
    assert.strictEqual(s3, 'not_found')
  })

  it('otpValidateWithStatus returns not_found when delete changes=0 (simulated race)', async () => {
    // Customize fake to make DELETE return changes=0
    let { sqlite3, state } = makeFakeSqlite()
    const origDb = sqlite3.Database
    sqlite3.Database = function(path) {
      const db = new origDb(path)
      const origRun = db.run.bind(db)
      db.run = function(sql, params, cb) {
        if (typeof params === 'function') { cb = params; params = undefined }
        const sqlUp = String(sql).toUpperCase()
        if (sqlUp.startsWith('DELETE FROM OTP')) {
          cb && cb.call({ changes: 0 }, null)
          return
        }
        return origRun(sql, params, cb)
      }
      return db
    }
    const { otpCreate, otpValidateWithStatus } = proxyquire(MODULE_PATH, { sqlite3 })

    await otpCreate({ contact: 'r@s.com', otp: '123123', createdAt: new Date('2020-01-01T00:00:00Z') })
    const s = await otpValidateWithStatus({ contact: 'r@s.com', otp: '123123' }, new Date('2020-01-01T00:00:10Z'), 1800)
    assert.strictEqual(s, 'not_found')
    // Keep state referenced to avoid linter removing it as unused
    assert.ok(state)
  })
})
