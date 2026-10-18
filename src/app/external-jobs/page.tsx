'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { useSession } from 'next-auth/react'
import { Navbar } from '@/components/navbar' // <- use `import Navbar from ...` if default export

type ExtJob = {
  id: string
  source: string
  title: string
  company: string
  location: string | null
  workMode: string | null
  jobType: string | null
  salary: string | null
  summary: string | null
  tags: string[]
  url: string
  postedAt: string | null
  firstSeenAt: string
}

export default function ExternalJobsPage() {
  useSession()
  const [jobs, setJobs] = useState<ExtJob[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [remoteOnly, setRemoteOnly] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    axios
      .get('/api/external-jobs', {
        params: { q: query || undefined, mode: remoteOnly ? 'Remote' : undefined, page },
      })
      .then((res) => {
        if (cancelled) return
        setJobs(res.data.jobs)
        setTotal(res.data.total)
        setPageSize(res.data.pageSize)
        setLastSyncedAt(res.data.lastSyncedAt)
      })
      .catch((e) => !cancelled && setError(e?.response?.data?.error || 'Could not load jobs'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [query, remoteOnly, page])

  const pages = Math.max(1, Math.ceil(total / pageSize))
  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null

  return (
    <div className="min-h-screen bg-zinc-50">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="font-serif text-3xl text-zinc-900">Jobs from around the web</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Software and full-stack roles collected from external job boards. Links open the original
          posting.
          {lastSyncedAt && <> Last updated {new Date(lastSyncedAt).toLocaleString()}.</>}
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            setPage(1)
            setQuery(q)
          }}
          className="mt-5 flex flex-wrap items-center gap-3"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, company or skill"
            className="min-w-60 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-600"
          />
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={remoteOnly}
              onChange={(e) => {
                setPage(1)
                setRemoteOnly(e.target.checked)
              }}
            />
            Remote only
          </label>
          <button className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            Search
          </button>
        </form>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className={`mt-6 space-y-4 ${loading ? 'opacity-60' : ''}`}>
          {jobs.map((j) => (
            <article key={j.id} className="rounded-xl border border-zinc-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">{j.title}</h2>
                  <p className="text-sm text-zinc-700">{j.company}</p>
                </div>
                <a
                  href={j.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  View posting ↗
                </a>
              </div>

              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {j.workMode && <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-700">{j.workMode}</span>}
                {j.location && <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-700">{j.location}</span>}
                {j.jobType && <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-700">{j.jobType}</span>}
                {j.salary && <span className="rounded-full bg-green-50 px-2.5 py-1 text-green-700">{j.salary}</span>}
              </div>

              {j.summary && <p className="mt-3 text-sm text-zinc-600">{j.summary}</p>}

              {j.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {j.tags.map((t) => (
                    <span key={t} className="rounded bg-red-50 px-2 py-0.5 text-[11px] text-red-700">
                      {t}
                    </span>
                  ))}
                </div>
              )}

              <p className="mt-3 text-xs text-zinc-400">
                via {j.source}
                {fmt(j.postedAt) && <> · posted {fmt(j.postedAt)}</>}
              </p>
            </article>
          ))}

          {!loading && !error && jobs.length === 0 && (
            <p className="py-10 text-center text-sm text-zinc-500">
              No external jobs yet. They appear after the first sync runs.
            </p>
          )}
        </div>

        {pages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-3 text-sm">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-zinc-600">
              Page {page} of {pages}
            </span>
            <button
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </main>
    </div>
  )
}