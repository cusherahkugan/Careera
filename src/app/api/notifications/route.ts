import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/notifications - latest 20 + unread count
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.notification.count({ where: { userId: session.user.id, read: false } }),
    ])

    return NextResponse.json({ notifications, unreadCount })
  } catch (error) {
    console.error('Notifications fetch error:', error)
    return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 })
  }
}

// PATCH /api/notifications  { id? } - mark one (or, without id, all) as read
export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = z.object({ id: z.string().optional() }).parse(await req.json().catch(() => ({})))

    await prisma.notification.updateMany({
      where: { userId: session.user.id, read: false, ...(id ? { id } : {}) },
      data: { read: true },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Notifications update error:', error)
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 })
  }
}