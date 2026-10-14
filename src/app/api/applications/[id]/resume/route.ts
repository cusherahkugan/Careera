import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCompanyId } from '@/lib/company'

interface RouteParams {
  params: Promise<{ id: string }>
}

export const runtime = 'nodejs'

// GET /api/applications/[id]/resume - the applicant's resume, for the applicant or the job's company
export async function GET(_req: Request, context: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await context.params
    const application = await prisma.application.findUnique({
      where: { id },
      include: { job: { select: { companyId: true } } },
    })

    const companyId = session.user.role === 'RECRUITER' ? await getCompanyId(session.user.id) : null
    const allowed =
      !!application &&
      (application.applicantId === session.user.id ||
        (!!companyId && application.job.companyId === companyId))

    if (!application || !allowed) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    const file = await prisma.resumeFile.findFirst({
      where: { profile: { userId: application.applicantId } },
    })
    if (!file) return NextResponse.json({ error: 'No resume uploaded' }, { status: 404 })

    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        'Content-Type': file.mime,
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.name)}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('Resume download error:', error)
    return NextResponse.json({ error: 'Failed to download resume' }, { status: 500 })
  }
}