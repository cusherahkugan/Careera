import { requireUser } from '@/lib/guard'

export default async function CalendarLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireUser({ callbackUrl: '/calendar' })
  return <>{children}</>
}