import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/companies?q=acme
//  - seekers / visitors: browse or search companies
//  - recruiters: ONLY when they type a search (at least 2 characters),
//    so they never get a list of competitors handed to them
export async function GET(req: Request) {
  try {
    const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
    const session = await getServerSession(authOptions)
    const isRecruiter = session?.user?.role === 'RECRUITER'

    if (isRecruiter && q.length < 2) {
      return NextResponse.json({ companies: [], needsSearch: true })
    }

    // companies that never finished their profile stay hidden
    const where: Prisma.CompanyWhereInput = { description: { not: null }, industry: { not: null } }
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { industry: { contains: q, mode: 'insensitive' } },
        { location: { contains: q, mode: 'insensitive' } },
      ]
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

    return NextResponse.json({ companies })
  } catch (error) {
    console.error('Companies search error:', error)
    return NextResponse.json({ error: 'Failed to search companies' }, { status: 500 })
  }
}