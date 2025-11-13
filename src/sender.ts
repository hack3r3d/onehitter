import nodemailer from 'nodemailer'
import { OTP_MESSAGE_FROM, OTP_MESSAGE_SUBJECT, OTP_SES_REGION, OTP_EXPIRY } from './config'

export interface SendOptions {
  region?: string
  transporter?: nodemailer.Transporter
}

export interface MessageContext {
  to: string
  otp: string
  url: string
  expirySeconds: number
  minutesText: string
}

export type MessageTemplate = (ctx: MessageContext) => Partial<{ subject: string; text: string; html: string; from: string }>

export interface MessageConfig {
  subject?: string | ((ctx: MessageContext) => string)
  text?: string | ((ctx: MessageContext) => string)
  html?: string | ((ctx: MessageContext) => string)
  from?: string
  template?: MessageTemplate
}

/**
 * @function formatExpiry
 * @description
 * Safely resolves and formats the OTP expiration time in seconds and minutes.
 * This function ensures a valid, positive expiration time is always returned
 * by checking multiple configuration sources in a specific order:
 *
 * **Configuration Priority:**
 * 1. **Argument:** The `expiry` value passed directly to the function.
 * 2. **Global Constant:** The global constant `OTP_EXPIRY`.
 * 3. **Hardcoded Default:** A default of **1800 seconds (30 minutes)** if both of the
 * above sources are invalid or missing.
 *
 * It also calculates a user-friendly text string for use in email messages.
 *
 * @param {number | string} [expiry] - The optional raw expiration time provided by the caller (in seconds).
 * @returns {{ seconds: number; minutes: number; text: string }} An object containing the expiration time
 * in raw seconds, rounded minutes, and a human-readable text string (e.g., "30 minutes").
 */
function formatExpiry(expiry?: number | string): { seconds: number; minutes: number; text: string } {
  const secFromArg = Number(expiry)
  const envExpiryNum = Number(OTP_EXPIRY)
  const seconds: number = (Number.isFinite(secFromArg) && secFromArg > 0)
    ? secFromArg
    : ((Number.isFinite(envExpiryNum) && envExpiryNum > 0) ? envExpiryNum : 1800) // default 30m

  const minutes: number = Math.max(1, Math.round(seconds / 60))
  const text: string = minutes === 1 ? '1 minute' : `${minutes} minutes`
  return { seconds, minutes, text }
}

/**
 * @function resolveMessage
 * @description
 * Generates and resolves the final email components (subject, text, html, from address)
 * for the OTP email. This function prioritizes custom templates and configurations
 * over global default constants.
 *
 * **Configuration Priority:**
 * 1. **Custom Function:** If `cfgOrFn` is a function (`MessageTemplate`), it is called
 * with the full message context (`ctx`) to provide an entire override object.
 * 2. **Custom Config/Template:** If `cfgOrFn` is a configuration object (`MessageConfig`),
 * it applies any custom subject, text, HTML, or `from` address. It also supports a
 * custom `template` function within the config for body generation.
 * 3. **Global Constants/Defaults:** If no overrides are provided, it falls back to
 * global constants (`OTP_MESSAGE_SUBJECT`, `OTP_MESSAGE_FROM`) and provides a
 * robust default plaintext body.
 *
 * @param {string} to - The recipient's email address.
 * @param {string} otp - The generated OTP code.
 * @param {string} url - The base URL/application link.
 * @param {number | string} [expiry] - The raw OTP expiration time.
 * @param {MessageConfig | MessageTemplate} [cfgOrFn] - Optional custom message configuration object or a template function.
 * @returns {{ subject: string; text: string; html: string | undefined; from: string }} An object containing the final, resolved email parts.
 */
