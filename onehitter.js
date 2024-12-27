const {otpCreate, otpValidate} = require('./db/mongodb-functions.js')
const send = require('./sender.js')
const otpGenerator = require('otp-generator')
/**
 * onehitter does a couple of things.
 * creates an otp
 * sends an otp using amazon ses
 * validates an otp against the mongodb otps
 * makes an otp using otp-generator
 */
class OneHitter {
    create = async (client, otp) => {
        return await otpCreate(client, otp)
    }

    send = (to, otp) => {
        send(to, otp, process.env.OTP_URL, process.env.OTP_EXPIRY)
    }

    validate = async (client, otp) => {
        return await otpValidate(client, otp)
    }

    make = () => {
        return otpGenerator.generate(process.env.OTP_LENGTH, { 
            upperCaseAlphabets: process.env.OTP_LETTERS_UPPER === "true", 
            lowerCaseAlphabets: process.env.OTP_LETTERS_LOWER === "true", 
            digits: process.env.OTP_DIGITS === "true", 
            specialChars: process.env.OTP_SPECIAL_CHARS === "true" });
    }
}

module.exports = OneHitter