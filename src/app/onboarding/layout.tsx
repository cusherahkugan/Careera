import { requireUser } from '@/lib/guard'

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireUser({ role: 'JOB_SEEKER', callbackUrl: '/onboarding' })
  return <>{children}</>
}