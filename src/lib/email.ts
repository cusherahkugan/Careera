import nodemailer from 'nodemailer'
import type { Attachment } from 'nodemailer/lib/mailer'

type Mailer = ReturnType<typeof nodemailer.createTransport>

let transporter: Mailer | null | undefined

function getTransporter(): Mailer | null {
  if (transporter !== undefined) return transporter
  const host = process.env.SMTP_HOST
  transporter = host
    ? nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
        connectionTimeout: 8000,
        socketTimeout: 10000,
      })
    : null
  return transporter
}

/**
 * Sends an email. Never throws: a broken mail server must not break the
 * request that triggered it. Without SMTP_HOST the email is logged instead.
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

  try {
    await mailer.sendMail({
      from: process.env.EMAIL_FROM || 'Careera <no-reply@careera.local>',
      ...opts,
    })
    return true
  } catch (error) {
    console.error('Email send failed:', error)
    return false
  }
}