import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { MAX_RESUME_BYTES } from '@/lib/constants'
import { detectContact, detectSkills, extractResumeText } from '@/lib/resume'

export const runtime = 'nodejs'

// POST /api/profile/resume  (multipart form, field name: "resume")
// Reads the resume, stores its text for the AI matcher, and returns what it found
// so the onboarding form can pre-fill skills / email / phone.
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user || session.user.role !== 'JOB_SEEKER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const form = await req.formData()
    const file = form.get('resume')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Choose a resume file to upload' }, { status: 400 })
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'That file is empty' }, { status: 400 })
    }
    if (file.size > MAX_RESUME_BYTES) {
      return NextResponse.json({ error: 'Resume must be 5 MB or smaller' }, { status: 413 })
    }

    let text: string
    try {
      text = await extractResumeText(Buffer.from(await file.arrayBuffer()), file.name)
    } catch (err) {
      if (err instanceof Error && err.message === 'UNSUPPORTED_TYPE') {
        return NextResponse.json(
          { error: 'Upload a PDF, DOCX or TXT file' },
          { status: 415 }
        )
      }
      console.error('Resume read error:', err)
      return NextResponse.json({ error: 'Could not read that file. Try another copy.' }, { status: 422 })
    }

    if (text.length < 50) {
      return NextResponse.json(
        { error: 'No readable text found. Scanned PDFs are not supported - upload a text PDF or DOCX.' },
        { status: 422 }
      )
    }

    await prisma.profile.upsert({
      where: { userId: session.user.id },
      update: { resumeText: text, resumeFileName: file.name },
      create: { userId: session.user.id, resumeText: text, resumeFileName: file.name },
    })

    const contact = detectContact(text)

    return NextResponse.json({
      fileName: file.name,
      characters: text.length,
      detectedSkills: detectSkills(text),
      detectedEmail: contact.email ?? null,
      detectedPhone: contact.phone ?? null,
    })
  } catch (error) {
    console.error('Resume upload error:', error)
    return NextResponse.json({ error: 'Failed to upload resume' }, { status: 500 })
  }
}

// DELETE /api/profile/resume - remove the stored resume
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user || session.user.role !== 'JOB_SEEKER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await prisma.profile.updateMany({
      where: { userId: session.user.id },
      data: { resumeText: null, resumeFileName: null },
    })

    return NextResponse.json({ message: 'Resume removed' })
  } catch (error) {
    console.error('Resume delete error:', error)
    return NextResponse.json({ error: 'Failed to remove resume' }, { status: 500 })
  }
}