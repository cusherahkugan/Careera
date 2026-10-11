'use client'

import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'

export function Navbar() {
  const { data: session, status } = useSession()
  const role = session?.user.role

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="font-serif text-2xl font-bold tracking-tight text-zinc-900">
          Careera<span className="text-red-600">.</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/jobs" className="text-zinc-600 hover:text-red-600">
            Jobs
          </Link>
          {status === 'loading' ? null : session ? (
            <>
              <Link href="/dashboard" className="text-zinc-600 hover:text-red-600">
                {role === 'RECRUITER' ? 'My postings' : 'My applications'}
              </Link>
              {role === 'JOB_SEEKER' && (
                <Link href="/onboarding" className="text-zinc-600 hover:text-red-600">
                  My profile
                </Link>
              )}
              <span className="hidden text-zinc-400 sm:inline">
                {session.user.name}
                <span className="ml-2 rounded border border-zinc-200 px-1.5 py-0.5 text-xs text-zinc-500">
                  {role === 'RECRUITER' ? 'Recruiter' : 'Job seeker'}
                </span>
              </span>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="text-zinc-600 hover:text-red-600"
              >
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