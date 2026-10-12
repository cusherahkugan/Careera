'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { useSession } from 'next-auth/react'
import { Navbar } from '@/components/navbar'
import { Alert } from '@/components/ui/alert'
import { errorText } from '@/lib/client'
import {
  applicationStatusColors,
  applicationStatusLabels,
  formatDate,
  getMatchScoreColor,
} from '@/lib/utils'
import type { Application, ApplicationStatus, Job } from '@/types'

const STATUSES: ApplicationStatus[] = ['PENDING', 'REVIEWED', 'INTERVIEW', 'ACCEPTED', 'REJECTED']
const selectCls =
  'rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 focus:border-red-600 focus:outline-none'

export default function ApplicantsPage() {
  const router = useRouter()
  const { status } = useSession()

  const [jobs, setJobs] = useState<Job[]>([])
  const [apps, setApps] = useState<Application[]>([])
  const [jobId, setJobId] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortByScore, setSortByScore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  // honour ?jobId= from the dashboard
  useEffect(() => {
    setJobId(new URLSearchParams(window.location.search).get('jobId') ?? '')
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login?callbackUrl=/dashboard/applicants')
    if (status === 'authenticated') {
      axios.get('/api/jobs', { params: { mine: true, limit: 50 } })
        .then(({ data }) => setJobs(data.jobs))
        .catch(() => {})
    }
  }, [status, router])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await axios.get('/api/applications', {
        params: { jobId: jobId || undefined, status: statusFilter || undefined },
      })
      setApps(data.applications)
    } catch (err) {
      setError(errorText(err, 'Could not load applicants'))
    } finally {
      setLoading(false)
    }
  }, [jobId, statusFilter])

  useEffect(() => {
    if (status === 'authenticated') load()
  }, [status, load])

  const updateStatus = async (id: string, next: ApplicationStatus) => {
    setUpdatingId(id)
    setError('')
    try {
      await axios.patch(`/api/applications/${id}`, { status: next })
      setApps((prev) => prev.map((a) => (a.id === id ? { ...a, status: next } : a)))
    } catch (err) {
      setError(errorText(err, 'Could not update the status'))
    } finally {
      setUpdatingId(null)
    }
  }

  const shown = sortByScore ? [...apps].sort((a, b) => (b.aiScore ?? -1) - (a.aiScore ?? -1)) : apps

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="mx-auto max-w-4xl px-5 py-10">
        <h1 className="mb-6 font-serif text-3xl font-bold text-zinc-900">Applicants</h1>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <select value={jobId} onChange={(e) => setJobId(e.target.value)} className={selectCls} aria-label="Filter by job">
            <option value="">All jobs</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls} aria-label="Filter by status">
            <option value="">Any status</option>
            {[...STATUSES, 'WITHDRAWN' as ApplicationStatus].map((s) => (
              <option key={s} value={s}>{applicationStatusLabels[s]}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <input type="checkbox" checked={sortByScore} onChange={(e) => setSortByScore(e.target.checked)} />
            Best match first
          </label>
        </div>

        {error && <Alert variant="error" className="mb-4">{error}</Alert>}

        {loading ? (
          <p className="text-zinc-500">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="text-zinc-500">No applicants match these filters.</p>
        ) : (
          <div className="divide-y divide-zinc-200 border-y border-zinc-200">
            {shown.map((app) => (
              <div key={app.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <Link href={`/applications/${app.id}`} className="font-medium text-zinc-900 hover:text-red-600">
                    {app.applicant?.name}
                  </Link>
                  <p className="text-sm text-zinc-500">
                    {app.job?.title} · Applied {formatDate(app.createdAt)}
                  </p>
                  {app.applicant?.profile?.headline && (
                    <p className="text-sm text-zinc-500">{app.applicant.profile.headline}</p>
                  )}
                  {app.aiNotes && <p className="mt-1 max-w-lg text-xs text-zinc-400">{app.aiNotes}</p>}
                </div>
                <div className="flex items-center gap-3">
                  {app.aiScore !== null && (
                    <span className={`text-sm font-semibold ${getMatchScoreColor(app.aiScore)}`}>
                      {Math.round(app.aiScore)}%
                    </span>
                  )}
                  {app.status === 'WITHDRAWN' ? (
                    <span className={`rounded border px-3 py-1 text-xs ${applicationStatusColors.WITHDRAWN}`}>
                      Withdrawn
                    </span>
                  ) : (
                    <select
                      aria-label="Application status"
                      value={app.status}
                      disabled={updatingId === app.id}
                      onChange={(e) => updateStatus(app.id, e.target.value as ApplicationStatus)}
                      className={`${selectCls} disabled:opacity-50`}
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{applicationStatusLabels[s]}</option>)}
                    </select>
                  )}
                  <Link href={`/applications/${app.id}`} className="text-sm font-medium text-red-600 hover:text-red-700">
                    Review →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}