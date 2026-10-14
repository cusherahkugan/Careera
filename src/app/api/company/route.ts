import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { isCompanyComplete, newJoinCode, recruiterContext } from '@/lib/company'

const MAX_LOGO_CHARS = 300_000

const optionalUrl = z
  .string()
  .trim()
  .url('Enter a full URL, e.g. https://example.com')
  .optional()
  .or(z.literal(''))

const logoField = z
  .string()
  .trim()
  .refine(
    (v) =>
      v === '' ||
      /^https?:\/\//i.test(v) ||
      (/^data:image\/(jpeg|png|webp);base64,/.test(v) && v.length <= MAX_LOGO_CHARS),
    'Logo must be a PNG, JPEG or WebP image under 200 KB'
  )
  .optional()

const companySchema = z.object({
  name: z.string().trim().min(2, 'Company name must be at least 2 characters').max(100),
  website: optionalUrl,
  logo: logoField,
  industry: z.string().trim().min(1, 'Industry is required').max(100),
  size: z.string().trim().max(50).optional(),
  location: z.string().trim().min(1, 'Company location is required').max(100),
  description: z
    .string()
    .trim()
    .min(20, 'Tell candidates a little about the company (at least 20 characters)')
    .max(2000, 'Description must be 2000 characters or less'),
})

const nullable = (v: string | undefined) => (v === undefined ? undefined : v.trim() === '' ? null : v.trim())

// GET /api/company - the recruiter's own company, its recruiters and its join code
export async function GET() {
  try {
    const ctx = await recruiterContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!ctx.companyId) return NextResponse.json({ company: null, complete: false })

    let company = await prisma.company.findUnique({
      where: { id: ctx.companyId },
      include: {
        members: { select: { id: true, name: true, email: true }, orderBy: { createdAt: 'asc' } },
      },
    })
    if (!company) return NextResponse.json({ company: null, complete: false })

    if (!company.joinCode) {
      await prisma.company.update({ where: { id: company.id }, data: { joinCode: newJoinCode() } })
      company = await prisma.company.findUnique({
        where: { id: ctx.companyId },
        include: {
          members: { select: { id: true, name: true, email: true }, orderBy: { createdAt: 'asc' } },
        },
      })
    }

    return NextResponse.json({ company, complete: isCompanyComplete(company!) })
  } catch (error) {
    console.error('Company fetch error:', error)
    return NextResponse.json({ error: 'Failed to load company' }, { status: 500 })
  }
}

// PUT /api/company - save the company details (any recruiter of that company)
export async function PUT(req: Request) {
  try {
    const ctx = await recruiterContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

    let company
    if (ctx.companyId) {
      company = await prisma.company.update({ where: { id: ctx.companyId }, data })
    } else {
      company = await prisma.company.create({
        data: { userId: ctx.userId, joinCode: newJoinCode(), ...data },
      })
      await prisma.user.update({ where: { id: ctx.userId }, data: { companyId: company.id } })
    }

    return NextResponse.json({ company, complete: isCompanyComplete(company) })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    console.error('Company update error:', error)
    return NextResponse.json({ error: 'Failed to save company' }, { status: 500 })
  }
}