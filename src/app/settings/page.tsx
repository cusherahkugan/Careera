'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { signOut, useSession } from 'next-auth/react'
import { Navbar } from '@/components/navbar'
import { Alert } from '@/components/ui/alert'
import { errorText } from '@/lib/client'
import { formatDateTime } from '@/lib/utils'

const inputCls =
  'w-full rounded border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600'

export default function SettingsPage() {
  const router = useRouter()
  const { data: session, status } = useSession()

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [revoking, setRevoking] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login?callbackUrl=/settings')
  }, [status, router])

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (next !== confirm) return setError('New passwords do not match')

    setSaving(true)
    try {
      await axios.post('/api/account/password', { currentPassword: current, newPassword: next })
      // every session (this one too) was revoked on the server
      await signOut({ callbackUrl: '/login' })
    } catch (err) {
      setError(errorText(err, 'Could not change your password'))
      setSaving(false)
    }
  }

  const signOutEverywhere = async () => {
    if (!window.confirm('Sign out of every device, including this one?')) return
    setRevoking(true)
    try {
      await axios.delete('/api/account/sessions')
      await signOut({ callbackUrl: '/login' })
    } catch (err) {
      setError(errorText(err, 'Could not sign out other devices'))
      setRevoking(false)
    }
  }

  if (status !== 'authenticated') {
    return <div className="min-h-screen bg-white p-8 text-zinc-500">Loading…</div>
  }

  const h2 = 'font-serif text-xl font-bold text-zinc-900'

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="mx-auto max-w-2xl px-5 py-10">
        <h1 className="mb-8 font-serif text-3xl font-bold text-zinc-900">Account settings</h1>

        {error && <Alert variant="error" className="mb-6">{error}</Alert>}

        <section className="mb-10">
          <h2 className={`mb-3 ${h2}`}>Account</h2>
          <dl className="divide-y divide-zinc-200 border-y border-zinc-200 text-sm">
            <div className="flex justify-between py-3"><dt className="text-zinc-500">Name</dt><dd>{session.user.name}</dd></div>
            <div className="flex justify-between py-3"><dt className="text-zinc-500">Email</dt><dd>{session.user.email}</dd></div>
            <div className="flex justify-between py-3">
              <dt className="text-zinc-500">Account type</dt>
              <dd>{session.user.role === 'RECRUITER' ? 'Recruiter' : 'Job seeker'}</dd>
            </div>
          </dl>
        </section>

        <section className="mb-10">
          <h2 className={`mb-3 ${h2}`}>Sessions</h2>
          <p className="mb-4 text-sm text-zinc-600">
            This session stays valid until {formatDateTime(session.expires)}. If you used a shared
            computer or think someone else has access, sign out everywhere.
          </p>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => signOut({ callbackUrl: '/' })}
              className="rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:border-red-600 hover:text-red-600">
              Sign out of this device
            </button>
            <button onClick={signOutEverywhere} disabled={revoking}
              className="rounded border border-red-600 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
              {revoking ? 'Signing out…' : 'Sign out everywhere'}
            </button>
          </div>
        </section>

        <section>
          <h2 className={`mb-3 ${h2}`}>Change password</h2>
          <p className="mb-4 text-sm text-zinc-600">
            You will be signed out on every device after changing it.
          </p>
          <form onSubmit={changePassword} className="space-y-4">
            <input type="password" placeholder="Current password" autoComplete="current-password"
              value={current} onChange={(e) => setCurrent(e.target.value)} className={inputCls} required />
            <input type="password" placeholder="New password (min 6 characters)" autoComplete="new-password"
              value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} required />
            <input type="password" placeholder="Repeat new password" autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} required />
            <button type="submit" disabled={saving}
              className="rounded bg-red-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Change password'}
            </button>
          </form>
        </section>
      </main>
    </div>
  )
}