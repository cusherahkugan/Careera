import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/external-jobs?q=&mode=&source=&page=
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const p = new URL(req.url).searchParams
    const q = p.get('q')?.trim()
    const mode = p.get('mode')
    const source = p.get('source')
    const page = Math.max(1, Number(p.get('page')) || 1)
    const pageSize = 20

    const where: Prisma.ExternalJobWhereInput = { isActive: true }
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { company: { contains: q, mode: 'insensitive' } },
        { tags: { has: q } },
      ]
    }
    if (mode === 'Remote') where.workMode = 'Remote'
    if (source) where.source = source

    const [jobs, total, lastSync] = await Promise.all([
      prisma.externalJob.findMany({
        where,
        orderBy: [{ postedAt: 'desc' }, { firstSeenAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.externalJob.count({ where }),
      prisma.externalJobSyncLog.findFirst({ where: { error: null }, orderBy: { ranAt: 'desc' } }),
    ])

    return NextResponse.json({
      jobs,
      total,
      page,
      pageSize,
      lastSyncedAt: lastSync?.ranAt ?? null,
    })
  } catch (error) {
    console.error('External jobs error:', error)
    return NextResponse.json({ error: 'Failed to load external jobs' }, { status: 500 })
  }
}