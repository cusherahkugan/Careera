import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { newJoinCode } from '@/lib/company'
import { registerSchema } from '@/lib/validations'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const data = registerSchema.parse(body)

    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    })

    if (existingUser) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 400 })
    }

    // recruiter joining an existing company with its code
    let joinCompanyId: string | null = null
    if (data.role === 'RECRUITER' && data.joinCode) {
      const company = await prisma.company.findUnique({
        where: { joinCode: data.joinCode.trim().toUpperCase() },
        select: { id: true },
      })
      if (!company) {
        return NextResponse.json({ error: 'That company code is not valid' }, { status: 400 })
      }
      joinCompanyId = company.id
    }

    const hashedPassword = await bcrypt.hash(data.password, 10)
    const select = { id: true, email: true, name: true, role: true } as const

    const user = await prisma.$transaction(async (tx) => {
      if (data.role === 'JOB_SEEKER') {
        return tx.user.create({
          data: {
            email: data.email,
            password: hashedPassword,
            name: data.name,
            role: 'JOB_SEEKER',
            profile: { create: {} },
          },
          select,
        })
      }

      if (joinCompanyId) {
        return tx.user.create({
          data: {
            email: data.email,
            password: hashedPassword,
            name: data.name,
            role: 'RECRUITER',
            companyId: joinCompanyId,
          },
          select,
        })
      }

      // new company: this recruiter owns it and is its first member
      const created = await tx.user.create({
        data: {
          email: data.email,
          password: hashedPassword,
          name: data.name,
          role: 'RECRUITER',
          ownedCompany: { create: { name: data.companyName!, joinCode: newJoinCode() } },
        },
        select: { ...select, ownedCompany: { select: { id: true } } },
      })
      await tx.user.update({
        where: { id: created.id },
        data: { companyId: created.ownedCompany!.id },
      })
      return { id: created.id, email: created.email, name: created.name, role: created.role }
    })

    return NextResponse.json({ user }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message ?? 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Registration error:', error)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}