const _ = require("lodash")

const otpCreate = async (client, otp) => {
  const database = client.db(process.env.MONGO_DATABASE)
  const cursor = database.collection(process.env.MONGO_COLLECTION)
  if (!otp.createdAt) {
    otp.createdAt = new Date()
  }
  if (!otp._id) {
    return await cursor.insertOne(otp)
  }
}

const otpValidate = async (client, otp) => {
  const database = client.db(process.env.MONGO_DATABASE)
  const cursor = database.collection(process.env.MONGO_COLLECTION)
  const foundOtp = await cursor.findOne(otp)
  if (foundOtp) {
    await cursor.deleteOne(otp)
    return true
  }
  return false
}

module.exports = {
  otpCreate,
  otpValidate
}
