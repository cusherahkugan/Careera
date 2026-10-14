'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { useSession } from 'next-auth/react'
import { Navbar } from '@/components/navbar'
import { Alert } from '@/components/ui/alert'
import { errorText } from '@/lib/client'
import type { Company } from '@/types'

const inputCls =
  'w-full rounded border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 placeholder-zinc-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600'
const labelCls = 'mb-1.5 block text-sm font-medium text-zinc-700'
const ghostBtn =
  'rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:border-red-600 hover:text-red-600'

/** Shrink the logo to max 200px so the stored data URL stays small. */
function resizeLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const max = 200
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('canvas'))
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      let out = canvas.toDataURL('image/png')
      if (out.length > 280_000) out = canvas.toDataURL('image/jpeg', 0.8)
      resolve(out)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image'))
    }
    img.src = url
  })
}

export default function CompanyPage() {
  const router = useRouter()
  const { status } = useSession()

  const [form, setForm] = useState({
    name: '',
    website: '',
    industry: '',
    size: '',
    location: '',
    description: '',
  })
  const [logo, setLogo] = useState('')
  const [company, setCompany] = useState<Company | null>(null)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [copied, setCopied] = useState(false)
  const logoInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login?callbackUrl=/company')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    axios
      .get('/api/company')
      .then(({ data }) => {
        const c: Company | null = data.company
        if (c) {
          setCompany(c)
          setLogo(c.logo ?? '')
          setForm({
            name: c.name ?? '',
            website: c.website ?? '',
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

  const onLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file (PNG, JPG or WebP)')
      return
    }
    try {
      setError('')
      setLogo(await resizeLogo(file))
    } catch {
      setError('Could not read that image. Try another one.')
    }
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      const { data } = await axios.put('/api/company', { ...form, logo })
      setCompany((prev) => ({ ...(prev ?? data.company), ...data.company, members: prev?.members }))
      setSuccess('Company details saved. You can now post jobs, and candidates will see them on your postings.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(errorText(err, 'Could not save your company'))
    } finally {
      setSaving(false)
    }
  }

  const copyCode = async () => {
    if (!company?.joinCode) return
    try {
      await navigator.clipboard.writeText(company.joinCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  if (status !== 'authenticated' || !ready) {
    return <div className="min-h-screen bg-white p-8 text-zinc-500">Loading…</div>
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Navbar />
      <main className="mx-auto max-w-2xl px-5 py-10">
        <h1 className="font-serif text-3xl font-bold text-zinc-900">Company details</h1>
        <p className="mb-8 mt-2 text-zinc-600">
          Candidates see this on every job your company posts. Fill it in once to start posting jobs.
        </p>

        {error && <Alert variant="error" className="mb-6">{error}</Alert>}
        {success && (
          <Alert variant="success" className="mb-6">
            {success}{' '}
            <Link href="/dashboard/jobs/new" className="font-medium underline">Post a job</Link>
          </Alert>
        )}

        <form onSubmit={save} className="space-y-5 rounded border border-zinc-200 bg-white p-6 md:p-8">
          <div className="flex items-center gap-5">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded border border-zinc-300 bg-zinc-100">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="Company logo" className="h-full w-full object-contain" />
              ) : (
                <span className="px-2 text-center text-xs text-zinc-400">No logo</span>
              )}
            </div>
            <div className="flex flex-col items-start gap-2">
              <input ref={logoInput} type="file" accept="image/*" onChange={onLogo} className="hidden" />
              <button type="button" onClick={() => logoInput.current?.click()} className={ghostBtn}>
                {logo ? 'Change logo' : 'Upload logo'}
              </button>
              {logo && (
                <button type="button" onClick={() => setLogo('')} className="text-sm text-zinc-500 underline hover:text-red-600">
                  Remove
                </button>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="name" className={labelCls}>Company name</label>
            <input id="name" name="name" value={form.name} onChange={change} className={inputCls} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="industry" className={labelCls}>Industry</label>
              <input id="industry" name="industry" value={form.industry} onChange={change}
                placeholder="Technology" className={inputCls} required />
            </div>
            <div>
              <label htmlFor="size" className={labelCls}>Company size</label>
              <input id="size" name="size" value={form.size} onChange={change}
                placeholder="50-200" className={inputCls} />
            </div>
            <div>
              <label htmlFor="location" className={labelCls}>Location</label>
              <input id="location" name="location" value={form.location} onChange={change}
                placeholder="Colombo, Sri Lanka" className={inputCls} required />
            </div>
            <div>
              <label htmlFor="website" className={labelCls}>Website</label>
              <input id="website" name="website" type="url" value={form.website} onChange={change}
                placeholder="https://example.com" className={inputCls} />
            </div>
          </div>
          <div>
            <label htmlFor="description" className={labelCls}>
              About the company <span className="font-normal text-zinc-400">({form.description.length}/2000)</span>
            </label>
            <textarea id="description" name="description" rows={6} maxLength={2000} minLength={20}
              value={form.description} onChange={change} className={inputCls} required />
          </div>
          <button type="submit" disabled={saving}
            className="w-full rounded bg-red-600 py-3 font-medium text-white hover:bg-red-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save company details'}
          </button>
        </form>

        {company && (
          <section className="mt-8 rounded border border-zinc-200 bg-white p-6 md:p-8">
            <h2 className="font-serif text-xl font-bold text-zinc-900">Your recruiting team</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Everyone below sees all of {company.name}&apos;s jobs and applicants. To add a recruiter, share this
              code. They enter it when they register.
            </p>
            {company.joinCode && (
              <div className="mt-4 flex items-center gap-3">
                <code className="rounded border border-zinc-300 bg-zinc-50 px-4 py-2 text-lg font-semibold tracking-widest text-zinc-900">
                  {company.joinCode}
                </code>
                <button type="button" onClick={copyCode} className={ghostBtn}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}
            <ul className="mt-5 divide-y divide-zinc-200 border-y border-zinc-200 text-sm">
              {(company.members ?? []).map((m) => (
                <li key={m.id} className="flex justify-between py-3">
                  <span className="font-medium text-zinc-900">{m.name}</span>
                  <span className="text-zinc-500">{m.email}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  )
}