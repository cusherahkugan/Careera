'use client'

import { useEffect, useRef } from 'react'
import type { Session } from 'next-auth'
import { SessionProvider, signOut, useSession } from 'next-auth/react'

const ALIVE_KEY = 'careera:alive'
const BEAT_MS = 5_000
// Background tabs can be throttled to one timer tick a minute, so allow a bit more.
const STALE_MS = 75_000

/**
 * Ends the login when the browser was closed.
 *
 * While any tab is open, it writes a heartbeat timestamp to localStorage.
 * If a page loads signed in and the heartbeat is stale, no tab was open in
 * between (browser or all tabs closed), so the user is signed out.
 * Refreshing and opening extra tabs keep working because the heartbeat is
 * still fresh.
 */
function SessionGuard() {
  const { status } = useSession()
  const checked = useRef(false)

  useEffect(() => {
    if (status === 'unauthenticated') {
      // on the login page: forget the old heartbeat so a new login starts clean
      try {
        localStorage.removeItem(ALIVE_KEY)
      } catch {
        /* storage blocked */
      }
      checked.current = false
      return
    }
    if (status !== 'authenticated') return

    const beat = () => {
      try {
        localStorage.setItem(ALIVE_KEY, String(Date.now()))
      } catch {
        /* storage blocked */
      }
    }

    if (!checked.current) {
      checked.current = true
      let last = 0
      try {
        last = Number(localStorage.getItem(ALIVE_KEY)) || 0
      } catch {
        /* storage blocked */
      }
      if (last && Date.now() - last > STALE_MS) {
        try {
          localStorage.removeItem(ALIVE_KEY)
        } catch {
          /* storage blocked */
        }
        // hard navigation so no cached logged-in page can be shown
        signOut({ redirect: false }).then(() => window.location.assign('/login'))
        return
      }
    }

    beat()
    const timer = setInterval(beat, BEAT_MS)
    document.addEventListener('visibilitychange', beat)
    window.addEventListener('pagehide', beat)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', beat)
      window.removeEventListener('pagehide', beat)
    }
  }, [status])

  return null
}

export function Providers({
  children,
  session,
}: {
  children: React.ReactNode
  session: Session | null
}) {
  return (
    <SessionProvider session={session} refetchOnWindowFocus refetchInterval={5 * 60}>
      <SessionGuard />
      {children}
    </SessionProvider>
  )
}