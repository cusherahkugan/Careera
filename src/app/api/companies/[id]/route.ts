import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCompanyId } from '@/lib/company'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/companies/[id] - public company profile + its OPEN jobs
// (never exposes the join code or recruiter emails)
export async function GET(_req: Request, context: RouteParams) {
  try {
    const { id } = await context.params

    const company = await prisma.company.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        logo: true,
        website: true,
        linkedin: true,
        industry: true,
        size: true,
        founded: true,
        location: true,
        tagline: true,
        description: true,
        specialties: true,
        jobs: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            location: true,
            type: true,
            salary: true,
            skills: true,
            createdAt: true,
          },
        },
      },
    })

    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    const session = await getServerSession(authOptions)
    const isOwn =
      session?.user?.role === 'RECRUITER'
        ? (await getCompanyId(session.user.id)) === company.id
        : false

    return NextResponse.json({ company, isOwn })
  } catch (error) {
    console.error('Company profile error:', error)
    return NextResponse.json({ error: 'Failed to load company' }, { status: 500 })
  }
}