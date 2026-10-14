import { randomBytes } from 'crypto'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** Short code other recruiters use to join a company. */
export const newJoinCode = () => randomBytes(4).toString('hex').toUpperCase()

/**
 * The company a recruiter works for. Older accounts only have an "owned"
 * company, so link them to it the first time we see them.
 */
export async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true, ownedCompany: { select: { id: true } } },
  })
  if (!user) return null
  if (user.companyId) return user.companyId
  if (user.ownedCompany) {
    await prisma.user.update({ where: { id: userId }, data: { companyId: user.ownedCompany.id } })
    return user.ownedCompany.id
  }
  return null
}

/** Session + company for a signed-in recruiter, or null. */
export async function recruiterContext() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'RECRUITER') return null
  const companyId = await getCompanyId(session.user.id)
  return { session, userId: session.user.id, companyId }
}

export function isCompanyComplete(c: {
  name?: string | null
  industry?: string | null
  location?: string | null
  description?: string | null
}): boolean {
  return !!(c.name?.trim() && c.industry?.trim() && c.location?.trim() && c.description?.trim())
}