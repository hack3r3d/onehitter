const {saveOtp} = require('./db/mongodb-functions.js')
/**
 * onehitter does a couple of things.
 * 
 * gather an email address
 * generate a otp
 * save the otp
 * send the otp
 * validate the otp
 */
class OneHitter {
    create = (client) => {
        console.log('create')
    }

    save = async (otp) => {
        saveOtp(otp)
        console.log('save')
    }

    send = (otp, client) => {
        console.log('send')
    }

    validateOtp = (otp, client) => {
        console.log('validate')
    }
}

module.exports = OneHitter