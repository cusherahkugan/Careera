'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { useSession } from 'next-auth/react'
import { Navbar } from '@/components/navbar'
import { Alert } from '@/components/ui/alert'
import { errorText } from '@/lib/client'

const inputCls =
  'w-full rounded border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 placeholder-zinc-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600'
const labelCls = 'mb-1.5 block text-sm font-medium text-zinc-700'

export default function CompanyPage() {
  const router = useRouter()
  const { status } = useSession()

  const [form, setForm] = useState({
    name: '',
    website: '',
    logo: '',
    industry: '',
    size: '',
    location: '',
    description: '',
  })
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login?callbackUrl=/company')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    axios
      .get('/api/company')
      .then(({ data }) => {
        const c = data.company
        if (c) {
          setForm({
            name: c.name ?? '',
            website: c.website ?? '',
            logo: c.logo ?? '',
            industry: c.industry ?? '',
            size: c.size ?? '',
            location: c.location ?? '',
            description: c.description ?? '',
          })
        }
      })
      .catch((err) => setError(errorText(err, 'Could not load your company')))
      .finally(() => setReady(true))
  }, [status])

  const change = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      await axios.put('/api/company', form)
      setSuccess('Company profile saved. Candidates will see it on your job postings.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(errorText(err, 'Could not save your company'))
    } finally {
      setSaving(false)
    }
  }

  if (status !== 'authenticated' || !ready) {
    return <div className="min-h-screen bg-white p-8 text-zinc-500">Loading…</div>
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Navbar />
      <main className="mx-auto max-w-2xl px-5 py-10">
        <h1 className="font-serif text-3xl font-bold text-zinc-900">Company profile</h1>
        <p className="mb-8 mt-2 text-zinc-600">This is shown to candidates on every job you post.</p>

        {error && <Alert variant="error" className="mb-6">{error}</Alert>}
        {success && <Alert variant="success" className="mb-6">{success}</Alert>}

        <form onSubmit={save} className="space-y-5 rounded border border-zinc-200 bg-white p-6 md:p-8">
          <div>
            <label htmlFor="name" className={labelCls}>Company name</label>
            <input id="name" name="name" value={form.name} onChange={change} className={inputCls} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="industry" className={labelCls}>Industry</label>
              <input id="industry" name="industry" value={form.industry} onChange={change}
                placeholder="Technology" className={inputCls} />
            </div>
            <div>
              <label htmlFor="size" className={labelCls}>Company size</label>
              <input id="size" name="size" value={form.size} onChange={change}
                placeholder="50-200" className={inputCls} />
            </div>
            <div>
              <label htmlFor="location" className={labelCls}>Location</label>
              <input id="location" name="location" value={form.location} onChange={change}
                placeholder="Colombo, Sri Lanka" className={inputCls} />
            </div>
            <div>
              <label htmlFor="website" className={labelCls}>Website</label>
              <input id="website" name="website" type="url" value={form.website} onChange={change}
                placeholder="https://example.com" className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="logo" className={labelCls}>Logo URL (optional)</label>
              <input id="logo" name="logo" type="url" value={form.logo} onChange={change}
                placeholder="https://example.com/logo.png" className={inputCls} />
            </div>
          </div>
          <div>
            <label htmlFor="description" className={labelCls}>
              About the company <span className="font-normal text-zinc-400">({form.description.length}/2000)</span>
            </label>
            <textarea id="description" name="description" rows={6} maxLength={2000}
              value={form.description} onChange={change} className={inputCls} />
          </div>
          <button type="submit" disabled={saving}
            className="w-full rounded bg-red-600 py-3 font-medium text-white hover:bg-red-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save company profile'}
          </button>
        </form>
      </main>
    </div>
  )
}