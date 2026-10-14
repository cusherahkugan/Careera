import { requireUser } from '@/lib/guard'

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireUser({ callbackUrl: '/dashboard' })
  return <>{children}</>
}