import { requireUser } from '@/lib/guard'

// Job seekers only: anyone else is redirected before any page code runs.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireUser({ role: 'JOB_SEEKER', callbackUrl: '/external-jobs' })
  return <>{children}</>
}