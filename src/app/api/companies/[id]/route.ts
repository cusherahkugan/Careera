import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCompanyId } from '@/lib/company'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/companies/[id] - company profile + its jobs
//  - visitors / seekers: any company, OPEN jobs only
//  - recruiters: ONLY their own company (open and closed jobs); other companies are 404
// Never exposes the join code or recruiter emails.
export async function GET(_req: Request, context: RouteParams) {
  try {
    const { id } = await context.params

    const session = await getServerSession(authOptions)
    const isRecruiter = session?.user?.role === 'RECRUITER'
    const ownCompanyId = isRecruiter ? await getCompanyId(session!.user.id) : null

    if (isRecruiter && ownCompanyId !== id) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }
    const isOwn = isRecruiter && ownCompanyId === id

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
          where: isOwn ? {} : { isActive: true },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            location: true,
            type: true,
            salary: true,
            skills: true,
            isActive: true,
            createdAt: true,
          },
        },
      },
    })

    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    // an unfinished company profile is only visible to its own team
    if (!isOwn && (!company.description || !company.industry)) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    return NextResponse.json({ company, isOwn })
  } catch (error) {
    console.error('Company profile error:', error)
    return NextResponse.json({ error: 'Failed to load company' }, { status: 500 })
  }
}