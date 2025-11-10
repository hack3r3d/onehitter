# OneHitter
OneHitter is a simple auth system that uses a one-time password to authenticate a user. This isn't really even an auth system, it's just a rudimentary verification system. This isn't really secure, so don't use it as-if it is.

Here's how it works, and I'm sure people have experienced something similar. 

1. User wants to access application
2. Application requests user's email address from the user
3. Application generates a one-time password and sends it to the email the user provided
4. User checks their email, gets the one-time password and enters the one-time password in the application
5. The applications checks that the one-time password is valid for this email address, invalidates one-time pw because it can only be used once
6. If valid, great
7. If not, access denied

This isn't secure because it relies on email. Anyone with access to the email address, including admins, can view the one-time password and login with it. Email isn't secure, while most email communications these days are encrypted, you can't count on it. 

So don't use this for any application that's doing anything with critical user data.

## Getting Started 

By default this package uses MongoDB for storage and Amazon SES for message delivery.

As of v2, a database abstraction allows swapping the storage layer. The default is MongoDB; an experimental SQLite option is also available (useful for small apps or tests).

So to use this package, you will need to configure a database (MongoDB by default) and Amazon SES. 

I'm not going to go deep in how to configure MongoDB and Amazon SES. There are plenty of tutorials to help with that stuff. The Amazon SES documentation can be found [here](https://docs.aws.amazon.com/ses/latest/dg/send-email.html). 

To make your passwords expire automatically, you have to configure a TTL on your MongoDB collection. It's basically creating an index on a field that TTL will be tied to. For onehitter, you need to create an index on createdAt. MongoDB has a tutorial for how to configure an index with a TTL [here](https://www.mongodb.com/docs/manual/tutorial/expire-data/). The only difference between what you need to do here and what's in the tutorial, is use createdAt as the field to set the TTL on and set the `{ expireAfterSeconds: 1 }` to however many seconds you want your onetime passwords to live for. I use 1800, or 30 minutes. 

Whatever you decide to set the expiry to, you should update your .env OTP_EXPIRY to be the same value. This controls both the email message copy and the code-level expiry check. Note: actual document deletion is enforced by MongoDB via the TTL index; changing OTP_EXPIRY alone does not change the TTL index.

As I eluded to in the previous paragraph, you will need to create a .env file, or use some mechanism like AWS Secrets to provide onehitter with the configuration it needs to operate. You need the below values to be available via process.env

### Configuration Settings
#### MONGO_CONNECTION
This is the connection string used to connect to mongo. 

It will look something like this.
```
mongodb+srv://myspecialusername:myspecialpassword@cluster0.xefwer0q.mongodb.net/?retryWrites=true&w=majority
```

#### MONGO_COLLECTION
The Mongo Collection is just like it sounds, the collection in MongoDB where you plan on storing your onehitter data.

#### MONGO_DATABASE
The Mongo Database is where the collection lives. In MongoDB, a database can have many collections. So you can put your onehitter collection in your application database. 

#### OTP_MESSAGE_FROM
Message From is the email address that the onetime password email to the user is sent from. This has to be an email address from a domain that Amazon SES has validated.

#### OTP_MESSAGE_SUBJECT
This is the subject of the email to the user notifying them of their new onetime password.

#### OTP_URL
This is the url included in the onetime password email notification.
```
https://example.com
```

#### OTP_EXPIRY
This is how many seconds an onetime password is supposed to live. This is only for the email notification. To actually change the expiry, you have to recreate the index in MongoDB with the new expiry value.

#### OTP_LENGTH
This is the length of the onetime password - the number of characters.

#### OTP_LETTERS_UPPER
If true, use upper case letters in onetime password.

#### OTP_LETTERS_LOWER
If true, use lower case letters in onetime password.

#### OTP_DIGITS
If true, use digits in onetime password.

#### OTP_SPECIAL_CHARS
If true, use special characters in onetime password.

### OTP generation (OneHitter.make())
- Length resolution: uses `OTP_LENGTH` when it is a positive integer; otherwise defaults to 6.
- Character classes: controlled by `OTP_LETTERS_UPPER`, `OTP_LETTERS_LOWER`, `OTP_DIGITS`, `OTP_SPECIAL_CHARS`.
- Safety default: if all four flags are false, generation defaults to digits-only.

Example env for a 10-character, lowercase-only code:
```env
OTP_LENGTH=10
OTP_LETTERS_UPPER=false
OTP_LETTERS_LOWER=true
OTP_DIGITS=false
OTP_SPECIAL_CHARS=false
```

Example usage:
```js
const one = new OneHitter()
const code = one.make() // string of configured length and classes
```

## Sending emails with AWS SES (setup required)
This library uses AWS SDK v3 and Nodemailer’s SES transport to send emails. To run the email test or to send emails in your app, you must have the AWS SDK installed (comes from `npm install`) and your local environment authenticated to AWS with permissions to use SES.

### 1) Install dependencies (includes AWS SDK v3 for SES)
- Runtime deps are already listed in `package.json`:
  - `@aws-sdk/client-ses`, `nodemailer`
