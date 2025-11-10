# Validation Status Example

This example shows how to use `validateStatus()` instead of `validate()` to get detailed information about why validation failed.

## Why use validateStatus?

The basic `validate()` method returns a boolean (true/false), but `validateStatus()` gives you four possible outcomes:
- `'ok'` - OTP validated successfully
- `'not_found'` - OTP doesn't exist (wrong code, already used, or removed by TTL)
- `'expired'` - OTP exists but is past the expiry time
- `'blocked'` - Rate limiter blocked the validation attempt

## Usage Example

```js
import { MongoClient, ServerApiVersion } from 'mongodb'
import OneHitter from 'onehitter'

const client = new MongoClient(process.env.MONGO_CONNECTION, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
})

async function validateWithStatus(email, userOtp) {
  await client.connect()
  
  try {
    const one = new OneHitter()
    
    const status = await one.validateStatus(client, { 
      contact: email, 
      otp: userOtp 
    })
    
    switch (status) {
      case 'ok':
        console.log('✓ Success! User verified.')
        // Grant access, create session, etc.
        return { success: true }
        
      case 'not_found':
        console.log('✗ Invalid or already used code.')
        // Show generic error to prevent enumeration attacks
        return { 
          success: false, 
          error: 'Invalid verification code. Please check and try again.' 
        }
        
      case 'expired':
        console.log('✗ Code expired.')
        // Prompt user to request a new code
        return { 
          success: false, 
          error: 'Your verification code has expired. Please request a new one.',
          shouldResend: true
        }
        
      case 'blocked':
        console.log('✗ Too many attempts.')
        // Tell user to slow down
        return { 
          success: false, 
          error: 'Too many verification attempts. Please try again later.',
          rateLimited: true
        }
        
      default:
        return { success: false, error: 'Unknown error' }
    }
    
  } finally {
    await client.close()
  }
}

// Example usage
validateWithStatus('user@example.com', '123456')
  .then(result => {
    if (result.success) {
      console.log('User authenticated!')
    } else if (result.shouldResend) {
      console.log('Showing resend button to user...')
    } else if (result.rateLimited) {
      console.log('Showing rate limit message...')
    }
  })
```

## User Experience Benefits

Using `validateStatus()` allows you to provide specific, helpful feedback:

| Status | User Message | Action |
|--------|-------------|--------|
| `ok` | "Verified! Welcome back." | Grant access |
| `not_found` | "Invalid code. Please check and try again." | Show input field |
| `expired` | "Code expired. Click to request a new one." | Show resend button |
| `blocked` | "Too many attempts. Try again in 5 minutes." | Disable form temporarily |

## Security Considerations

- For `not_found`, don't reveal whether the code was wrong vs. already used to prevent timing attacks
- Consider combining `not_found` and `expired` messages if you want to be even more conservative
- Log suspicious patterns (many `blocked` statuses from same IP) for monitoring
