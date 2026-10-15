'use client'

import type { Session } from 'next-auth'
import { SessionProvider } from 'next-auth/react'

export function Providers({
  children,
  session,
}: {
  children: React.ReactNode
  session: Session | null
}) {
  return (
    <SessionProvider session={session} refetchOnWindowFocus refetchInterval={5 * 60}>
      {children}
    </SessionProvider>
  )
}