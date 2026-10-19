'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { Navbar } from '@/components/navbar'
import { Alert } from '@/components/ui/alert'
import { errorText } from '@/lib/client'
import { formatRelativeTime } from '@/lib/utils'

type ExtJob = {
  id: string
  source: string
  title: string
  company: string
  careersUrl: string | null
  location: string | null
  workMode: string | null
  jobType: string | null
  roleCategory: string | null
  salary: string | null
  summary: string | null
  requirements: string[]
  contactEmails: string[]
  tags: string[]
  url: string
  postedAt: string | null
  firstSeenAt: string
}

type Facet = { name: string; count: number }
type Facets = { companies: Facet[]; roles: Facet[]; modes: Facet[]; types: Facet[] }
type Filters = { q: string; role: string; company: string; mode: string; type: string; hasEmail: boolean }

const EMPTY: Filters = { q: '', role: '', company: '', mode: '', type: '', hasEmail: false }

const fieldCls =
  'rounded border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600'

const modeCls: Record<string, string> = {
  Remote: 'border-green-200 bg-green-50 text-green-700',
  Hybrid: 'border-amber-200 bg-amber-50 text-amber-700',
  'On-site': 'border-zinc-300 bg-zinc-50 text-zinc-700',
}

export default function ExternalJobsPage() {
  const [jobs, setJobs] = useState<ExtJob[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [filters, setFilters] = useState<Filters>(EMPTY)
  const [facets, setFacets] = useState<Facets | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const requestId = useRef(0)

  const load = useCallback(async (f: Filters, p: number, withFacets = false) => {
    const id = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const { data } = await axios.get('/api/external-jobs', {
        params: {
          q: f.q || undefined,
          role: f.role || undefined,
          company: f.company || undefined,
          mode: f.mode || undefined,
          type: f.type || undefined,
          hasEmail: f.hasEmail ? 'true' : undefined,
          page: p,
          facets: withFacets ? 1 : undefined,
        },
      })
      if (id !== requestId.current) return
      setJobs(data.jobs)
      setTotal(data.total)
      setPage(data.page)
      setPageSize(data.pageSize)
      setLastSyncedAt(data.lastSyncedAt)
      setSyncing(!!data.syncing)
      if (data.facets) setFacets(data.facets)
    } catch (e) {
      if (id === requestId.current) setError(errorText(e, 'Could not load jobs'))
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(EMPTY, 1, true)
  }, [load])

  const change = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch }
    setFilters(next)
    load(next, 1)
  }

  const clear = () => {
    setFilters(EMPTY)
    load(EMPTY, 1)
  }

  const goTo = (p: number) => {
    load(filters, p)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const pages = Math.max(1, Math.ceil(total / pageSize))
  const active = JSON.stringify(filters) !== JSON.stringify(EMPTY)

  return (
    <div className="min-h-screen bg-zinc-50">
      <Navbar />
      <main className="mx-auto max-w-5xl px-5 py-10">
        <h1 className="font-serif text-3xl font-bold text-zinc-900">Company openings</h1>
        <p className="mt-2 text-sm text-zinc-600">
          IT jobs in English, collected from Google for Jobs and job boards. Applying happens on the employer&apos;s own site.
          Refreshed once a day
          {lastSyncedAt && <>, last update {formatRelativeTime(lastSyncedAt)}</>}.
          {syncing && <span className="text-red-600"> Refreshing now…</span>}
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            load(filters, 1)
          }}
          className="mt-6 grid gap-2 md:grid-cols-4"
        >
          <input
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder="Search title, company, skill or city"
            className={`${fieldCls} md:col-span-3`}
          />
          <button className="rounded bg-red-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-red-700">
            Search
          </button>

          <select value={filters.role} onChange={(e) => change({ role: e.target.value })} className={fieldCls} aria-label="Role">
            <option value="">All roles</option>
            {facets?.roles.map((r) => (
              <option key={r.name} value={r.name}>{r.name} ({r.count})</option>
            ))}
          </select>
          <select value={filters.company} onChange={(e) => change({ company: e.target.value })} className={fieldCls} aria-label="Company">
            <option value="">All companies</option>
            {facets?.companies.map((c) => (
              <option key={c.name} value={c.name}>{c.name} ({c.count})</option>
            ))}
          </select>
          <select value={filters.mode} onChange={(e) => change({ mode: e.target.value })} className={fieldCls} aria-label="Mode of work">
            <option value="">Any mode of work</option>
            {facets?.modes.map((m) => (
              <option key={m.name} value={m.name}>{m.name} ({m.count})</option>
            ))}
          </select>
          <select value={filters.type} onChange={(e) => change({ type: e.target.value })} className={fieldCls} aria-label="Job type">
            <option value="">Any job type</option>
            {facets?.types.map((t) => (
              <option key={t.name} value={t.name}>{t.name} ({t.count})</option>
            ))}
          </select>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-zinc-600">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={filters.hasEmail} onChange={(e) => change({ hasEmail: e.target.checked })} />
            Has a contact email
          </label>
          {active && (
            <button onClick={clear} className="text-red-600 underline hover:text-red-700">
              Clear filters
            </button>
          )}
          <span className="ml-auto">{total} {total === 1 ? 'job' : 'jobs'}</span>
        </div>

        {error && <Alert variant="error" className="mt-4">{error}</Alert>}

        <div className={`mt-5 space-y-4 ${loading ? 'opacity-60' : ''}`}>
          {jobs.map((j) => {
            const expanded = open.has(j.id)
            const reqs = expanded ? j.requirements : j.requirements.slice(0, 4)
            return (
              <article key={j.id} className="rounded border border-zinc-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-900">{j.title}</h2>
                    <p className="text-sm text-zinc-700">
                      {j.careersUrl ? (
                        <a href={j.careersUrl} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-red-600">
                          {j.company} ↗
                        </a>
                      ) : (
                        <span className="font-medium">{j.company}</span>
                      )}
                      {j.location && <span className="text-zinc-500"> · {j.location}</span>}
                    </p>
                  </div>
                  <a
                    href={j.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                  >
                    Apply on company site ↗
                  </a>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {j.workMode && (
                    <span className={`rounded border px-2.5 py-1 ${modeCls[j.workMode] ?? modeCls['On-site']}`}>{j.workMode}</span>
                  )}
                  {j.roleCategory && <span className="rounded border border-red-200 bg-red-50 px-2.5 py-1 text-red-700">{j.roleCategory}</span>}
                  {j.jobType && <span className="rounded border border-zinc-300 bg-zinc-50 px-2.5 py-1 text-zinc-700">{j.jobType}</span>}
                  {j.salary && <span className="rounded border border-green-200 bg-green-50 px-2.5 py-1 text-green-700">{j.salary}</span>}
                </div>

                {j.summary && <p className="mt-3 line-clamp-3 text-sm text-zinc-600">{j.summary}</p>}

                {j.requirements.length > 0 && (
                  <div className="mt-3">
                    <p className="text-sm font-semibold text-zinc-800">Requirements</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-zinc-700">
                      {reqs.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                    {j.requirements.length > 4 && (
                      <button onClick={() => toggle(j.id)} className="mt-1 text-sm text-red-600 hover:text-red-700">
                        {expanded ? 'Show less' : `Show all ${j.requirements.length}`}
                      </button>
                    )}
                  </div>
                )}

                {j.contactEmails.length > 0 && (
                  <p className="mt-3 text-sm text-zinc-700">
                    <span className="font-semibold text-zinc-800">Contact: </span>
                    {j.contactEmails.map((e, i) => (
                      <span key={e}>
                        <a
                          href={`mailto:${e}?subject=${encodeURIComponent(`Application: ${j.title}`)}`}
                          className="text-red-600 underline"
                        >
                          {e}
                        </a>
                        {i < j.contactEmails.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </p>
                )}

                {j.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {j.tags.map((t) => (
                      <span key={t} className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">{t}</span>
                    ))}
                  </div>
                )}

                <p className="mt-3 text-xs text-zinc-400">
                  via {j.source} · {formatRelativeTime(j.postedAt ?? j.firstSeenAt)}
                </p>
              </article>
            )
          })}

          {!loading && !error && jobs.length === 0 && (
            <p className="py-10 text-center text-sm text-zinc-500">
              No jobs match these filters. If this is a fresh install, the first sync may still be running.
            </p>
          )}
        </div>

        {pages > 1 && (
          <div className="mt-6 flex items-center justify-between text-sm">
            <button
              disabled={page <= 1}
              onClick={() => goTo(page - 1)}
              className="rounded border border-zinc-300 bg-white px-4 py-2 text-zinc-700 hover:border-red-600 hover:text-red-600 disabled:opacity-40"
            >
              ← Previous
            </button>
            <span className="text-zinc-500">Page {page} of {pages}</span>
            <button
              disabled={page >= pages}
              onClick={() => goTo(page + 1)}
              className="rounded border border-zinc-300 bg-white px-4 py-2 text-zinc-700 hover:border-red-600 hover:text-red-600 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}
      </main>
    </div>
  )
}