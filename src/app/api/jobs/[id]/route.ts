import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCompanyId, recruiterContext } from '@/lib/company'
import { jobUpdateSchema } from '@/lib/validations'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/jobs/[id]
export async function GET(_req: Request, context: RouteParams) {
  try {
    const { id } = await context.params

    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            name: true,
            logo: true,
            website: true,
            industry: true,
            size: true,
            description: true,
            location: true,
          },
        },
        recruiter: { select: { name: true } },
        _count: { select: { applications: true } },
      },
    })

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    const session = await getServerSession(authOptions)

    if (session?.user?.role === 'RECRUITER') {
      // recruiters only see their own company's jobs
      const companyId = await getCompanyId(session.user.id)
      if (!companyId || companyId !== job.companyId) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      }
    } else {
      // views count candidates only
      await prisma.job.update({ where: { id }, data: { views: { increment: 1 } } })
    }

    return NextResponse.json({ job })
  } catch (error) {
    console.error('Job fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch job' }, { status: 500 })
  }
}

// PUT /api/jobs/[id] - any recruiter of the job's company
export async function PUT(req: Request, context: RouteParams) {
  try {
    const ctx = await recruiterContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await context.params
    const data = jobUpdateSchema.parse(await req.json())

    const existingJob = await prisma.job.findUnique({ where: { id } })

    if (!existingJob || !ctx.companyId || existingJob.companyId !== ctx.companyId) {
      return NextResponse.json({ error: 'Job not found or unauthorized' }, { status: 404 })
    }

    const job = await prisma.job.update({
      where: { id },
      data,
      include: { company: { select: { name: true } } },
    })

    return NextResponse.json({ job })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message ?? 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Job update error:', error)
    return NextResponse.json({ error: 'Failed to update job' }, { status: 500 })
  }
}

// DELETE /api/jobs/[id] - any recruiter of the job's company
export async function DELETE(_req: Request, context: RouteParams) {
  try {
    const ctx = await recruiterContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await context.params

    const existingJob = await prisma.job.findUnique({ where: { id } })

    if (!existingJob || !ctx.companyId || existingJob.companyId !== ctx.companyId) {
      return NextResponse.json({ error: 'Job not found or unauthorized' }, { status: 404 })
    }

    await prisma.job.delete({ where: { id } })

    return NextResponse.json({ message: 'Job deleted successfully' })
  } catch (error) {
    console.error('Job deletion error:', error)
    return NextResponse.json({ error: 'Failed to delete job' }, { status: 500 })
  }
}