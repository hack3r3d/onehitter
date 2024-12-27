const nodemailer = require("nodemailer")
const aws = require("@aws-sdk/client-ses")
const { defaultProvider } = require("@aws-sdk/credential-provider-node")
const send = (to, otp, url, expiry) => {
    const ses = new aws.SES({
        apiVersion: "2010-12-01",
        region: "us-east-1",
        defaultProvider,
      })
      
      const transporter = nodemailer.createTransport({
        SES: { ses, aws },
      })
      
      transporter.sendMail(
        {
          from: process.env.OTP_MESSAGE_FROM,
          to: to,
          subject: process.env.OTP_MESSAGE_SUBJECT,
          text: `This is your one-time password to access ${url}

${otp}

Once used, this one-time password can not be used again. That's why it's called one-time password. This password also expires in ${expiry/60} minutes.`
        },
        (err) => {
          if (err) {
            throw new Error(err)
          }
        }
      )
}

module.exports = send
