import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildIcs } from '@/lib/ics'
import { describeInterview, logEvent, notify } from '@/lib/notify'
import { interviewCreateSchema } from '@/lib/validations'

// GET /api/interviews?upcoming=true - my interviews (as candidate or recruiter)
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const isRecruiter = session.user.role === 'RECRUITER'
    const upcoming = new URL(req.url).searchParams.get('upcoming') === 'true'

    const where: Prisma.InterviewWhereInput = {
      application: isRecruiter
        ? { job: { recruiterId: session.user.id } }
        : { applicantId: session.user.id },
    }
    if (upcoming) {
      where.scheduledAt = { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) }
      where.status = { in: ['SCHEDULED', 'CONFIRMED'] }
    }

    const interviews = await prisma.interview.findMany({
      where,
      include: {
        application: {
          include: {
            job: { include: { company: { select: { name: true } } } },
            applicant: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 50,
    })

    return NextResponse.json({ interviews })
  } catch (error) {
    console.error('Interviews fetch error:', error)
    return NextResponse.json({ error: 'Failed to load interviews' }, { status: 500 })
  }
}

// POST /api/interviews - schedule an interview (recruiter who owns the job)
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || session.user.role !== 'RECRUITER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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

    if (!application || application.job.recruiterId !== session.user.id) {
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
    await logEvent(application.id, 'INTERVIEW', 'Interview scheduled', describeInterview(application.job.company.name, application.job.title, interview))

    const company = application.job.company.name
    const details = describeInterview(company, application.job.title, interview)

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