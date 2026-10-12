import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notify'
import { messageSchema } from '@/lib/validations'

interface RouteParams {
  params: Promise<{ id: string }>
}

async function loadAccess(id: string, userId: string) {
  const application = await prisma.application.findUnique({
    where: { id },
    include: { job: { select: { title: true, recruiterId: true } } },
  })
  if (!application) return null
  const isApplicant = application.applicantId === userId
  const isRecruiter = application.job.recruiterId === userId
  if (!isApplicant && !isRecruiter) return null
  return { application, isRecruiter }
}

// GET /api/applications/[id]/messages
export async function GET(_req: Request, context: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await context.params
    if (!(await loadAccess(id, session.user.id))) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    const [messages] = await Promise.all([
      prisma.message.findMany({
        where: { applicationId: id },
        include: { sender: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.message.updateMany({
        where: { applicationId: id, senderId: { not: session.user.id }, read: false },
        data: { read: true },
      }),
    ])

    return NextResponse.json({ messages })
  } catch (error) {
    console.error('Messages fetch error:', error)
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
  }
}

// POST /api/applications/[id]/messages
export async function POST(req: Request, context: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await context.params
    const access = await loadAccess(id, session.user.id)
    if (!access) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

    const { content } = messageSchema.parse(await req.json())

    const message = await prisma.message.create({
      data: { applicationId: id, senderId: session.user.id, content },
      include: { sender: { select: { id: true, name: true } } },
    })

    const recipientId = access.isRecruiter
      ? access.application.applicantId
      : access.application.job.recruiterId

    await notify(recipientId, {
      title: `New message about ${access.application.job.title}`,
      body: `${session.user.name ?? 'Someone'}: ${content.slice(0, 300)}`,
      link: `/applications/${id}`,
    })

    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    console.error('Message send error:', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}