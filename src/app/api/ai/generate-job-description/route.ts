import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { generateJobDescription } from '@/lib/ai'

const schema = z.object({
  title: z.string().trim().min(3),
  skills: z.array(z.string()).default([]),
  type: z.string().default('FULL_TIME'),
})

// POST /api/ai/generate-job-description (recruiters)
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || session.user.role !== 'RECRUITER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { title, skills, type } = schema.parse(await req.json())
    const description = await generateJobDescription(title, skills, type)

    if (!description) {
      return NextResponse.json(
        { error: 'AI writing is not available right now. Please write the description yourself.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ description })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Add a job title first' }, { status: 400 })
    }
    console.error('Generate description error:', error)
    return NextResponse.json({ error: 'Failed to generate description' }, { status: 500 })
  }
}