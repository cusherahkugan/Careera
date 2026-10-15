import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCompanyId } from '@/lib/company'

// GET /api/companies?q=acme
//  - visitors / seekers: browse or search ALL companies that finished their profile
//  - recruiters: ONLY their own company (never a list of competitors)
export async function GET(req: Request) {
  try {
    const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
    const session = await getServerSession(authOptions)
    const isRecruiter = session?.user?.role === 'RECRUITER'

    let where: Prisma.CompanyWhereInput

    if (isRecruiter) {
      const companyId = await getCompanyId(session!.user.id)
      if (!companyId) return NextResponse.json({ companies: [], ownOnly: true })
      where = { id: companyId }
    } else {
      // companies that never finished their profile stay hidden
      where = { description: { not: null }, industry: { not: null } }
      if (q) {
        where.OR = [
          { name: { contains: q, mode: 'insensitive' } },
          { industry: { contains: q, mode: 'insensitive' } },
          { location: { contains: q, mode: 'insensitive' } },
        ]
      }
    }

    const companies = await prisma.company.findMany({
      where,
      select: {
        id: true,
        name: true,
        logo: true,
        tagline: true,
        industry: true,
        location: true,
        size: true,
        _count: { select: { jobs: { where: { isActive: true } } } },
      },
      orderBy: { name: 'asc' },
      take: 30,
    })

    return NextResponse.json({ companies, ownOnly: isRecruiter })
  } catch (error) {
    console.error('Companies search error:', error)
    return NextResponse.json({ error: 'Failed to search companies' }, { status: 500 })
  }
}