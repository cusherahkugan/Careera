'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { signOut, useSession } from 'next-auth/react'
import { formatRelativeTime } from '@/lib/utils'
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

export function Navbar() {
  const { data: session, status } = useSession()
  const role = session?.user.role

  const link = 'text-zinc-600 hover:text-red-600'

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-2 px-5 py-4">
        <Link href="/" className="font-serif text-2xl font-bold tracking-tight text-zinc-900">
          Careera<span className="text-red-600">.</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-5 text-sm">
          {/* job seekers (and visitors) browse the job board; recruiters only work with their company */}
          {role !== 'RECRUITER' && (
            <Link href="/jobs" className={link}>
              Jobs
            </Link>
          )}
          <Link href="/companies" className={link}>
            {role === 'RECRUITER' ? 'Find companies' : 'Companies'}
          </Link>
          {status === 'loading' ? null : session ? (
            <>
              {role === 'RECRUITER' ? (
                <>
                  <Link href="/dashboard" className={link}>Company dashboard</Link>
                  <Link href="/dashboard/applicants" className={link}>Applicants</Link>
                  <Link href="/dashboard/jobs/new" className={link}>Post a job</Link>
                  <Link href="/company" className={link}>Company profile</Link>
                </>
              ) : (
                <>
                  <Link href="/dashboard" className={link}>My applications</Link>
                  <Link href="/profile" className={link}>My profile</Link>
                </>
              )}
              <NotificationBell />
              <Link href="/settings" className="hidden text-zinc-400 hover:text-red-600 sm:inline">
                {session.user.name}
                <span className="ml-2 rounded border border-zinc-200 px-1.5 py-0.5 text-xs text-zinc-500">
                  {role === 'RECRUITER' ? 'Recruiter' : 'Job seeker'}
                </span>
              </Link>
              <button onClick={() => signOut({ callbackUrl: '/' })} className={link}>
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}