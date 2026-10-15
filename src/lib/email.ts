import nodemailer from 'nodemailer'
import type { Attachment } from 'nodemailer/lib/mailer'

type Mailer = ReturnType<typeof nodemailer.createTransport>

let transporter: Mailer | null | undefined

function getTransporter(): Mailer | null {
  if (transporter !== undefined) return transporter

  const host = process.env.SMTP_HOST?.trim()
  if (!host) {
    transporter = null
    return transporter
  }

  const port = Number(process.env.SMTP_PORT || 587)
  const secure = process.env.SMTP_SECURE === 'true' || port === 465
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS?.trim()

  transporter = nodemailer.createTransport({
    host,
    port,
    secure, // true for 465, false for 587 (STARTTLS)
    requireTLS: !secure,
    auth: user ? { user, pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  })
  return transporter
}

/** "Name <address>" - must be a sender / domain verified in Brevo. */
function fromAddress(): string {
  return process.env.EMAIL_FROM?.trim() || process.env.SMTP_FROM?.trim() || 'Careera <no-reply@careera.local>'
}

/**
 * Sends an email. Never throws: a broken mail server must not break the
 * request that triggered it. Without SMTP_HOST the email is logged instead.
 *
 * Brevo: SMTP_HOST=smtp-relay.brevo.com, SMTP_PORT=587, SMTP_USER=<SMTP login>,
 * SMTP_PASS=<SMTP key (xsmtpsib-...)>, EMAIL_FROM="Careera <verified@yourdomain>"
 */
export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
  text?: string
  attachments?: Attachment[]
}): Promise<boolean> {
  const mailer = getTransporter()

  if (!mailer) {
    console.log(`[email not sent - SMTP_HOST is not set] to=${opts.to} subject="${opts.subject}"\n${opts.text ?? ''}`)
    return false
  }

  if (!process.env.EMAIL_FROM && !process.env.SMTP_FROM) {
    console.warn('[email] EMAIL_FROM is not set. Brevo rejects senders that are not verified.')
  }

  try {
    const info = await mailer.sendMail({ from: fromAddress(), ...opts })
    console.log(`[email sent] to=${opts.to} id=${info.messageId}`)
    return true
  } catch (error) {
    const e = error as { message?: string; response?: string; responseCode?: number; code?: string }
    console.error(
      `[email failed] to=${opts.to} code=${e.code ?? ''} ${e.responseCode ?? ''} ${e.response ?? e.message ?? error}`
    )
    return false
  }
}