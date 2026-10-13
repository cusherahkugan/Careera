import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma, ApplicationStatus } from '@prisma/client'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { rankJobsWithAI } from '@/lib/ai'
import { describeLocalMatch, localMatch, type CandidateProfile } from '@/lib/recommend'
import { logEvent, notify } from '@/lib/notify'
import { applicationSchema } from '@/lib/validations'

const SCORING_TIMEOUT_MS = 6000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

// GET /api/applications
//  - JOB_SEEKER: the applications they submitted
//  - RECRUITER:  applications received on jobs they posted (with applicant details)
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

    const where: Prisma.ApplicationWhereInput = isRecruiter
      ? { job: { recruiterId: session.user.id } }
      : { applicantId: session.user.id }

    if (status && Object.values(ApplicationStatus).includes(status as ApplicationStatus)) {
      where.status = status as ApplicationStatus
    }
    if (jobId && isRecruiter) where.jobId = jobId

    const applications = await prisma.application.findMany({
      where,
      include: {
        job: { include: { company: { select: { name: true, logo: true } } } },
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

// POST /api/applications - apply for a job
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
      prisma.job.findUnique({ where: { id: data.jobId } }),
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
        { error: 'Complete your profile before applying', needsProfile: true },
        { status: 400 }
      )
    }

    // Match scoring: local score always works; AI refines it when available.
    // It must never block or break applying.
    const candidate: CandidateProfile = {
      skills: profile.skills,
      preferredRoles: profile.preferredRoles,
      currentDesignation: profile.currentDesignation,
      headline: profile.headline,
      resumeText: profile.resumeText,
      experienceCount: profile.experience.length,
    }
    const local = localMatch(candidate, job)
    let aiScore: number = local.score
    let aiNotes: string = describeLocalMatch(job, local)

    try {
      const ranked = await withTimeout(rankJobsWithAI(candidate, [job]), SCORING_TIMEOUT_MS)
      const result = ranked?.[job.id]
      if (result) {
        aiScore = Math.round(0.7 * result.score + 0.3 * local.score)
        aiNotes = result.analysis || aiNotes
      }
    } catch (error) {
      console.error('AI match scoring skipped:', error)
    }

    try {
      const application = await prisma.application.create({
        data: {
          jobId: data.jobId,
          applicantId: session.user.id,
          coverLetter: data.coverLetter,
          resumeUrl: data.resumeUrl || profile.resumeUrl || null,
          aiScore,
          aiNotes,
        },
        include: { job: { include: { company: true } } },
      })

      const link = `/applications/${application.id}`
      await logEvent(application.id, 'APPLIED', 'Application submitted')
      await Promise.all([
        notify(job.recruiterId, {
          title: `New application: ${job.title}`,
          body: `${session.user.name ?? 'A candidate'} applied for ${job.title}. Match score: ${Math.round(aiScore)}%.`,
          link,
        }),
        notify(session.user.id, {
          title: `Application sent: ${job.title}`,
          body: `Your application to ${application.job.company.name} was received. We will email you when the status changes.`,
          link,
        }),
      ])

      return NextResponse.json({ application }, { status: 201 })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return NextResponse.json({ error: 'You already applied to this job' }, { status: 409 })
      }
      throw error
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 })
    }

    console.error('Application creation error:', error)
    return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 })
  }
}