function resolveMessage(to: string, otp: string, url: string, expiry?: number | string, cfgOrFn?: MessageConfig | MessageTemplate) {
  const { seconds, text: minutesText } = formatExpiry(expiry)
  const ctx: MessageContext = { to, otp, url, expirySeconds: seconds, minutesText }

  let override: Partial<{ subject: string; text: string; html: string; from: string }> = {}
  if (typeof cfgOrFn === 'function') {
    override = cfgOrFn(ctx) || {}
  } else if (cfgOrFn && typeof cfgOrFn === 'object') {
    const cfg = cfgOrFn as MessageConfig
    if (cfg.template) {
      override = { ...override, ...(cfg.template(ctx) || {}) }
    }
    if (cfg.subject) override.subject = typeof cfg.subject === 'function' ? cfg.subject(ctx) : cfg.subject
    if (cfg.text) override.text = typeof cfg.text === 'function' ? cfg.text(ctx) : cfg.text
    if (cfg.html) override.html = typeof cfg.html === 'function' ? cfg.html(ctx) : cfg.html
    if (cfg.from) override.from = cfg.from
  }

  const subject = override.subject ?? OTP_MESSAGE_SUBJECT
  const text = override.text ?? `This is your one-time password to access ${url}

${otp}

Once used, this one-time password can not be used again. That's why it's called one-time password. This password also expires in ${minutesText}.`
  const html = override.html
  const from = override.from ?? OTP_MESSAGE_FROM

  return { subject, text, html, from }
}

/**
 * @async
 * @function send
 * @description
 * Low-level utility function to send the generated One-Time Password (OTP) via email.
 *
 * This function handles the entire email dispatch process, including:
 * 1. **Argument Validation:** Ensures the recipient (`to`) and sender (`from`) addresses are provided.
 * 2. **AWS SES Setup:** Configures a Nodemailer transporter using AWS SES. It prioritizes a user-provided
 * transporter or region, falling back to global constants (`OTP_SES_REGION`) or a default region (`us-east-1`).
 * 3. **Message Resolution:** Calls an external utility (`resolveMessage`) to format the email content
 * (subject, text, HTML body) using the OTP, URL, expiry, and any custom message templates.
 * 4. **Email Dispatch:** Uses the configured transporter to send the final email.
 *
 * @param {string} to - The recipient's email address.
 * @param {string} otp - The generated OTP code.
 * @param {string} url - The base URL, often used within the email template (e.g., for linking back to the app).
 * @param {number | string} [expiry] - The OTP expiration time, used in message resolution (e.g., "Expires in 5 minutes").
 * @param {MessageConfig | MessageTemplate} [message] - Custom configuration or templates for the email content.
 * @param {SendOptions} [opts] - Optional parameters, including an existing Nodemailer `transporter` or a specific `region`.
 * @returns {Promise<void>} A Promise that resolves when the email is sent by the transporter.
 * @throws {Error} If the recipient (`to`) or the sender (`from`) address is missing.
 */
function createSesTransport(region: string): nodemailer.Transporter {
  // Prefer Nodemailer v7 SESv2 client when available; fall back to legacy SES config
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sesv2 = require('@aws-sdk/client-sesv2') as typeof import('@aws-sdk/client-sesv2')
    const client = new sesv2.SESv2Client({ region })
    // Nodemailer v7 expects SESv2 via options.SES with { sesClient, SendEmailCommand }
    const opts: any = { SES: { sesClient: client, SendEmailCommand: sesv2.SendEmailCommand } }
    return nodemailer.createTransport(opts)
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const aws = require('@aws-sdk/client-ses') as typeof import('@aws-sdk/client-ses')
    const legacy = new aws.SES({ apiVersion: '2010-12-01', region })
    return nodemailer.createTransport({ SES: { ses: legacy, aws } } as any)
  }
}

async function send(
  to: string,
  otp: string,
  url: string,
  expiry?: number | string,
  message?: MessageConfig | MessageTemplate,
  opts?: SendOptions,
): Promise<void> {
  if (!to || String(to).trim().length === 0) {
    throw new Error('Missing recipient email: ensure OTP_MESSAGE_TEST_TO (for tests) or the "to" argument is set')
  }

  const region = opts?.region ?? OTP_SES_REGION ?? 'us-east-1'

  const transporter = opts?.transporter ?? createSesTransport(region)

  const { subject, text, html, from } = resolveMessage(to, otp, url, expiry, message)

  if (!from || String(from).trim().length === 0) {
    throw new Error('Missing sender address: set OTP_MESSAGE_FROM or provide message.from')
  }

  await transporter.sendMail({
    from,
    to,
    subject,
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
  })
}

export default send
