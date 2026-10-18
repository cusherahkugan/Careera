import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildIcs } from '@/lib/ics'
import { getCompanyId, recruiterContext } from '@/lib/company'
import { describeInterview, logEvent, notify } from '@/lib/notify'
import { interviewCreateSchema } from '@/lib/validations'

// GET /api/interviews?upcoming=true
// GET /api/interviews?from=<ISO>&to=<ISO>   (calendar: every interview in the range)
//  - seekers: their own interviews
//  - recruiters: interviews for every job of their company
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const isRecruiter = session.user.role === 'RECRUITER'
    const params = new URL(req.url).searchParams
    const upcoming = params.get('upcoming') === 'true'
    const fromParam = params.get('from')
    const toParam = params.get('to')

    let range: { gte: Date; lt: Date } | null = null
    if (fromParam && toParam) {
      const from = new Date(fromParam)
      const to = new Date(toParam)
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
        return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
      }
      range = { gte: from, lt: to }
    }

    let application: Prisma.ApplicationWhereInput
    if (isRecruiter) {
      const companyId = await getCompanyId(session.user.id)
      if (!companyId) return NextResponse.json({ interviews: [] })
      application = { job: { companyId } }
    } else {
      application = { applicantId: session.user.id }
    }

    const where: Prisma.InterviewWhereInput = { application }
    if (range) {
      // calendar view: all statuses within the requested window
      where.scheduledAt = range
    } else if (upcoming) {
      where.scheduledAt = { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) }
      where.status = { in: ['SCHEDULED', 'CONFIRMED'] }
    }

    const interviews = await prisma.interview.findMany({
      where,
      include: {
        application: {
          include: {
            job: {
              include: {
                company: { select: { name: true } },
                recruiter: { select: { name: true } },
              },
            },
            applicant: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
      take: range ? 200 : 50,
    })

    return NextResponse.json({ interviews })
  } catch (error) {
    console.error('Interviews fetch error:', error)
    return NextResponse.json({ error: 'Failed to load interviews' }, { status: 500 })
  }
}

// POST /api/interviews - schedule an interview (recruiter of the job's company)
export async function POST(req: Request) {
  try {
    const ctx = await recruiterContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const data = interviewCreateSchema.parse(await req.json())

    if (data.scheduledAt.getTime() < Date.now()) {
      return NextResponse.json({ error: 'Pick a time in the future' }, { status: 400 })
    }

    const application = await prisma.application.findUnique({
      where: { id: data.applicationId },
      include: {
        job: { include: { company: { select: { name: true } } } },
        applicant: { select: { id: true, name: true } },
      },
    })

    if (!application || !ctx.companyId || application.job.companyId !== ctx.companyId) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }
    if (application.status === 'REJECTED' || application.status === 'WITHDRAWN') {
      return NextResponse.json({ error: 'This application is closed' }, { status: 400 })
    }

    const interview = await prisma.interview.create({
      data: {
        applicationId: application.id,
        scheduledAt: data.scheduledAt,
        durationMins: data.durationMins,
        mode: data.mode,
        location: data.location || null,
        notes: data.notes || null,
      },
    })

    // scheduling an interview moves early-stage applications to the interview stage
    if (application.status === 'PENDING' || application.status === 'REVIEWED') {
      await prisma.application.update({ where: { id: application.id }, data: { status: 'INTERVIEW' } })
      await logEvent(application.id, 'STATUS', 'Status changed to "Interview stage"')
    }

    const company = application.job.company.name
    const details = describeInterview(company, application.job.title, interview)
    await logEvent(application.id, 'INTERVIEW', 'Interview scheduled', details)

    await notify(application.applicantId, {
      title: `Interview scheduled: ${application.job.title} at ${company}`,
      body: `${details}\n\nPlease open the application and confirm that you can attend. A calendar invite is attached.`,
      link: `/applications/${application.id}`,
      attachments: [
        {
          filename: 'interview.ics',
          contentType: 'text/calendar; method=REQUEST',
          content: buildIcs({
            uid: `${interview.id}@careera`,
            start: interview.scheduledAt,
            durationMins: interview.durationMins,
            summary: `Interview: ${application.job.title} at ${company}`,
            description: details,
            location: interview.location ?? undefined,
          }),
        },
      ],
    })

    return NextResponse.json({ interview }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    console.error('Interview create error:', error)
    return NextResponse.json({ error: 'Failed to schedule interview' }, { status: 500 })
  }
}