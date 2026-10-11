'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import axios from 'axios'
import { signIn, useSession } from 'next-auth/react'
import { Alert } from '@/components/ui/alert'

const inputCls =
  'w-full rounded border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 placeholder-zinc-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600'
const labelCls = 'mb-1.5 block text-sm font-medium text-zinc-700'

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { status } = useSession()
  const defaultRole = searchParams.get('role') === 'recruiter' ? 'RECRUITER' : 'JOB_SEEKER'

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: defaultRole,
    companyName: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Already signed in (including right after we sign the new user in below):
  // the dashboard sends job seekers with an incomplete profile on to /onboarding.
  useEffect(() => {
    // `loading` is still true while we sign in and redirect ourselves below
    if (status === 'authenticated' && !loading) router.replace('/dashboard')
  }, [status, loading, router])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (formData.role === 'RECRUITER' && !formData.companyName.trim()) {
      setError('Company name is required for recruiters')
      return
    }

    setLoading(true)
    const email = formData.email.trim().toLowerCase()

    try {
      await axios.post('/api/auth/register', {
        name: formData.name,
        email,
        password: formData.password,
        role: formData.role,
        companyName: formData.companyName.trim() || undefined,
      })
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? err.response?.data?.error || 'Registration failed'
          : 'Registration failed'
      )
      setLoading(false)
      return
    }

    // Account exists now: sign straight in so the session is kept (7 days).
    const result = await signIn('credentials', {
      email,
      password: formData.password,
      redirect: false,
    })

    if (!result || result.error) {
      // account was created but auto sign-in failed; let them sign in manually
      router.push('/login')
      return
    }

    // job seekers finish their profile first; recruiters go to their dashboard
    router.push(formData.role === 'JOB_SEEKER' ? '/onboarding' : '/dashboard')
    router.refresh()
  }

  const roleBtn = (active: boolean) =>
    `rounded border py-2.5 text-sm font-medium transition ${
      active
        ? 'border-red-600 bg-red-50 text-red-700'
        : 'border-zinc-300 text-zinc-600 hover:border-zinc-400'
    }`

  if (status === 'authenticated' && !loading) return <div className="min-h-screen bg-zinc-50" />

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
          <h1 className="font-serif text-2xl font-bold text-zinc-900">Create your account</h1>
          <p className="mb-6 mt-1 text-sm text-zinc-500">It takes about a minute.</p>

          {error && <Alert variant="error" className="mb-5">{error}</Alert>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <span className={labelCls}>I am a</span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormData((p) => ({ ...p, role: 'JOB_SEEKER' }))}
                  className={roleBtn(formData.role === 'JOB_SEEKER')}
                >
                  Job seeker
                </button>
                <button
                  type="button"
                  onClick={() => setFormData((p) => ({ ...p, role: 'RECRUITER' }))}
                  className={roleBtn(formData.role === 'RECRUITER')}
                >
                  Recruiter
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="name" className={labelCls}>Full name</label>
              <input id="name" name="name" autoComplete="name" value={formData.name}
                onChange={handleChange} className={inputCls} placeholder="Jane Doe" required />
            </div>

            <div>
              <label htmlFor="email" className={labelCls}>Email address</label>
              <input id="email" name="email" type="email" autoComplete="email"
                value={formData.email} onChange={handleChange} className={inputCls}
                placeholder="you@example.com" required />
            </div>

            {formData.role === 'RECRUITER' && (
              <div>
                <label htmlFor="companyName" className={labelCls}>Company name</label>
                <input id="companyName" name="companyName" value={formData.companyName}
                  onChange={handleChange} className={inputCls} required />
              </div>
            )}

            <div>
              <label htmlFor="password" className={labelCls}>Password</label>
              <input id="password" name="password" type="password" autoComplete="new-password"
                value={formData.password} onChange={handleChange} className={inputCls}
                placeholder="At least 6 characters" required />
            </div>

            <div>
              <label htmlFor="confirmPassword" className={labelCls}>Confirm password</label>
              <input id="confirmPassword" name="confirmPassword" type="password"
                autoComplete="new-password" value={formData.confirmPassword}
                onChange={handleChange} className={inputCls} required />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-red-600 py-2.5 font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-500">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-red-600 hover:text-red-700">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-50" />}>
      <RegisterForm />
    </Suspense>
  )
}