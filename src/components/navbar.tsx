'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import axios from 'axios'
import { signOut, useSession } from 'next-auth/react'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { AppNotification } from '@/types'

function NotificationBell() {
  const router = useRouter()
  const [items, setItems] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)

  const load = useCallback(() => {
    axios
      .get('/api/notifications')
      .then(({ data }) => {
        setItems(data.notifications)
        setUnread(data.unreadCount)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 60_000)
    return () => clearInterval(timer)
  }, [load])

  const openItem = async (n: AppNotification) => {
    setOpen(false)
    if (!n.read) {
      await axios.patch('/api/notifications', { id: n.id }).catch(() => {})
      load()
    }
    if (n.link) router.push(n.link)
  }

  const markAll = async () => {
    await axios.patch('/api/notifications', {}).catch(() => {})
    load()
  }

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o)
          if (!open) load()
        }}
        aria-label="Notifications"
        className="relative text-zinc-600 hover:text-red-600"
      >
        Alerts
        {unread > 0 && (
          <span className="ml-1 rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-80 rounded border border-zinc-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2">
            <span className="text-sm font-medium text-zinc-800">Notifications</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs text-red-600 hover:text-red-700">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-zinc-500">Nothing yet.</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={`block w-full border-b border-zinc-100 px-4 py-3 text-left hover:bg-zinc-50 ${
                    n.read ? '' : 'bg-red-50/50'
                  }`}
                >
                  <p className="text-sm font-medium text-zinc-900">{n.title}</p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{n.body}</p>}
                  <p className="mt-1 text-xs text-zinc-400">{formatRelativeTime(n.createdAt)}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * A nav link that highlights itself when the current page belongs to it.
 * `match` lists extra path prefixes that should also count as "active"
 * (e.g. /applications/... highlights "My applications").
 * `exact` = only highlight on the exact path (used for /dashboard, which is
 * the parent of other nav targets).
 */
function NavLink({
  href,
  pathname,
  exact = false,
  match = [],
  className,
  children,
}: {
  href: string
  pathname: string
  exact?: boolean
  match?: string[]
  className?: string
  children: React.ReactNode
}) {
  const under = (base: string) => pathname === base || pathname.startsWith(base + '/')
  const active = exact ? pathname === href || match.some(under) : under(href) || match.some(under)

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'border-b-2 pb-0.5 transition-colors',
        active
          ? 'border-red-600 font-semibold text-red-600'
          : 'border-transparent text-zinc-600 hover:text-red-600',
        className
      )}
    >
      {children}
    </Link>
  )
}

export function Navbar() {
  const { data: session, status } = useSession()
  const pathname = usePathname() ?? ''
  const role = session?.user.role
  const isRecruiter = role === 'RECRUITER'
  const loggedIn = status === 'authenticated' && !!session
  const visitor = status === 'unauthenticated'

  // Hard navigation clears Next's client router cache, so no logged-in page
  // can be shown from cache after signing out.
  const handleSignOut = async () => {
    await signOut({ redirect: false })
    window.location.assign('/')
  }

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-2 px-5 py-4">
        <Link href="/" className="font-serif text-2xl font-bold tracking-tight text-zinc-900">
          Careera<span className="text-red-600">.</span>
        </Link>

        <nav className="flex flex-wrap items-center gap-5 text-sm">
          {visitor && (
            <>
              <NavLink href="/jobs" pathname={pathname}>Jobs</NavLink>
              <NavLink href="/companies" pathname={pathname}>Companies</NavLink>
              <Link
                href="/register?role=recruiter"
                className="hidden border-b-2 border-transparent pb-0.5 text-zinc-600 hover:text-red-600 sm:inline"
              >
                For employers
              </Link>
              <NavLink href="/login" pathname={pathname}>Sign in</NavLink>
              <Link
                href="/register"
                className="rounded bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700"
              >
                Join free
              </Link>
            </>
          )}

          {loggedIn && !isRecruiter && (
            <>
              <NavLink href="/jobs" pathname={pathname}>Jobs</NavLink>
              <NavLink href="/companies" pathname={pathname}>Companies</NavLink>
              <NavLink href="/dashboard" pathname={pathname} exact match={['/applications']}>
                My applications
              </NavLink>
              <NavLink href="/profile" pathname={pathname}>My profile</NavLink>
              <NavLink href="/calendar" pathname={pathname}>Calendar</NavLink>
              <NavLink href="/external-jobs" pathname={pathname}>Web jobs</NavLink>
            </>
          )}

          {loggedIn && isRecruiter && (
            <>
              <NavLink href="/dashboard" pathname={pathname} exact>Company dashboard</NavLink>
              <NavLink href="/dashboard/applicants" pathname={pathname} match={['/applications']}>
                Applicants
              </NavLink>
              <NavLink href="/dashboard/jobs/new" pathname={pathname} match={['/dashboard/jobs']}>
                Post a job
              </NavLink>
              <NavLink href="/company" pathname={pathname}>Company profile</NavLink>
            </>
          )}

          {loggedIn && (
            <>
              <NotificationBell />
              <Link
                href="/settings"
                aria-current={pathname === '/settings' ? 'page' : undefined}
                className={cn(
                  'hidden sm:inline',
                  pathname === '/settings' ? 'font-semibold text-red-600' : 'text-zinc-400 hover:text-red-600'
                )}
              >
                {session?.user.name}
                <span className="ml-2 rounded border border-zinc-200 px-1.5 py-0.5 text-xs text-zinc-500">
                  {isRecruiter ? 'Recruiter' : 'Job seeker'}
                </span>
              </Link>
              <button onClick={handleSignOut} className="text-zinc-600 hover:text-red-600">
                Sign out
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}