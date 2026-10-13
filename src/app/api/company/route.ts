import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const optionalUrl = z
  .string()
  .trim()
  .url('Enter a full URL, e.g. https://example.com')
  .optional()
  .or(z.literal(''))

const companySchema = z.object({
  name: z.string().trim().min(2, 'Company name must be at least 2 characters').max(100),
  website: optionalUrl,
  logo: optionalUrl,
  industry: z.string().trim().max(100).optional(),
  size: z.string().trim().max(50).optional(),
  location: z.string().trim().max(100).optional(),
  description: z.string().trim().max(2000, 'Description must be 2000 characters or less').optional(),
})

const nullable = (v: string | undefined) => (v === undefined ? undefined : v.trim() === '' ? null : v.trim())

// GET /api/company - the recruiter's own company
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || session.user.role !== 'RECRUITER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const company = await prisma.company.findUnique({ where: { userId: session.user.id } })
    return NextResponse.json({ company })
  } catch (error) {
    console.error('Company fetch error:', error)
    return NextResponse.json({ error: 'Failed to load company' }, { status: 500 })
  }
}

// PUT /api/company - create or update the recruiter's company
export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || session.user.role !== 'RECRUITER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const input = companySchema.parse(await req.json())
    const data = {
      name: input.name,
      website: nullable(input.website),
      logo: nullable(input.logo),
      industry: nullable(input.industry),
      size: nullable(input.size),
      location: nullable(input.location),
      description: nullable(input.description),
    }

    const company = await prisma.company.upsert({
      where: { userId: session.user.id },
      update: data,
      create: { userId: session.user.id, ...data },
    })

    return NextResponse.json({ company })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    console.error('Company update error:', error)
    return NextResponse.json({ error: 'Failed to save company' }, { status: 500 })
  }
}