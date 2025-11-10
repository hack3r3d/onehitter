# Custom Email Template Example

This example demonstrates how to customize the OTP email content beyond the default template.

## Default Behavior

By default, OneHitter uses env variables for email content:
- `OTP_MESSAGE_FROM` - sender email
- `OTP_MESSAGE_SUBJECT` - email subject
- Plain text body with URL, OTP, and expiry time

## Option 1: Configuration Object

Customize individual fields with static values or dynamic functions:

```js
import OneHitter from 'onehitter'

const one = new OneHitter({
  message: {
    from: 'noreply@example.com',
    
    // Static subject
    subject: 'Your verification code',
    
    // Or dynamic subject using context
    // subject: ({ minutesText }) => `Your code (expires in ${minutesText})`,
    
    // Plain text body
    text: ({ otp, url, minutesText }) => 
      `Your verification code is: ${otp}\n\n` +
      `Use this code within ${minutesText} at ${url}\n\n` +
      `If you didn't request this, please ignore this email.`,
  }
})

await one.send('user@example.com', '123456')
```

## Option 2: HTML Email

Provide HTML instead of plain text for a richer experience:

```js
const one = new OneHitter({
  message: {
    from: 'noreply@example.com',
    subject: 'Your verification code',
    
    html: ({ otp, url, minutesText }) => `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .code-box { 
              background: #f4f4f4; 
              border: 2px solid #007bff; 
              border-radius: 8px;
              padding: 20px; 
              text-align: center; 
              margin: 20px 0; 
            }
            .code { 
              font-size: 32px; 
              font-weight: bold; 
              color: #007bff; 
              letter-spacing: 4px;
            }
            .button {
              display: inline-block;
              padding: 12px 24px;
              background: #007bff;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              margin: 20px 0;
            }
            .footer { 
              margin-top: 30px; 
              padding-top: 20px; 
              border-top: 1px solid #ddd; 
              font-size: 12px; 
              color: #666; 
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Your Verification Code</h2>
            <p>Use this code to verify your account:</p>
            
            <div class="code-box">
              <div class="code">${otp}</div>
            </div>
            
            <p>This code will expire in <strong>${minutesText}</strong>.</p>
            
            <p style="text-align: center;">
              <a href="${url}" class="button">Verify Now</a>
            </p>
            
            <div class="footer">
              <p>If you didn't request this code, please ignore this email.</p>
              <p>This is an automated message, please do not reply.</p>
            </div>
          </div>
        </body>
      </html>
    `
  }
})
```

## Option 3: Template Function

Return a complete message configuration dynamically:

```js
const one = new OneHitter({
  message: ({ otp, url, minutesText, to, expirySeconds }) => {
    // You can use any logic here
    const isInternalUser = to.endsWith('@example.com')
    
    return {
      subject: isInternalUser 
        ? `[INTERNAL] Your code: ${otp}` 
        : 'Your verification code',
        
      text: isInternalUser
        ? `Quick access code: ${otp}\nExpires: ${minutesText}\nDebug: ${expirySeconds}s`
        : `Your code: ${otp}\n\nUse within ${minutesText} at ${url}`,
    }
  }
})
```

## Message Context Object

All functions receive this context:

```ts
{
  to: string           // Recipient email address
  otp: string          // Generated OTP code
  url: string          // Value of OTP_URL env variable
  expirySeconds: number // Expiry in seconds (from OTP_EXPIRY or send() argument)
  minutesText: string  // Human-friendly string like "1 minute" or "30 minutes"
}
```

## Brand Example

Complete branded email template:

```js
const one = new OneHitter({
  message: {
    from: 'MyApp <noreply@myapp.com>',
    subject: ({ minutesText }) => `Your MyApp verification code (${minutesText})`,
    
    html: ({ otp, url, minutesText }) => `
      <!DOCTYPE html>
      <html>
        <body style="margin: 0; padding: 0; background: #f5f5f5;">
          <div style="max-width: 600px; margin: 40px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">MyApp</h1>
            </div>
            
            <!-- Content -->
            <div style="padding: 40px 30px;">
              <h2 style="color: #333; margin-top: 0;">Verify Your Account</h2>
              <p style="color: #666; font-size: 16px; line-height: 1.6;">
                Enter this verification code in MyApp:
              </p>
              
              <div style="background: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 30px 0;">
                <div style="font-size: 36px; font-weight: bold; color: #667eea; text-align: center; letter-spacing: 8px; font-family: monospace;">
                  ${otp}
                </div>
              </div>
              
              <p style="color: #666; font-size: 14px;">
                This code expires in <strong>${minutesText}</strong>.
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${url}" style="display: inline-block; padding: 14px 32px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                  Verify Now
                </a>
              </div>
            </div>
            
            <!-- Footer -->
            <div style="background: #f8f9fa; padding: 20px 30px; border-top: 1px solid #e9ecef;">
              <p style="margin: 0; color: #999; font-size: 12px; text-align: center;">
                If you didn't request this, you can safely ignore this email.
              </p>
            </div>
          </div>
        </body>
      </html>
    `
  }
})
```

## Fallback Behavior

- Any omitted fields use defaults from environment variables
- If you provide neither `text` nor `html`, a default text body is used
- Static strings work for any field, or use functions for dynamic content
