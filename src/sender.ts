import nodemailer from 'nodemailer'
import * as aws from '@aws-sdk/client-ses'
import { OTP_MESSAGE_FROM, OTP_MESSAGE_SUBJECT, SES_REGION, OTP_EXPIRY } from './config'

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

function formatExpiry(expiry?: number | string): { seconds: number; minutes: number; text: string } {
  const secFromArg = Number(expiry)
  const seconds = Number.isFinite(secFromArg) && secFromArg > 0
    ? secFromArg
    : (Number.isFinite(OTP_EXPIRY) && OTP_EXPIRY > 0 ? OTP_EXPIRY : 1800) // default 30m

  const minutes = Math.max(1, Math.round(seconds / 60))
  const text = minutes === 1 ? '1 minute' : `${minutes} minutes`
  return { seconds, minutes, text }
}

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

async function send(to: string, otp: string, url: string, expiry?: number | string, message?: MessageConfig | MessageTemplate): Promise<void> {
  if (!to || String(to).trim().length === 0) {
    throw new Error('Missing recipient email: ensure OTP_MESSAGE_TEST_TO (for tests) or the "to" argument is set')
  }

  const ses = new aws.SES({
    apiVersion: '2010-12-01',
    region: SES_REGION,
  })

  const transporter = nodemailer.createTransport({
    SES: { ses, aws },
  })

  const { subject, text, html, from } = resolveMessage(to, otp, url, expiry, message)

  await transporter.sendMail({
    from,
    to,
    subject,
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
  })
}

export default send
