import type { Attachment } from 'nodemailer/lib/mailer'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

const appUrl = () =>
  (process.env.APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '')

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

type Payload = { title: string; body: string; link?: string; attachments?: Attachment[] }

function renderEmail(name: string, n: { title: string; body: string; link?: string }) {
  const url = n.link ? `${appUrl()}${n.link}` : null
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#27272a;padding:24px">
  <h2 style="margin:0 0 24px;font-family:Georgia,serif;color:#18181b">Careera<span style="color:#dc2626">.</span></h2>
  <p>Hi ${esc(name)},</p>
  <h3 style="margin:16px 0 8px;color:#18181b">${esc(n.title)}</h3>
  <p style="white-space:pre-line;line-height:1.5">${esc(n.body)}</p>
  ${
    url
      ? `<p style="margin:24px 0"><a href="${url}" style="background:#dc2626;color:#fff;text-decoration:none;padding:10px 20px;border-radius:4px;font-weight:bold">View details</a></p>`
      : ''
  }
  <p style="font-size:12px;color:#71717a;margin-top:32px">You are receiving this because you have an account on Careera.</p>
</div>`
}

/**
 * Creates the in-app notification AND emails the user. Never throws, so it is
 * safe to call from any API route after the main work succeeded.
 */
export async function notify(userId: string, n: Payload) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    })
    if (!user) return

    await prisma.notification.create({
      data: { userId, title: n.title, body: n.body, link: n.link },
    })

    await sendEmail({
      to: user.email,
      subject: n.title,
      html: renderEmail(user.name, n),
      text: `${n.title}\n\n${n.body}${n.link ? `\n\n${appUrl()}${n.link}` : ''}`,
      attachments: n.attachments,
    })
  } catch (error) {
    console.error('notify failed:', error)
  }
}

/** Notifies every recruiter of a company (in-app + email). Never throws. */
export async function notifyCompany(companyId: string, n: Payload, excludeUserId?: string) {
  try {
    const members = await prisma.user.findMany({
      where: {
        companyId,
        role: 'RECRUITER',
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true },
    })
    await Promise.all(members.map((m) => notify(m.id, n)))
  } catch (error) {
    console.error('notifyCompany failed:', error)
  }
}

/** Adds a line to the application timeline. Never throws. */
export async function logEvent(
  applicationId: string,
  type: 'APPLIED' | 'STATUS' | 'INTERVIEW',
  title: string,
  note?: string | null
) {
  try {
    await prisma.applicationEvent.create({
      data: { applicationId, type, title, note: note || null },
    })
  } catch (error) {
    console.error('logEvent failed:', error)
  }
}

/** Wording for the "your status changed" email / notification. */
export function statusCopy(status: string, jobTitle: string, company: string, note?: string | null) {
  const copy: Record<string, { title: string; body: string }> = {
    PENDING: {
      title: `Your application is back in the queue: ${jobTitle}`,
      body: `${company} moved your application for ${jobTitle} back to "pending review".`,
    },
    REVIEWED: {
      title: `Your application is being reviewed: ${jobTitle}`,
      body: `Good news - ${company} has started reviewing your application for ${jobTitle}.`,
    },
    INTERVIEW: {
      title: `You are moving to the interview stage: ${jobTitle}`,
      body: `${company} would like to interview you for ${jobTitle}. They will send you the interview details shortly.`,
    },
    ACCEPTED: {
      title: `Congratulations! ${company} accepted your application`,
      body: `${company} has accepted your application for ${jobTitle}. They will contact you about the next steps.`,
    },
    REJECTED: {
      title: `Update on your application: ${jobTitle}`,
      body: `Thank you for applying to ${company}. Unfortunately they decided not to move forward with your application for ${jobTitle}. We wish you the best in your search.`,
    },
  }
  const c = copy[status] ?? {
    title: `Application update: ${jobTitle}`,
    body: `The status of your application at ${company} changed.`,
  }
  return { title: c.title, body: note ? `${c.body}\n\nMessage from the recruiter:\n${note}` : c.body }
}

// ---------- interview wording ----------

const MODE_LABEL: Record<string, string> = {
  VIDEO: 'Video call',
  PHONE: 'Phone call',
  ONSITE: 'On-site',
}

export function formatWhen(d: Date): string {
  return d.toLocaleString('en-US', {
    timeZone: process.env.APP_TIMEZONE || 'UTC',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

export function describeInterview(
  company: string,
  jobTitle: string,
  i: { scheduledAt: Date; durationMins: number; mode: string; location: string | null; notes: string | null }
): string {
  return [
    `Role: ${jobTitle} at ${company}`,
    `When: ${formatWhen(i.scheduledAt)}`,
    `Duration: ${i.durationMins} minutes`,
    `Format: ${MODE_LABEL[i.mode] ?? i.mode}`,
    i.location ? `Where / link: ${i.location}` : '',
    i.notes ? `Notes: ${i.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}