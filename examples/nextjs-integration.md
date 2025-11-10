# Next.js Integration Example

This example demonstrates integrating OneHitter with Next.js 14+ using API routes and React Server Actions.

## Setup

```bash
npm install onehitter mongodb
```

## Shared MongoDB Client

Create a singleton MongoDB client to reuse across requests:

```js
// lib/mongodb.js
import { MongoClient, ServerApiVersion } from 'mongodb'

let client
let clientPromise

if (!process.env.MONGO_CONNECTION) {
  throw new Error('Add MONGO_CONNECTION to .env.local')
}

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable to preserve the client across hot reloads
  if (!global._mongoClientPromise) {
    client = new MongoClient(process.env.MONGO_CONNECTION, {
      serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
    })
    global._mongoClientPromise = client.connect()
  }
  clientPromise = global._mongoClientPromise
} else {
  // In production mode, create a new client
  client = new MongoClient(process.env.MONGO_CONNECTION, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
  })
  clientPromise = client.connect()
}

export default clientPromise
```

## API Route: Request Code

```js
// app/api/auth/request-code/route.js
import { NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import OneHitter from 'onehitter'

const one = new OneHitter()

export async function POST(request) {
  try {
    const { email } = await request.json()
    
    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Valid email required' },
        { status: 400 }
      )
    }
    
    const client = await clientPromise
    const otp = one.make()
    
    await one.create(client, {
      contact: email,
      otp,
      createdAt: new Date()
    })
    
    await one.send(email, otp)
    
    return NextResponse.json({
      success: true,
      message: 'Verification code sent'
    })
    
  } catch (error) {
    console.error('Request code error:', error)
    return NextResponse.json(
      { error: 'Failed to send code' },
      { status: 500 }
    )
  }
}
```

## API Route: Verify Code

```js
// app/api/auth/verify-code/route.js
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import clientPromise from '@/lib/mongodb'
import OneHitter from 'onehitter'

const one = new OneHitter()

export async function POST(request) {
  try {
    const { email, code } = await request.json()
    
    if (!email || !code) {
      return NextResponse.json(
        { error: 'Email and code required' },
        { status: 400 }
      )
    }
    
    const client = await clientPromise
    const status = await one.validateStatus(client, {
      contact: email,
      otp: code
    })
    
    if (status === 'ok') {
      // Set session cookie (in production use iron-session, next-auth, etc.)
      cookies().set('user-email', email, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 // 24 hours
      })
      
      return NextResponse.json({
        success: true,
        message: 'Verified successfully'
      })
    }
    
    // Handle failure cases
    const errorMessages = {
      not_found: 'Invalid verification code',
      expired: 'Code expired. Request a new one.',
      blocked: 'Too many attempts. Try again later.'
    }
    
    return NextResponse.json(
      {
        success: false,
        error: errorMessages[status] || 'Verification failed',
        status
      },
      { status: status === 'blocked' ? 429 : 401 }
    )
    
  } catch (error) {
    console.error('Verify code error:', error)
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 500 }
    )
  }
}
```

## React Component (Client)

```jsx
// app/auth/login/page.js
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState('email') // 'email' or 'code'
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleRequestCode = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    
    try {
      const response = await fetch('/api/auth/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setStep('code')
      } else {
        setError(data.error)
      }
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    
    try {
      const response = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code })
      })
      
      const data = await response.json()
      
      if (data.success) {
        router.push('/dashboard')
      } else {
        setError(data.error)
        
        // Auto-show resend button for expired codes
        if (data.status === 'expired') {
          setStep('email')
        }
      }
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <h2 className="text-3xl font-bold text-center">Sign In</h2>
        
        {error && (
          <div className="bg-red-50 text-red-800 p-3 rounded">
            {error}
          </div>
        )}
        
        {step === 'email' ? (
          <form onSubmit={handleRequestCode} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="you@example.com"
              />
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send Verification Code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Verification Code
              </label>
              <p className="text-sm text-gray-600 mb-2">
                Check your email ({email}) for the code
              </p>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-center text-2xl tracking-wider"
                placeholder="123456"
                maxLength={10}
              />
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify Code'}
            </button>
            
            <button
              type="button"
              onClick={() => setStep('email')}
              className="w-full py-2 px-4 text-blue-600 hover:underline"
            >
              Use different email
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
```

## Server Actions Alternative (Next.js 14+)

Instead of API routes, you can use Server Actions:

```js
// app/auth/actions.js
'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import clientPromise from '@/lib/mongodb'
import OneHitter from 'onehitter'

const one = new OneHitter()

export async function requestCode(email) {
  if (!email || !email.includes('@')) {
    return { error: 'Valid email required' }
  }
  
  try {
    const client = await clientPromise
    const otp = one.make()
    
    await one.create(client, {
      contact: email,
      otp,
      createdAt: new Date()
    })
    
    await one.send(email, otp)
    
    return { success: true }
  } catch (error) {
    console.error('Request code error:', error)
    return { error: 'Failed to send code' }
  }
}

export async function verifyCode(email, code) {
  if (!email || !code) {
    return { error: 'Email and code required' }
  }
  
  try {
    const client = await clientPromise
    const status = await one.validateStatus(client, {
      contact: email,
      otp: code
    })
    
    if (status === 'ok') {
      cookies().set('user-email', email, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24
      })
      
      redirect('/dashboard')
    }
    
    const errorMessages = {
      not_found: 'Invalid verification code',
      expired: 'Code expired. Request a new one.',
      blocked: 'Too many attempts. Try again later.'
    }
    
    return {
      error: errorMessages[status] || 'Verification failed',
      status
    }
    
  } catch (error) {
    console.error('Verify code error:', error)
    return { error: 'Verification failed' }
  }
}
```

## Protected Route Example

```jsx
// app/dashboard/page.js
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default function DashboardPage() {
  const userEmail = cookies().get('user-email')?.value
  
  if (!userEmail) {
    redirect('/auth/login')
  }
  
  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome, {userEmail}!</p>
    </div>
  )
}
```

## Environment Variables

Create `.env.local`:

```env
MONGO_CONNECTION=mongodb+srv://...
MONGO_DATABASE=myapp
MONGO_COLLECTION=otps

OTP_MESSAGE_FROM=noreply@example.com
OTP_MESSAGE_SUBJECT=Your verification code
OTP_URL=https://example.com/auth/verify
OTP_EXPIRY=1800

OTP_LENGTH=6
OTP_DIGITS=true
OTP_LETTERS_UPPER=false
OTP_LETTERS_LOWER=false
OTP_SPECIAL_CHARS=false
```

## Production Notes

- Use a proper session library like [iron-session](https://github.com/vvo/iron-session) or [next-auth](https://next-auth.js.org/)
- Implement CSRF protection
- Add rate limiting at the edge (Vercel Edge Config, Upstash, etc.)
- Monitor authentication attempts and block suspicious activity
