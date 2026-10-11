'use client'

import { useEffect, useState } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Alert } from '@/components/ui/alert'

const inputCls =
  'w-full rounded border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 placeholder-zinc-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600'

// only follow same-site paths so ?callbackUrl= can't be used as an open redirect
function safeCallback(): string {
  const cb = new URLSearchParams(window.location.search).get('callbackUrl')
  return cb && cb.startsWith('/') && !cb.startsWith('//') ? cb : '/dashboard'
}

export default function LoginPage() {
  const router = useRouter()
  const { status } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // already signed in? no reason to see the login form
  useEffect(() => {
    if (status === 'authenticated') router.replace(safeCallback())
  }, [status, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      })

      if (!result || result.error) {
        setError('Invalid email or password')
        setLoading(false)
        return
      }

      router.push(safeCallback())
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  if (status === 'authenticated') return <div className="min-h-screen bg-zinc-50" />

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-8 block text-center font-serif text-3xl font-bold tracking-tight text-zinc-900"
        >
          Careera<span className="text-red-600">.</span>
        </Link>

        <div className="rounded border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="font-serif text-2xl font-bold text-zinc-900">Sign in</h1>
          <p className="mb-6 mt-1 text-sm text-zinc-500">Welcome back.</p>

          {error && <Alert variant="error" className="mb-5">{error}</Alert>}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-zinc-700">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-zinc-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-red-600 py-2.5 font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-500">
            New here?{' '}
            <Link href="/register" className="font-medium text-red-600 hover:text-red-700">
              Create an account
            </Link>
          </p>

          <div className="mt-6 border-t border-zinc-200 pt-4 text-xs text-zinc-500">
            <p className="mb-2 font-medium text-zinc-600">Demo accounts</p>
            <p>Job seeker: seeker@example.com / password123</p>
            <p>Recruiter: recruiter@example.com / password123</p>
          </div>
        </div>
      </div>
    </div>
  )
}