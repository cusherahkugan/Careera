import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildIcs } from '@/lib/ics'
import { getCompanyId } from '@/lib/company'
import { describeInterview, logEvent, notify } from '@/lib/notify'
import { interviewUpdateSchema } from '@/lib/validations'

interface RouteParams {
  params: Promise<{ id: string }>
}

// PATCH /api/interviews/[id]
//  recruiter (of the job's company): reschedule | cancel | complete
//  candidate: confirm | decline
export async function PATCH(req: Request, context: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await context.params
    const body = interviewUpdateSchema.parse(await req.json())

    const interview = await prisma.interview.findUnique({
      where: { id },
      include: {
        application: {
          include: {
            job: { include: { company: { select: { name: true } } } },
            applicant: { select: { id: true, name: true } },
          },
        },
      },
    })

    const app = interview?.application
    const companyId = session.user.role === 'RECRUITER' ? await getCompanyId(session.user.id) : null
    const isRecruiter = !!app && !!companyId && app.job.companyId === companyId
    const isApplicant =
      !!app && session.user.role === 'JOB_SEEKER' && app.applicantId === session.user.id

    if (!interview || !app || (!isRecruiter && !isApplicant)) {
      return NextResponse.json({ error: 'Interview not found' }, { status: 404 })
    }
    if (interview.status === 'CANCELLED' || interview.status === 'COMPLETED') {
      return NextResponse.json({ error: 'This interview is already closed' }, { status: 400 })
    }

    const recruiterActions = ['reschedule', 'cancel', 'complete']
    if (recruiterActions.includes(body.action) !== isRecruiter) {
      return NextResponse.json({ error: 'You cannot do that' }, { status: 403 })
    }

    const company = app.job.company.name
    const jobTitle = app.job.title
    const link = `/applications/${app.id}`
    const uid = `${interview.id}@careera`
    const sequence = Math.floor(Date.now() / 1000)

    switch (body.action) {
      case 'reschedule': {
        if (!body.scheduledAt || body.scheduledAt.getTime() < Date.now()) {
          return NextResponse.json({ error: 'Pick a time in the future' }, { status: 400 })
        }
        const updated = await prisma.interview.update({
          where: { id },
          data: {
            scheduledAt: body.scheduledAt,
            durationMins: body.durationMins ?? interview.durationMins,
            mode: body.mode ?? interview.mode,
            location: body.location !== undefined ? body.location || null : interview.location,
            notes: body.notes !== undefined ? body.notes || null : interview.notes,
            status: 'SCHEDULED',
          },
        })
        const details = describeInterview(company, jobTitle, updated)
        await logEvent(app.id, 'INTERVIEW', 'Interview rescheduled', details)
        await notify(app.applicantId, {
          title: `Interview rescheduled: ${jobTitle} at ${company}`,
          body: `${details}\n\nPlease confirm the new time. An updated calendar invite is attached.`,
          link,
          attachments: [
            {
              filename: 'interview.ics',
              contentType: 'text/calendar; method=REQUEST',
              content: buildIcs({
                uid,
                sequence,
                start: updated.scheduledAt,
                durationMins: updated.durationMins,
                summary: `Interview: ${jobTitle} at ${company}`,
                description: details,
                location: updated.location ?? undefined,
              }),
            },
          ],
        })
        return NextResponse.json({ interview: updated })
      }

      case 'cancel': {
        const updated = await prisma.interview.update({ where: { id }, data: { status: 'CANCELLED' } })
        await logEvent(app.id, 'INTERVIEW', 'Interview cancelled')
        await notify(app.applicantId, {
          title: `Interview cancelled: ${jobTitle} at ${company}`,
          body: `${company} cancelled the interview that was planned for ${describeInterview(company, jobTitle, interview).split('\n')[1]?.replace('When: ', '')}. They may contact you with a new time.`,
          link,
          attachments: [
            {
              filename: 'interview-cancelled.ics',
              contentType: 'text/calendar; method=CANCEL',
              content: buildIcs({
                uid,
                sequence,
                cancel: true,
                start: interview.scheduledAt,
                durationMins: interview.durationMins,
                summary: `Interview: ${jobTitle} at ${company}`,
              }),
            },
          ],
        })
        return NextResponse.json({ interview: updated })
      }

      case 'complete': {
        const updated = await prisma.interview.update({ where: { id }, data: { status: 'COMPLETED' } })
        await logEvent(app.id, 'INTERVIEW', 'Interview completed')
        return NextResponse.json({ interview: updated })
      }

      case 'confirm': {
        const updated = await prisma.interview.update({ where: { id }, data: { status: 'CONFIRMED' } })
        await logEvent(app.id, 'INTERVIEW', 'Candidate confirmed the interview')
        await notify(app.job.recruiterId, {
          title: `Interview confirmed: ${app.applicant.name}`,
          body: `${app.applicant.name} confirmed the interview for ${jobTitle}.`,
          link,
        })
        return NextResponse.json({ interview: updated })
      }

      case 'decline': {
        const reason = body.notes ? `\nReason: ${body.notes}` : ''
        const updated = await prisma.interview.update({
          where: { id },
          data: { status: 'CANCELLED', notes: body.notes ? `Declined by candidate: ${body.notes}` : interview.notes },
        })
        await logEvent(app.id, 'INTERVIEW', 'Candidate cannot attend the interview', body.notes)
        await notify(app.job.recruiterId, {
          title: `Interview declined: ${app.applicant.name}`,
          body: `${app.applicant.name} cannot attend the interview for ${jobTitle}.${reason}\nPlease schedule a new time.`,
          link,
        })
        return NextResponse.json({ interview: updated })
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    console.error('Interview update error:', error)
    return NextResponse.json({ error: 'Failed to update interview' }, { status: 500 })
  }
}