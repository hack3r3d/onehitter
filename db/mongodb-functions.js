const _ = require("lodash")
const { subMinutes, endOfHour, addMinutes } = require("date-fns")
const { ObjectId } = require("mongodb")
const client = require('./mongodb.js')

const otpSave = async (otp) => {
  await client.connect()
  const database = client.db(process.env.MONGO_DATABASE)
  const cursor = database.collection(process.env.MONGO_COLLECTION)
  if (!otp.createdAt) {
    otp.createdAt = new Date()
  }
  if (!otp._id) {
    return await cursor.insertOne(otp)
  }
}

module.exports = {
  otpSave
}
