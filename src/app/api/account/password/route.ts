import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { passwordChangeSchema } from '@/lib/validations'

// POST /api/account/password
// Changes the password and signs the user out of every device (tokenVersion + 1).
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { currentPassword, newPassword } = passwordChangeSchema.parse(await req.json())

    const user = await prisma.user.findUnique({ where: { id: session.user.id } })
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }
    if (currentPassword === newPassword) {
      return NextResponse.json({ error: 'Choose a different password' }, { status: 400 })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(newPassword, 10), tokenVersion: { increment: 1 } },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    console.error('Password change error:', error)
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 })
  }
}