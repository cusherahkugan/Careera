import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCompanyId } from '@/lib/company'
import { logEvent, notify, statusCopy } from '@/lib/notify'
import { applicationStatusLabels } from '@/lib/utils'
import { statusUpdateSchema } from '@/lib/validations'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/applications/[id] - full detail for the applicant or a recruiter of the job's company
export async function GET(_req: Request, context: RouteParams) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params

    const application = await prisma.application.findUnique({
      where: { id },
      include: {
        job: { include: { company: { select: { name: true, location: true } } } },
        applicant: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            // explicit select: never send resumeText / resume bytes to the browser
            profile: {
              select: {
                photo: true,
                phone: true,
                contactEmail: true,
                location: true,
                headline: true,
                currentDesignation: true,
                bio: true,
                skills: true,
                experience: true,
                education: true,
                linkedIn: true,
                github: true,
                portfolio: true,
                resumeFileName: true,
              },
            },
          },
        },
        events: { orderBy: { createdAt: 'asc' } },
        interviews: { orderBy: { scheduledAt: 'asc' } },
        messages: {
          include: { sender: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    const companyId = session.user.role === 'RECRUITER' ? await getCompanyId(session.user.id) : null
    const isApplicant = application.applicantId === session.user.id
    const isRecruiter = !!companyId && application.job.companyId === companyId

    if (!isApplicant && !isRecruiter) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // AI scoring is for recruiters only
    return NextResponse.json({
      application: isRecruiter ? application : { ...application, aiScore: null, aiNotes: null },
    })
  } catch (error) {
    console.error('Application fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch application' }, { status: 500 })
  }
}

// PATCH /api/applications/[id]
//  - recruiter (of the job's company): change status (emails + notifies the applicant)
//  - applicant: withdraw
export async function PATCH(req: Request, context: RouteParams) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const parsed = statusUpdateSchema.safeParse(await req.json())

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const application = await prisma.application.findUnique({
      where: { id },
      include: {
        job: { include: { company: { select: { name: true } } } },
        applicant: { select: { id: true, name: true } },
      },
    })

    const companyId = session.user.role === 'RECRUITER' ? await getCompanyId(session.user.id) : null
    const isRecruiter = !!application && !!companyId && application.job.companyId === companyId
    const isApplicant =
      !!application && session.user.role === 'JOB_SEEKER' && application.applicantId === session.user.id

    if (!application || (!isRecruiter && !isApplicant)) {
      return NextResponse.json({ error: 'Application not found or unauthorized' }, { status: 404 })
    }

    const next = parsed.data.status

    if (isApplicant) {
      if (next !== 'WITHDRAWN') {
        return NextResponse.json({ error: 'You can only withdraw your application' }, { status: 403 })
      }
      if (['ACCEPTED', 'REJECTED', 'WITHDRAWN'].includes(application.status)) {
        return NextResponse.json({ error: 'This application can no longer be withdrawn' }, { status: 400 })
      }
    } else if (next === 'WITHDRAWN') {
      return NextResponse.json({ error: 'Only the applicant can withdraw' }, { status: 400 })
    }

    if (next === application.status) {
      return NextResponse.json({ application })
    }

    const updated = await prisma.application.update({
      where: { id },
      data: { status: next },
      include: {
        job: { include: { company: { select: { name: true } } } },
        applicant: { select: { id: true, name: true, email: true } },
      },
    })

    await logEvent(
      id,
      'STATUS',
      isApplicant ? 'Application withdrawn' : `Status changed to "${applicationStatusLabels[next]}"`,
      isRecruiter ? parsed.data.note : null
    )

    // a closed application should not keep live interviews
    if (next === 'REJECTED' || next === 'WITHDRAWN') {
      await prisma.interview.updateMany({
        where: { applicationId: id, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
        data: { status: 'CANCELLED' },
      })
    }

    const link = `/applications/${id}`
    if (isRecruiter) {
      const copy = statusCopy(next, application.job.title, application.job.company.name, parsed.data.note)
      await notify(application.applicantId, { title: copy.title, body: copy.body, link })
    } else {
      await notify(application.job.recruiterId, {
        title: `Application withdrawn: ${application.job.title}`,
        body: `${application.applicant.name} withdrew their application.`,
        link,
      })
    }

    return NextResponse.json({ application: updated })
  } catch (error) {
    console.error('Application update error:', error)
    return NextResponse.json({ error: 'Failed to update application' }, { status: 500 })
  }
}