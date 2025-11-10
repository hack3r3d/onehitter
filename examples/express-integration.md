# Express.js Integration Example

This example shows how to integrate OneHitter into an Express.js application for user authentication.

## Setup

```bash
npm install express onehitter mongodb
```

## Complete Implementation

```js
import express from 'express'
import { MongoClient, ServerApiVersion } from 'mongodb'
import OneHitter from 'onehitter'

const app = express()
app.use(express.json())

// Setup MongoDB client (reuse across requests)
const client = new MongoClient(process.env.MONGO_CONNECTION, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
})

// Connect once at startup
await client.connect()
console.log('✓ Connected to MongoDB')

// Initialize OneHitter instance
const one = new OneHitter()

// Temporary store for demo - in production use sessions or JWT
const pendingVerifications = new Map()

// POST /auth/request-code
// Request a verification code
app.post('/auth/request-code', async (req, res) => {
  try {
    const { email } = req.body
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' })
    }
    
    // Generate OTP
    const otp = one.make()
    
    // Store in database
    await one.create(client, {
      contact: email,
      otp,
      createdAt: new Date()
    })
    
    // Send email
    await one.send(email, otp)
    
    // Track pending verification (for demo purposes)
    pendingVerifications.set(email, { requestedAt: Date.now() })
    
    res.json({ 
      success: true, 
      message: 'Verification code sent to your email' 
    })
    
  } catch (error) {
    console.error('Error requesting code:', error)
    res.status(500).json({ error: 'Failed to send verification code' })
  }
})

// POST /auth/verify-code
// Verify the submitted code
app.post('/auth/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body
    
    if (!email || !code) {
      return res.status(400).json({ error: 'Email and code required' })
    }
    
    // Validate OTP with detailed status
    const status = await one.validateStatus(client, {
      contact: email,
      otp: code
    })
    
    switch (status) {
      case 'ok':
        // Success! Create session or JWT here
        pendingVerifications.delete(email)
        
        return res.json({
          success: true,
          message: 'Verified successfully',
          // In production, set a session cookie or return JWT
          user: { email }
        })
        
      case 'not_found':
        return res.status(401).json({
          success: false,
          error: 'Invalid verification code'
        })
        
      case 'expired':
        return res.status(401).json({
          success: false,
          error: 'Verification code expired',
          shouldResend: true
        })
        
      case 'blocked':
        return res.status(429).json({
          success: false,
          error: 'Too many attempts. Please try again later',
          rateLimited: true
        })
        
      default:
        return res.status(500).json({ error: 'Validation failed' })
    }
    
  } catch (error) {
    console.error('Error verifying code:', error)
    res.status(500).json({ error: 'Verification failed' })
  }
})

// GET /auth/status
// Check if user has pending verification
app.get('/auth/status/:email', (req, res) => {
  const { email } = req.params
  const pending = pendingVerifications.get(email)
  
  if (pending) {
    res.json({ 
      hasPending: true, 
      requestedAt: pending.requestedAt 
    })
  } else {
    res.json({ hasPending: false })
  }
})

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Closing MongoDB connection...')
  await client.close()
  process.exit(0)
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
```

## Frontend Integration

Example client-side code for the above API:

```js
// Request verification code
async function requestCode(email) {
  const response = await fetch('/auth/request-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  })
  
  const data = await response.json()
  
  if (data.success) {
    console.log('Code sent! Check your email.')
    showCodeInputForm()
  } else {
    console.error(data.error)
  }
}

// Verify code
async function verifyCode(email, code) {
  const response = await fetch('/auth/verify-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code })
  })
  
  const data = await response.json()
  
  if (data.success) {
    console.log('Verified! Welcome.')
    // Store session/token and redirect
    localStorage.setItem('user', JSON.stringify(data.user))
    window.location.href = '/dashboard'
  } else if (data.shouldResend) {
    showResendButton()
  } else if (data.rateLimited) {
    showRateLimitMessage()
  } else {
    showError(data.error)
  }
}
```

## Production Considerations

### 1. Session Management
Instead of the `pendingVerifications` Map, use proper session management:

```js
import session from 'express-session'
import MongoStore from 'connect-mongo'

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ 
    client,
    dbName: process.env.MONGO_DATABASE 
  }),
  cookie: { 
    secure: true, // HTTPS only
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 // 24 hours
  }
}))

// After successful verification
req.session.user = { email }
```

### 2. Rate Limiting
Add express-rate-limit to prevent abuse:

```js
import rateLimit from 'express-rate-limit'

const requestCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 requests per window per IP
  message: 'Too many requests, please try again later'
})

app.post('/auth/request-code', requestCodeLimiter, async (req, res) => {
  // ... handler
})
```

### 3. Input Validation
Use a validation library like `joi` or `zod`:

```js
import { z } from 'zod'

const requestSchema = z.object({
  email: z.string().email()
})

const verifySchema = z.object({
  email: z.string().email(),
  code: z.string().min(6).max(10)
})

// In handler
const { email } = requestSchema.parse(req.body)
```

### 4. Logging and Monitoring
Log security-relevant events:

```js
import winston from 'winston'

const logger = winston.createLogger({
  level: 'info',
  transports: [new winston.transports.Console()]
})

// Log failed attempts
if (status === 'blocked') {
  logger.warn('Rate limit triggered', { email, ip: req.ip })
}
```

### 5. HTTPS Only
Always use HTTPS in production to protect OTP transmission:

```js
if (process.env.NODE_ENV === 'production' && !req.secure) {
  return res.redirect('https://' + req.headers.host + req.url)
}
```
