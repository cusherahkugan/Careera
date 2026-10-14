import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma, JobType } from '@prisma/client'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCompanyId, isCompanyComplete, recruiterContext } from '@/lib/company'
import { localMatch, type CandidateProfile } from '@/lib/recommend'
import { jobSchema } from '@/lib/validations'

const MATCH_POOL = 300 // how many open jobs are scored when sorting by match

// GET /api/jobs
//  - seekers / visitors: every OPEN job (?sort=match ranks it for a signed-in seeker)
//  - recruiters: ONLY their own company's jobs (open and closed), whoever posted them
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')
    const type = searchParams.get('type')
    const location = searchParams.get('location')
    const sort = searchParams.get('sort')
    const skills = searchParams.get('skills')?.split(',').filter(Boolean)
    const page = Math.max(parseInt(searchParams.get('page') || '1') || 1, 1)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '10') || 10, 1), 50)

    const session = await getServerSession(authOptions)
    const isRecruiter = session?.user?.role === 'RECRUITER'

    const where: Prisma.JobWhereInput = {}

    if (isRecruiter) {
      const companyId = await getCompanyId(session!.user.id)
      if (!companyId) {
        return NextResponse.json({ jobs: [], pagination: { total: 0, page, limit, pages: 1 } })
      }
      where.companyId = companyId
    } else {
      if (searchParams.get('mine') === 'true') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      where.isActive = true
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ]
    }

    if (type && Object.values(JobType).includes(type as JobType)) {
      where.type = type as JobType
    }
    if (location) where.location = { contains: location, mode: 'insensitive' }
    if (skills && skills.length > 0) where.skills = { hasSome: skills }

    const include = {
      company: { select: { name: true, location: true } },
      recruiter: { select: { name: true } },
      _count: { select: { applications: true } },
    } satisfies Prisma.JobInclude

    // seekers: rank every open job by profile match + how fresh it is
    if (!isRecruiter && sort === 'match' && session?.user?.role === 'JOB_SEEKER') {
      const profile = await prisma.profile.findUnique({ where: { userId: session.user.id } })

      if (profile && (profile.skills.length > 0 || profile.preferredRoles.length > 0)) {
        const pool = await prisma.job.findMany({
          where,
          include,
          orderBy: { createdAt: 'desc' },
          take: MATCH_POOL,
        })

        const candidate: CandidateProfile = {
          skills: profile.skills,
          preferredRoles: profile.preferredRoles,
          currentDesignation: profile.currentDesignation,
          headline: profile.headline,
          resumeText: profile.resumeText,
          experienceCount: profile.experience.length,
        }

        const now = Date.now()
        const ranked = pool
          .map((job) => {
            const m = localMatch(candidate, job)
            const ageDays = (now - job.createdAt.getTime()) / 86_400_000
            const freshness = Math.max(0, 15 - ageDays) // brand-new jobs get up to +15
            return {
              rank: m.score + freshness,
              job: { ...job, matchScore: m.score, matchedSkills: m.matchedSkills },
            }
          })
          .sort((a, b) => b.rank - a.rank)

        const total = ranked.length
        const jobs = ranked.slice((page - 1) * limit, page * limit).map((r) => r.job)

        return NextResponse.json({
          jobs,
          sortedBy: 'match',
          pagination: { total, page, limit, pages: Math.max(Math.ceil(total / limit), 1) },
        })
      }
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.job.count({ where }),
    ])

    return NextResponse.json({
      jobs,
      sortedBy: 'new',
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('Jobs fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 })
  }
}

// POST /api/jobs - create a job for the recruiter's company
export async function POST(req: Request) {
  try {
    const ctx = await recruiterContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const data = jobSchema.parse(body)

    const company = ctx.companyId
      ? await prisma.company.findUnique({ where: { id: ctx.companyId } })
      : null

    if (!company || !isCompanyComplete(company)) {
      return NextResponse.json(
        { error: 'Add your company details before posting a job', needsCompany: true },
        { status: 400 }
      )
    }

    const job = await prisma.job.create({
      data: {
        ...data,
        companyId: company.id,
        recruiterId: ctx.userId,
      },
      include: { company: { select: { name: true } } },
    })

    return NextResponse.json({ job }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message ?? 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Job creation error:', error)
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
  }
}