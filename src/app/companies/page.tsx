'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { useSession } from 'next-auth/react'
import { Navbar } from '@/components/navbar'
import { Alert } from '@/components/ui/alert'
import { errorText } from '@/lib/client'

type Row = {
  id: string
  name: string
  logo: string | null
  tagline: string | null
  industry: string | null
  location: string | null
  size: string | null
  _count: { jobs: number }
}

export default function CompaniesPage() {
  const { data: session, status } = useSession()
  const isRecruiter = session?.user.role === 'RECRUITER'

  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const search = useCallback(async (term: string) => {
    setLoading(true)
    setError('')
    try {
      const { data } = await axios.get('/api/companies', { params: { q: term || undefined } })
      setRows(data.companies)
    } catch (err) {
      setError(errorText(err, 'Could not load companies'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'loading') return
    const initial = isRecruiter ? '' : new URLSearchParams(window.location.search).get('q') ?? ''
    setQ(initial)
    search(initial)
  }, [status, isRecruiter, search])

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="mx-auto max-w-4xl px-5 py-10">
        <h1 className="mb-2 font-serif text-3xl font-bold text-zinc-900">
          {isRecruiter ? 'Your company' : 'Companies'}
        </h1>
        <p className="mb-6 text-zinc-600">
          {isRecruiter
            ? 'Recruiters see only their own company profile.'
            : 'Browse every company and see who is hiring.'}
        </p>

        {!isRecruiter && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              search(q.trim())
            }}
            className="mb-8 flex gap-2"
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Company name, industry or city"
              className="w-full rounded border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
            />
            <button className="rounded bg-red-600 px-6 py-3 font-medium text-white hover:bg-red-700">
              Search
            </button>
          </form>
        )}

        {error && <Alert variant="error" className="mb-6">{error}</Alert>}

        {loading ? (
          <p className="text-zinc-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-zinc-500">
            {isRecruiter ? (
              <>
                Your company profile is not set up yet.{' '}
                <Link href="/company" className="font-medium text-red-600 underline">Add company details</Link>
              </>
            ) : (
              'No companies found.'
            )}
          </p>
        ) : (
          <div className="divide-y divide-zinc-200 border-y border-zinc-200">
            {rows.map((c) => (
              <Link
                key={c.id}
                href={`/companies/${c.id}`}
                className="flex items-center gap-4 py-5 hover:bg-zinc-50"
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded border border-zinc-200 bg-zinc-100">
                  {c.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.logo} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <span className="font-serif text-xl font-bold text-zinc-400">{c.name[0]}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-zinc-900">{c.name}</p>
                  {c.tagline && <p className="truncate text-sm text-zinc-600">{c.tagline}</p>}
                  <p className="text-sm text-zinc-500">
                    {[c.industry, c.location, c.size && `${c.size} people`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className="whitespace-nowrap text-sm font-medium text-red-600">
                  {c._count.jobs} open {c._count.jobs === 1 ? 'job' : 'jobs'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}