- Install them via:

```bash
npm install
```

### 2) Install the AWS CLI (for local auth)
- macOS (Homebrew):
```bash
brew install awscli
```
- Verify:
```bash
aws --version
```

### 3) Authenticate to AWS
Pick one method. The AWS SDK for JavaScript (v3) uses the default credential provider chain, so any of these will work locally.

- Option A — Access keys (programmatic access) [recommended for CI]
  - Create an IAM user and access keys:
    1. In AWS Console: IAM → Users → Create user. Name it something like `onehitter-ci`.
    2. After the user is created, open the user → Security credentials → Create access key → choose the "Command Line Interface (CLI)" use-case.
    3. Copy the Access key ID and Secret access key now; you won’t be able to view the secret again later.
    4. Attach permissions to the user (or via a group) so it can send with SES. For quick start you can attach `AmazonSESFullAccess`. For least privilege, use a policy that allows `ses:SendEmail` and `ses:SendRawEmail` (see policy example below).
  - Configure an AWS CLI profile with the keys:
```bash
aws configure --profile onehitter-ses
# AWS Access Key ID: <paste from step 3>
# AWS Secret Access Key: <paste from step 3>
# Default region name: us-east-1
# Default output format: json
```
  - Alternatively, set environment variables (useful for ephemeral shells/CI):
```bash
export AWS_ACCESS_KEY_ID=AKIA...           # your access key id
export AWS_SECRET_ACCESS_KEY=...           # your secret
export AWS_REGION=us-east-1
# If using temporary creds from STS, also export:
# export AWS_SESSION_TOKEN=...
```

- Option B — AWS IAM Identity Center (SSO) [good for local dev]
  - Prerequisites:
    - Your organization has IAM Identity Center (formerly AWS SSO) set up.
    - You have a permission set granting SES send permissions (or broader as needed).
  - Configure an SSO profile:
```bash
aws configure sso --profile onehitter-ses
# Provide SSO start URL and SSO region
# Select your AWS account and a permission set
# Set default region to us-east-1
```
  - Log in (and re-login when credentials expire):
```bash
aws sso login --profile onehitter-ses
```

- Verify credentials:
```bash
AWS_PROFILE=onehitter-ses aws sts get-caller-identity
```
This should return your AWS account and ARN. If you see "Could not load credentials from any providers", ensure the profile exists, you are logged in (for SSO), or that the environment variables are exported in the current shell.

- Use the profile when running commands/tests (recommended):
```bash
export AWS_PROFILE=onehitter-ses
```

### 4) Configure AWS SES
- Region: By default the SES client uses `us-east-1`. Override with `SES_REGION` if needed. Ensure your SES identities exist in the chosen region.
- Verify identities: In SES, verify the From address (or entire domain). In the SES sandbox, you must also verify any recipient addresses (including the one used by `OTP_MESSAGE_TEST_TO`).
- Sandbox vs production: If your SES account is in the sandbox, request production access to send to arbitrary recipients.
- Minimum IAM permissions for the credential you use:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail"
      ],
      "Resource": "*"
    }
  ]
}
```

### 5) Environment variables for email
Ensure the following are set (e.g., in `.env.test` for tests or `.env` for app use):
- `SES_REGION` — AWS SES region (default `us-east-1`)
- `OTP_MESSAGE_FROM` — Verified SES sender address
- `OTP_MESSAGE_SUBJECT` — Subject line
- `OTP_URL` — URL included in the email body
- `OTP_EXPIRY` — Seconds until expiry (affects message copy and code-level expiry check)
- `OTP_MESSAGE_TEST_TO` — Recipient used by the email test (must be verified if SES is in sandbox)

### 5b) Customize email subject/body/template
You can customize the email content via the `message` option when constructing `OneHitter`.
Two styles are supported:

- Configuration object (you can provide static strings or functions of the message context):
```js
const one = new OneHitter({
  message: {
    from: 'no-reply@example.com',
    subject: ({ minutesText }) => `Your code (${minutesText})`,
    text: ({ otp, url, minutesText }) => `Code: ${otp}\nUse within ${minutesText} at ${url}`,
    // or provide HTML instead of text:
    // html: ({ otp, url, minutesText }) => `<p>Code: <b>${otp}</b>. Use within ${minutesText} at <a href="${url}">${url}</a></p>`,
  },
})
```

- Template function (returns overrides):
```js
const one = new OneHitter({
  message: ({ otp, url, minutesText }) => ({
    subject: 'Your login code',
    text: `Your code is ${otp}. Use within ${minutesText} at ${url}.`,
  }),
})
```

Message context object passed to functions:
- `to`: recipient address
- `otp`: generated OTP
- `url`: value of `OTP_URL`
- `expirySeconds`: resolved expiry in seconds (from argument to `send()` or `OTP_EXPIRY`, default 1800)
- `minutesText`: human-friendly minutes string, e.g. `"1 minute"` or `"30 minutes"`

Any fields you omit fall back to defaults: `from=OTP_MESSAGE_FROM`, `subject=OTP_MESSAGE_SUBJECT`, and a default `text` body mentioning the URL, OTP, and expiry.

### 6) Running tests

See also: `docs/RATE_LIMITING.md` for guidance on rate limiting hooks.
- Default (skips email-send):
```bash
npm test
```
- Run all tests (includes email-send):
```bash
npm run test:all
```
- Run only the email-send suite:
```bash
npm run test:send
```
- Run only the concurrency test:
```bash
npm run test:concurrency
```
- Run only the OTP generator tests for `make()`:
```bash
npm run build && mocha tests/make.js
```

### Ensure the TTL index exists on createdAt (MongoDB only)
Use the helper to create or update the TTL index to the value of `OTP_EXPIRY` (defaults to 1800 seconds if unset):
```bash
npm run db:ensure-ttl
```
This checks for an existing TTL index on `createdAt`; if missing it creates one, and if present with a different TTL it recreates it with the desired value.

## Database drivers: MongoDB (default) and SQLite (experimental)

Set the driver via env var:
- `DB_DRIVER` — `mongodb` (default) or `sqlite`
- When `DB_DRIVER=sqlite`, you can also set `SQLITE_PATH` to a file path (default is `:memory:`)

Driver differences:
- MongoDB: persistence via collection, single-use guarantee enforced atomically; recommended TTL index for cleanup.
- SQLite: persistence in a local database; single-use guarantee enforced by transaction; expiry is enforced at validation time (no background cleanup).

### MongoClient ownership (MongoDB driver)
This library does not create or export a global MongoClient. Your application is responsible for:
- constructing a MongoClient
- connecting and closing it
- passing it into OneHitter methods that touch the database (`create`, `validate`, `validateStatus`)

Benefits: clear lifecycle, easy testing, reuse a single client across your app, and better compatibility with serverless/SSR envs.

Example (MongoDB):
```js
// CommonJS
const { MongoClient, ServerApiVersion } = require('mongodb')
const OneHitter = require('onehitter').default
// ESM
// import { MongoClient, ServerApiVersion } from 'mongodb'
// import OneHitter from 'onehitter'

