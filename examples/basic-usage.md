# Basic Usage Example

This example demonstrates a complete one-time password flow from generation to validation.

## Setup

```bash
npm install onehitter mongodb
```

Create a `.env` file with your configuration:

```env
MONGO_CONNECTION=mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority
MONGO_DATABASE=myapp
MONGO_COLLECTION=otps

OTP_MESSAGE_FROM=noreply@example.com
OTP_MESSAGE_SUBJECT=Your verification code
OTP_URL=https://example.com/verify
OTP_EXPIRY=1800

OTP_LENGTH=6    # values greater than 64 are capped at 64 characters
OTP_LETTERS_UPPER=false
OTP_LETTERS_LOWER=false
OTP_DIGITS=true
OTP_SPECIAL_CHARS=false
```

## Complete Flow

```js
import { MongoClient, ServerApiVersion } from 'mongodb'
import OneHitter from 'onehitter'

// 1. Setup MongoDB client
const client = new MongoClient(process.env.MONGO_CONNECTION, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
})

async function otpFlow() {
  try {
    await client.connect()
    const one = new OneHitter()
    
    // 2. User requests verification
    const userEmail = 'user@example.com'
    
    // 3. Generate OTP
    const otp = one.make()
    console.log('Generated OTP:', otp)
    
    // 4. Store OTP in database
    await one.create(client, { 
      contact: userEmail, 
      otp, 
      createdAt: new Date() 
    })
    
    // 5. Send OTP to user via email
    await one.send(userEmail, otp)
    console.log('OTP sent to:', userEmail)
    
    // 6. User submits OTP (simulate user input)
    const userSubmittedOtp = otp // In reality, this comes from user input
    
    // 7. Validate OTP (simple boolean check)
    const isValid = await one.validate(client, { 
      contact: userEmail, 
      otp: userSubmittedOtp 
    })
    
    if (isValid) {
      console.log('✓ OTP validated successfully!')
      // Proceed with user authentication/verification
    } else {
      console.log('✗ Invalid OTP')
      // Show error to user
    }
    
  } finally {
    await client.close()
  }
}

otpFlow()
```

## Important Notes

- **Single-use**: Each OTP can only be validated once. After validation, it's automatically deleted.
- **TTL Index**: Set up a MongoDB TTL index on `createdAt` to automatically expire old OTPs:
  ```bash
  npm run db:ensure-ttl
  ```
- **Connection management**: Your application is responsible for managing the MongoClient lifecycle.
- **AWS SES**: Ensure your AWS credentials are configured and your sender email is verified in SES.
