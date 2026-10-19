import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/external-jobs?q=&role=&company=&mode=&type=&hasEmail=&source=&page=&facets=1
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const p = new URL(req.url).searchParams
    const q = p.get('q')?.trim()
    const role = p.get('role')
    const company = p.get('company')
    const mode = p.get('mode')
    const type = p.get('type')
    const source = p.get('source')
    const hasEmail = p.get('hasEmail') === 'true'
    const wantFacets = p.get('facets') === '1'
    const page = Math.max(1, Number(p.get('page')) || 1)
    const pageSize = 20

    // only readable postings are ever shown
    const base: Prisma.ExternalJobWhereInput = { isActive: true, summary: { not: null } }

    const where: Prisma.ExternalJobWhereInput = { ...base }
    const and: Prisma.ExternalJobWhereInput[] = []

    if (q) {
      and.push({
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { company: { contains: q, mode: 'insensitive' } },
          { location: { contains: q, mode: 'insensitive' } },
          { summary: { contains: q, mode: 'insensitive' } },
          { tags: { has: q } },
        ],
      })
    }
    if (hasEmail) and.push({ NOT: { contactEmails: { isEmpty: true } } })
    if (and.length) where.AND = and

    if (role) where.roleCategory = role
    if (company) where.company = company
    if (mode) where.workMode = mode
    if (type) where.jobType = type
    if (source) where.source = source

    const [jobs, total, lastSync] = await Promise.all([
      prisma.externalJob.findMany({
        where,
        orderBy: [{ postedAt: { sort: 'desc', nulls: 'last' } }, { firstSeenAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.externalJob.count({ where }),
      prisma.externalJobSyncLog.findFirst({ where: { error: null }, orderBy: { ranAt: 'desc' } }),
    ])

    let facets = undefined
    if (wantFacets) {
      const [companies, roles, modes, types] = await Promise.all([
        prisma.externalJob.groupBy({
          by: ['company'],
          where: base,
          _count: { company: true },
          orderBy: { _count: { company: 'desc' } },
          take: 100,
        }),
        prisma.externalJob.groupBy({
          by: ['roleCategory'],
          where: base,
          _count: { roleCategory: true },
          orderBy: { _count: { roleCategory: 'desc' } },
        }),
        prisma.externalJob.groupBy({
          by: ['workMode'],
          where: base,
          _count: { workMode: true },
          orderBy: { _count: { workMode: 'desc' } },
        }),
        prisma.externalJob.groupBy({
          by: ['jobType'],
          where: base,
          _count: { jobType: true },
          orderBy: { _count: { jobType: 'desc' } },
        }),
      ])
      facets = {
        companies: companies.map((r) => ({ name: r.company, count: r._count.company })),
        roles: roles.filter((r) => r.roleCategory).map((r) => ({ name: r.roleCategory!, count: r._count.roleCategory })),
        modes: modes.filter((r) => r.workMode).map((r) => ({ name: r.workMode!, count: r._count.workMode })),
        types: types.filter((r) => r.jobType).map((r) => ({ name: r.jobType!, count: r._count.jobType })),
      }
    }

    return NextResponse.json({
      jobs,
      total,
      page,
      pageSize,
      facets,
      syncing: false,
      lastSyncedAt: lastSync?.ranAt ?? null,
    })
  } catch (error) {
    console.error('External jobs error:', error)
    return NextResponse.json({ error: 'Failed to load external jobs' }, { status: 500 })
  }
}