const { MongoClient, ServerApiVersion } = require('mongodb')
const uri = process.env.MONGO_CONNECTION
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
})

module.exports = client