# Email setup (AWS SES) and templates

OneHitter sends OTP emails using Nodemailer with AWS SES (SDK v3).

## Prerequisites
- Verify a sender address (or domain) in SES
- If your SES account is in the sandbox, verify recipients or request production access
- Provide AWS credentials via the default provider chain (env vars or profile)

Minimal env:
```env
SES_REGION=us-east-1
OTP_MESSAGE_FROM=noreply@example.com
OTP_MESSAGE_SUBJECT=Your verification code
OTP_URL=https://example.com/verify
OTP_EXPIRY=1800
```

## Authenticating to AWS
Use either environment variables or an AWS CLI profile (SSO or access keys). See AWS docs for details. The SDK picks credentials automatically.

Required IAM permissions (minimum):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["ses:SendEmail", "ses:SendRawEmail"], "Resource": "*" }
  ]
}
```

## Customizing the message
You can customize subject/body/from or supply HTML via the `message` option when constructing `OneHitter`.

Examples:
```js
const one = new OneHitter({
  message: {
    from: 'MyApp <noreply@myapp.com>',
    subject: ({ minutesText }) => `Your code (${minutesText})`,
    text: ({ otp, url, minutesText }) => `Code: ${otp}\nUse within ${minutesText} at ${url}`,
  },
})
```

Or template function:
```js
const one = new OneHitter({
  message: ({ otp, url }) => ({ subject: 'Your login code', text: `Code: ${otp} for ${url}` }),
})
```

Context passed to functions:
- `to`, `otp`, `url`, `expirySeconds`, `minutesText`

If you omit fields, defaults are taken from env (subject/from) and a default text body.