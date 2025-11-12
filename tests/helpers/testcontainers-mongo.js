/*
  Spins up a MongoDB container for integration tests using Testcontainers.
  Sets MONGO_CONNECTION, MONGO_DATABASE, MONGO_COLLECTION before tests load.
*/
const { MongoClient, ServerApiVersion } = require('mongodb')

let container

before(async function () {
  this.timeout(120_000)

  // Load testcontainers (supports both CJS require and ESM import)
  let tc
  try {
    tc = require('testcontainers')
  } catch (_) {
    tc = await import('testcontainers')
  }
  const { GenericContainer } = tc

  container = await new GenericContainer('mongo:7')
    .withExposedPorts(27017)
    .start()

  const host = container.getHost()
  const port = container.getMappedPort(27017)
  const uri = `mongodb://${host}:${port}`

  if (!process.env.OTP_MONGO_CONNECTION) process.env.OTP_MONGO_CONNECTION = uri
  if (!process.env.OTP_MONGO_DATABASE) process.env.OTP_MONGO_DATABASE = 'onehitter-test'
  if (!process.env.OTP_MONGO_COLLECTION) process.env.OTP_MONGO_COLLECTION = 'otp'

  // Wait for Mongo to be ready by pinging it
  const client = new MongoClient(process.env.MONGO_CONNECTION, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
  })

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  for (let i = 0; i < 30; i++) {
    try {
      await client.connect()
      await client.db(process.env.MONGO_DATABASE).command({ ping: 1 })
      await client.close()
      break
    } catch (_) {
      try { await client.close() } catch {}
      await sleep(1000)
    }
  }
})

after(async function () {
  this.timeout(60_000)
  if (container) {
    await container.stop()
  }
})