const client = new MongoClient(process.env.MONGO_CONNECTION, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
})
await client.connect()

const one = new OneHitter()
const otp = one.make()
await one.create(client, { contact: 'user@example.com', otp, createdAt: new Date() })
const ok = await one.validate(client, { contact: 'user@example.com', otp })

await client.close()
```

Example (SQLite):
```js
process.env.DB_DRIVER = 'sqlite'
process.env.SQLITE_PATH = './onehitter.sqlite' // optional; defaults to in-memory
const OneHitter = require('onehitter').default

const one = new OneHitter()
const otp = one.make()
await one.create({ contact: 'user@example.com', otp, createdAt: new Date() }) // no client required
const ok = await one.validate({ contact: 'user@example.com', otp })
```

## Validation semantics
There are two validation methods:
- MongoDB driver:
  - `validate(client, { contact, otp }) => boolean`
  - `validateStatus(client, { contact, otp }) => 'ok' | 'not_found' | 'expired' | 'blocked'`
- SQLite driver:
  - `validate({ contact, otp }) => boolean` (no client)
  - `validateStatus({ contact, otp }) => 'ok' | 'not_found' | 'expired' | 'blocked'`

Meanings:
- `ok`: a matching, unexpired OTP was found and consumed.
- `not_found`: no matching OTP exists (wrong OTP, already used, or removed by TTL).
- `expired`: a matching OTP existed but is past the configured expiry; it is consumed (deleted) and reported as expired.
- `blocked`: your configured `RateLimiter` decided to block the attempt.

Notes on expiry:
- Code-level expiry check compares the stored `createdAt` to `OTP_EXPIRY` (seconds). If the OTP is older than `OTP_EXPIRY`, `validateStatus` returns `expired`.
- MongoDB: also use a TTL index on `createdAt` for automatic cleanup; if the TTL removed the doc already you’ll see `not_found` instead of `expired`.
- SQLite: there is no background TTL deletion; cleanup relies on your application (optional) and the code-level expiry check at validation time.

Example:
```js
// CommonJS
const { MongoClient, ServerApiVersion } = require('mongodb')
const OneHitter = require('onehitter').default
// ESM
// import { MongoClient, ServerApiVersion } from 'mongodb'
// import OneHitter from 'onehitter'

const client = new MongoClient(process.env.MONGO_CONNECTION, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
})
await client.connect()

const one = new OneHitter()
const otp = one.make()
await one.create(client, { contact: 'user@example.com', otp, createdAt: new Date() })

const status = await one.validateStatus(client, { contact: 'user@example.com', otp })
if (status === 'ok') {
  // proceed
} else if (status === 'expired') {
  // ask user to request a new OTP
} else if (status === 'blocked') {
  // tell user to slow down
} else {
  // not_found — wrong/already used/TTL-removed
}

await client.close()
```
