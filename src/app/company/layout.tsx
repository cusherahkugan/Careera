import { requireUser } from '@/lib/guard'

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireUser({ role: 'RECRUITER', callbackUrl: '/company' })
  return <>{children}</>
}