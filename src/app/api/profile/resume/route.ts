import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { MAX_RESUME_BYTES } from '@/lib/constants'
import { parseResume } from '@/lib/ai'
import { detectContact, detectSkills, extractResumeText } from '@/lib/resume'

export const runtime = 'nodejs'

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/plain',
}

// POST /api/profile/resume  (multipart form, field name: "resume")
// Stores the file + its text, detects skills/contact, and (when an OpenAI key
// exists) parses experience/education so the form can pre-fill them.
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

    const buffer = Buffer.from(await file.arrayBuffer())

    let text: string
    try {
      text = await extractResumeText(buffer, file.name)
    } catch (err) {
      if (err instanceof Error && err.message === 'UNSUPPORTED_TYPE') {
        return NextResponse.json({ error: 'Upload a PDF, DOCX or TXT file' }, { status: 415 })
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

    const profile = await prisma.profile.upsert({
      where: { userId: session.user.id },
      update: { resumeText: text, resumeFileName: file.name },
      create: { userId: session.user.id, resumeText: text, resumeFileName: file.name },
    })

    const ext = file.name.toLowerCase().split('.').pop() ?? ''
    const fileData = {
      name: file.name,
      mime: MIME[ext] ?? 'application/octet-stream',
      data: buffer,
    }
    await prisma.resumeFile.upsert({
      where: { profileId: profile.id },
      update: fileData,
      create: { profileId: profile.id, ...fileData },
    })

    const contact = detectContact(text)

    // optional AI parsing - never blocks the upload for long
    const parsed = await Promise.race([
      parseResume(text.slice(0, 12000)),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 12000)),
    ])

    return NextResponse.json({
      fileName: file.name,
      characters: text.length,
      detectedSkills: detectSkills(text),
      detectedEmail: contact.email ?? null,
      detectedPhone: contact.phone ?? null,
      parsed,
    })
  } catch (error) {
    console.error('Resume upload error:', error)
    return NextResponse.json({ error: 'Failed to upload resume' }, { status: 500 })
  }
}

// GET /api/profile/resume - download my own resume
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const file = await prisma.resumeFile.findFirst({
      where: { profile: { userId: session.user.id } },
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

// DELETE /api/profile/resume - remove the stored resume
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user || session.user.role !== 'JOB_SEEKER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await prisma.resumeFile.deleteMany({ where: { profile: { userId: session.user.id } } })
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