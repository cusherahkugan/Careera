import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { MIN_SKILLS } from '@/lib/constants'
import { profileSchema } from '@/lib/validations'

/** '' (cleared field) is stored as null; undefined means "leave unchanged". */
const nullable = (v: string | undefined) => (v === undefined ? undefined : v.trim() === '' ? null : v.trim())

const profileInclude = {
  user: { select: { name: true, email: true, image: true } },
} satisfies Prisma.ProfileInclude

// GET /api/profile  (a job seeker without a profile row gets an empty one)
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let profile = await prisma.profile.findUnique({
      where: { userId: session.user.id },
      include: profileInclude,
    })

    if (!profile && session.user.role === 'JOB_SEEKER') {
      profile = await prisma.profile.create({
        data: { userId: session.user.id },
        include: profileInclude,
      })
    }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // the extracted resume text is large and the browser never needs it
    const { resumeText, ...safe } = profile
    return NextResponse.json({ profile: { ...safe, hasResume: !!resumeText } })
  } catch (error) {
    console.error('Profile fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 })
  }
}

// PUT /api/profile - save onboarding / profile edits (job seekers)
export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user || session.user.role !== 'JOB_SEEKER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name, ...fields } = profileSchema.parse(await req.json())

    // de-duplicate skills ignoring case ("react" + "React")
    const skills = fields.skills
      ? [...new Map<string, string>(fields.skills.map((s) => [s.toLowerCase(), s] as [string, string])).values()]
      : undefined

    const data = {
      photo: nullable(fields.photo),
      phone: nullable(fields.phone),
      contactEmail: nullable(fields.contactEmail),
      currentDesignation: nullable(fields.currentDesignation),
      location: nullable(fields.location),
      headline: nullable(fields.headline),
      bio: nullable(fields.bio),
      resumeUrl: nullable(fields.resumeUrl),
      linkedIn: nullable(fields.linkedIn),
      github: nullable(fields.github),
      portfolio: nullable(fields.portfolio),
      preferredRoles: fields.preferredRoles,
      skills,
      experience: fields.experience as Prisma.InputJsonValue[] | undefined,
      education: fields.education as Prisma.InputJsonValue[] | undefined,
    }

    if (name) {
      await prisma.user.update({ where: { id: session.user.id }, data: { name } })
    }

    const saved = await prisma.profile.upsert({
      where: { userId: session.user.id },
      update: data,
      create: { userId: session.user.id, ...data },
    })

    const complete =
      !!saved.photo &&
      !!saved.phone &&
      !!saved.contactEmail &&
      !!saved.currentDesignation &&
      saved.preferredRoles.length >= 1 &&
      saved.skills.length >= MIN_SKILLS

    let profile = saved
    if (complete !== saved.onboardingCompleted) {
      profile = await prisma.profile.update({
        where: { id: saved.id },
        data: { onboardingCompleted: complete },
      })
    }

    const { resumeText, ...safe } = profile
    return NextResponse.json({ profile: { ...safe, hasResume: !!resumeText }, complete })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message ?? 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Profile update error:', error)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}