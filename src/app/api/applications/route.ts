import { NextResponse, after } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma, ApplicationStatus } from '@prisma/client'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCompanyId } from '@/lib/company'
import { rankJobsWithAI } from '@/lib/ai'
import { describeLocalMatch, localMatch, type CandidateProfile } from '@/lib/recommend'
import { logEvent, notify } from '@/lib/notify'
import { applicationSchema } from '@/lib/validations'

// GET /api/applications
//  - JOB_SEEKER: the applications they submitted
//  - RECRUITER:  applications received on ALL jobs of their company
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isRecruiter = session.user.role === 'RECRUITER'
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const jobId = searchParams.get('jobId')

    let where: Prisma.ApplicationWhereInput
    if (isRecruiter) {
      const companyId = await getCompanyId(session.user.id)
      if (!companyId) return NextResponse.json({ applications: [] })
      where = { job: { companyId } }
    } else {
      where = { applicantId: session.user.id }
    }

    if (status && Object.values(ApplicationStatus).includes(status as ApplicationStatus)) {
      where.status = status as ApplicationStatus
    }
    if (jobId && isRecruiter) where.jobId = jobId

    const applications = await prisma.application.findMany({
      where,
      include: {
        job: {
          include: {
            company: { select: { name: true } },
            ...(isRecruiter && { recruiter: { select: { name: true } } }),
          },
        },
        interviews: { orderBy: { scheduledAt: 'asc' } },
        ...(isRecruiter && {
          applicant: {
            select: {
              id: true,
              name: true,
              email: true,
              profile: { select: { headline: true, skills: true, location: true } },
            },
          },
        }),
      },
      orderBy: { createdAt: 'desc' },
    })

    // match scores are for recruiters only
    const safe = isRecruiter
      ? applications
      : applications.map((a) => ({ ...a, aiScore: null, aiNotes: null }))

    return NextResponse.json({ applications: safe })
  } catch (error) {
    console.error('Applications fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch applications' }, { status: 500 })
  }
}

// POST /api/applications - apply for a job (job seekers only)
// The application is saved right away with the local match score, so it can
// never hang or fail because of email / AI problems. Emails, notifications and
// the AI re-score run afterwards in the background.
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Please sign in to apply' }, { status: 401 })
    }
    if (session.user.role !== 'JOB_SEEKER') {
      return NextResponse.json({ error: 'Only job seekers can apply for jobs' }, { status: 403 })
    }

    const data = applicationSchema.parse(await req.json())

    const [existing, job, profile] = await Promise.all([
      prisma.application.findUnique({
        where: { jobId_applicantId: { jobId: data.jobId, applicantId: session.user.id } },
      }),
      prisma.job.findUnique({
        where: { id: data.jobId },
        include: { company: { select: { name: true } } },
      }),
      prisma.profile.findUnique({ where: { userId: session.user.id } }),
    ])

    if (existing) {
      return NextResponse.json({ error: 'You already applied to this job' }, { status: 409 })
    }
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }
    if (!job.isActive) {
      return NextResponse.json({ error: 'This job is no longer open' }, { status: 400 })
    }
    if (!profile || !profile.onboardingCompleted) {
      return NextResponse.json(
        { error: 'Complete your profile before applying. We will take you there now.', needsProfile: true },
        { status: 400 }
      )
    }

    const candidate: CandidateProfile = {
      skills: profile.skills,
      preferredRoles: profile.preferredRoles,
      currentDesignation: profile.currentDesignation,
      headline: profile.headline,
      resumeText: profile.resumeText,
      experienceCount: profile.experience.length,
    }
    const local = localMatch(candidate, job)
    const localNotes = describeLocalMatch(job, local)

    let application
    try {
      application = await prisma.application.create({
        data: {
          jobId: data.jobId,
          applicantId: session.user.id,
          coverLetter: data.coverLetter,
          resumeUrl: data.resumeUrl || profile.resumeUrl || null,
          aiScore: local.score,
          aiNotes: localNotes,
        },
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return NextResponse.json({ error: 'You already applied to this job' }, { status: 409 })
      }
      throw error
    }

    await logEvent(application.id, 'APPLIED', 'Application submitted')

    const applicantName = session.user.name ?? 'A candidate'
    const applicantId = session.user.id
    const applicationId = application.id
    const link = `/applications/${applicationId}`

    after(async () => {
      let score = local.score
      try {
        const ranked = await rankJobsWithAI(candidate, [job])
        const result = ranked?.[job.id]
        if (result) {
          score = Math.round(0.7 * result.score + 0.3 * local.score)
          await prisma.application.update({
            where: { id: applicationId },
            data: { aiScore: score, aiNotes: result.analysis || localNotes },
          })
        }
      } catch (error) {
        console.error('AI match scoring skipped:', error)
      }

      await Promise.all([
        notify(job.recruiterId, {
          title: `New application: ${job.title}`,
          body: `${applicantName} applied for ${job.title}. Match score: ${Math.round(score)}%.`,
          link,
        }),
        notify(applicantId, {
          title: `Application sent: ${job.title}`,
          body: `Your application to ${job.company.name} was received. We will email you when the status changes.`,
          link,
        }),
      ])
    })

    return NextResponse.json({ application }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 })
    }

    console.error('Application creation error:', error)
    return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 })
  }
}