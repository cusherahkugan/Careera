import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// DELETE /api/account/sessions - sign out of ALL devices (this one included)
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await prisma.user.update({
      where: { id: session.user.id },
      data: { tokenVersion: { increment: 1 } },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Revoke sessions error:', error)
    return NextResponse.json({ error: 'Failed to sign out other devices' }, { status: 500 })
  }
}