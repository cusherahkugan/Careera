import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * Use in a server layout. Sends visitors to /login and wrong-role users to
 * /dashboard BEFORE any page code or data is rendered.
 */
export async function requireUser(opts: { role?: 'RECRUITER' | 'JOB_SEEKER'; callbackUrl?: string } = {}) {
  let session = null
  try {
    session = await getServerSession(authOptions)
  } catch {
    session = null // revoked / broken cookie counts as signed out
  }

  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(opts.callbackUrl ?? '/dashboard')}`)
  }
  if (opts.role && session.user.role !== opts.role) {
    redirect('/dashboard')
  }
  return session
}