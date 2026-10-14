'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import axios from 'axios'
import { useSession } from 'next-auth/react'
import { Navbar } from '@/components/navbar'
import { Alert } from '@/components/ui/alert'
import {
  formatRelativeTime,
  formatSalary,
  getMatchScoreColor,
  jobTypeColors,
} from '@/lib/utils'
import type { Job } from '@/types'

type Notice = { type: 'error' | 'success'; text: string }
type Filters = { search: string; type: string; location: string }
type Sort = 'match' | 'new'
type JobRow = Job & { matchScore?: number; matchedSkills?: string[] }

const TYPES = [
  { value: '', label: 'All types' },
  { value: 'FULL_TIME', label: 'Full time' },
  { value: 'PART_TIME', label: 'Part time' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'INTERNSHIP', label: 'Internship' },
  { value: 'REMOTE', label: 'Remote' },
]

const fieldCls =
  'rounded border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600'

export default function JobsPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const role = session?.user.role
  const isRecruiter = role === 'RECRUITER'
  const isSeeker = role === 'JOB_SEEKER'

  const [jobs, setJobs] = useState<JobRow[]>([])
  const [filters, setFilters] = useState<Filters>({ search: '', type: '', location: '' })
  const [sort, setSort] = useState<Sort>('new')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [applied, setApplied] = useState<Set<string>>(new Set())
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [notices, setNotices] = useState<Record<string, Notice>>({})
  const requestId = useRef(0)

  const loadJobs = useCallback(async (f: Filters, p: number, s: Sort) => {
    const id = ++requestId.current
    setLoading(true)
    setLoadError('')
    try {
      const { data } = await axios.get('/api/jobs', {
        params: {
          search: f.search || undefined,
          type: f.type || undefined,
          location: f.location || undefined,
          sort: s,
          page: p,
          limit: 10,
        },
      })
      if (id !== requestId.current) return // a newer request replaced this one
      setJobs(data.jobs)
      setPage(p)
      setPages(data.pagination.pages || 1)
      setTotal(data.pagination.total)
    } catch {
      if (id === requestId.current) setLoadError('Could not load jobs. Please try again.')
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [])

  // first load once we know who the visitor is: seekers start with "Best match"
  useEffect(() => {
    if (status === 'loading') return
    const params = new URLSearchParams(window.location.search)
    const initial: Filters = {
      search: params.get('search') ?? '',
      type: params.get('type') ?? '',
      location: params.get('location') ?? '',
    }
    const initialSort: Sort = role === 'JOB_SEEKER' ? 'match' : 'new'
    setFilters(initial)
    setSort(initialSort)
    loadJobs(initial, 1, initialSort)
  }, [status, role, loadJobs])

  // remember which jobs this seeker already applied to
  useEffect(() => {
    if (status !== 'authenticated' || role !== 'JOB_SEEKER') return
    axios
      .get('/api/applications')
      .then(({ data }) =>
        setApplied(new Set<string>(data.applications.map((a: { jobId: string }) => a.jobId)))
      )
      .catch(() => {})
  }, [status, role])

  const setNotice = (jobId: string, notice: Notice) =>
    setNotices((prev) => ({ ...prev, [jobId]: notice }))

  const apply = async (jobId: string) => {
    if (status === 'loading' || applyingId) return

    if (status === 'unauthenticated') {
      router.push('/login?callbackUrl=/jobs')
      return
    }

    setApplyingId(jobId)
    setNotices((prev) => {
      const next = { ...prev }
      delete next[jobId]
      return next
    })

    try {
      await axios.post('/api/applications', { jobId })
      setApplied((prev) => new Set(prev).add(jobId))
      setNotice(jobId, { type: 'success', text: 'Application sent. Track it under "My applications".' })
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (err.response?.data?.needsProfile) {
          setNotice(jobId, { type: 'error', text: 'Please complete your profile first. Taking you there…' })
          setTimeout(() => router.push('/onboarding'), 1200)
        } else if (err.response?.status === 409) {
          setApplied((prev) => new Set(prev).add(jobId))
          setNotice(jobId, { type: 'success', text: 'You already applied to this job' })
        } else if (err.response?.status === 401) {
          router.push('/login?callbackUrl=/jobs')
        } else {
          setNotice(jobId, {
            type: 'error',
            text: err.response?.data?.error || 'Could not send your application. Try again.',
          })
        }
      } else {
        setNotice(jobId, { type: 'error', text: 'Could not send your application. Try again.' })
      }
    } finally {
      setApplyingId(null)
    }
  }

  const goTo = (p: number) => {
    loadJobs(filters, p, sort)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const changeSort = (s: Sort) => {
    setSort(s)
    loadJobs(filters, 1, s)
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="mx-auto max-w-4xl px-5 py-10">
        <h1 className="mb-6 font-serif text-3xl font-bold text-zinc-900">
          {isRecruiter ? 'Your company’s jobs' : 'Find jobs'}
        </h1>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            loadJobs(filters, 1, sort)
          }}
          className="mb-4 grid gap-2 sm:grid-cols-[1fr_9rem_9rem_auto]"
        >
          <input
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Search by title or description"
            className={fieldCls}
          />
          <select
            value={filters.type}
            onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
            aria-label="Job type"
            className={fieldCls}
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <input
            value={filters.location}
            onChange={(e) => setFilters((f) => ({ ...f, location: e.target.value }))}
            placeholder="Location"
            className={fieldCls}
          />
          <button className="rounded bg-red-600 px-6 py-3 font-medium text-white hover:bg-red-700">
            Search
          </button>
        </form>

        {isSeeker && (
          <div className="mb-6 flex items-center gap-2 text-sm text-zinc-600">
            <label htmlFor="sort">Sort by</label>
            <select
              id="sort"
              value={sort}
              onChange={(e) => changeSort(e.target.value as Sort)}
              className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-zinc-800 focus:border-red-600 focus:outline-none"
            >
              <option value="match">Best match (recommended + newest)</option>
              <option value="new">Newest first</option>
            </select>
          </div>
        )}

        {loadError && <Alert variant="error" className="mb-6">{loadError}</Alert>}

        {loading ? (
          <p className="text-zinc-500">Loading jobs…</p>
        ) : jobs.length === 0 ? (
          <p className="text-zinc-500">No jobs found.</p>
        ) : (
          <>
            <p className="mb-2 text-sm text-zinc-500">{total} {isRecruiter ? '' : 'open '}{total === 1 ? 'job' : 'jobs'}</p>
            <div className="divide-y divide-zinc-200 border-y border-zinc-200">
              {jobs.map((job) => {
                const isApplied = applied.has(job.id)
                const isApplying = applyingId === job.id
                const notice = notices[job.id]
                const showScore = sort === 'match' && job.matchScore !== undefined

                return (
                  <article key={job.id} className="py-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-semibold text-zinc-900">
                          <Link href={`/jobs/${job.id}`} className="hover:text-red-600">{job.title}</Link>
                        </h2>
                        <p className="mt-1 text-sm text-zinc-500">
                          <Link href={`/companies/${job.companyId}`} className="hover:text-red-600">
                            {job.company?.name}
                          </Link>
                          {' · '}{job.location} · {formatSalary(job.salary)} ·{' '}
                          {formatRelativeTime(job.createdAt)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`whitespace-nowrap rounded border px-2.5 py-1 text-xs font-medium ${
                            jobTypeColors[job.type] ?? ''
                          }`}
                        >
                          {job.type.replace('_', ' ')}
                        </span>
                        {showScore && (
                          <span className={`text-xs font-semibold ${getMatchScoreColor(job.matchScore!)}`}>
                            {Math.round(job.matchScore!)}% match
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="mt-3 line-clamp-2 text-zinc-600">{job.description}</p>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
                        {job.skills.map((skill) => (
                          <span key={skill} className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600">
                            {skill}
                          </span>
                        ))}
                      </div>

                      {!isRecruiter && (
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/jobs/${job.id}`}
                            className="rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:border-red-600 hover:text-red-600"
                          >
                            Details
                          </Link>
                          <button
                            data-testid="apply-btn"
                            onClick={() => apply(job.id)}
                            disabled={status === 'loading' || isApplying || isApplied}
                            className={`rounded px-5 py-2 text-sm font-medium transition ${
                              isApplied
                                ? 'cursor-default border border-zinc-300 bg-zinc-50 text-zinc-500'
                                : 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-60'
                            }`}
                          >
                            {isApplied ? 'Applied' : isApplying ? 'Applying…' : 'Apply'}
                          </button>
                        </div>
                      )}
                    </div>

                    {notice && (
                      <Alert variant={notice.type} className="mt-4">
                        {notice.text}
                      </Alert>
                    )}
                  </article>
                )
              })}
            </div>

            {pages > 1 && (
              <div className="mt-6 flex items-center justify-between text-sm">
                <button
                  onClick={() => goTo(page - 1)}
                  disabled={page <= 1}
                  className="rounded border border-zinc-300 px-4 py-2 text-zinc-700 hover:border-red-600 hover:text-red-600 disabled:opacity-40"
                >
                  ← Previous
                </button>
                <span className="text-zinc-500">Page {page} of {pages}</span>
                <button
                  onClick={() => goTo(page + 1)}
                  disabled={page >= pages}
                  className="rounded border border-zinc-300 px-4 py-2 text-zinc-700 hover:border-red-600 hover:text-red-600 disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}