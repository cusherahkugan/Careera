'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { useSession } from 'next-auth/react'
import { Navbar } from '@/components/navbar'
import { InterviewForm } from '@/components/interviews'
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
const BULK_OPTIONS: { value: ApplicationStatus; label: string }[] = [
  { value: 'REVIEWED', label: 'Shortlist (under review)' },
  { value: 'INTERVIEW', label: 'Move to interview stage' },
  { value: 'ACCEPTED', label: 'Accept' },
  { value: 'REJECTED', label: 'Reject' },
]
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
  const [notice, setNotice] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<ApplicationStatus>('REVIEWED')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [scheduleId, setScheduleId] = useState<string | null>(null)

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
      setSelected(new Set())
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
    setNotice('')
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
  const selectable = shown.filter((a) => a.status !== 'WITHDRAWN')
  const allSelected = selectable.length > 0 && selectable.every((a) => selected.has(a.id))

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(selectable.map((a) => a.id)))

  const applyBulk = async () => {
    const ids = [...selected]
    if (ids.length === 0) return
    if (
      bulkStatus === 'REJECTED' &&
      !window.confirm(`Reject ${ids.length} candidate(s)? Each of them will be emailed.`)
    ) {
      return
    }

    setBulkBusy(true)
    setError('')
    setNotice('')
    const results = await Promise.allSettled(
      ids.map((id) => axios.patch(`/api/applications/${id}`, { status: bulkStatus }))
    )
    const done = ids.filter((_, i) => results[i].status === 'fulfilled')
    const failed = ids.length - done.length

    setApps((prev) => prev.map((a) => (done.includes(a.id) ? { ...a, status: bulkStatus } : a)))
    setSelected(new Set())
    setBulkBusy(false)

    if (done.length > 0) {
      setNotice(
        `${done.length} candidate(s) moved to "${applicationStatusLabels[bulkStatus]}" and notified by email.`
      )
    }
    if (failed > 0) setError(`${failed} update(s) failed. Please try those again.`)
  }

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
        {notice && <Alert variant="success" className="mb-4">{notice}</Alert>}

        {selected.size > 0 && (
          <div className="sticky top-16 z-10 mb-4 flex flex-wrap items-center gap-3 rounded border border-red-200 bg-red-50 px-4 py-3">
            <span className="text-sm font-medium text-zinc-800">{selected.size} selected</span>
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value as ApplicationStatus)}
              className={selectCls}
              aria-label="Action for selected candidates"
            >
              {BULK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button
              onClick={applyBulk}
              disabled={bulkBusy}
              className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {bulkBusy ? 'Updating…' : 'Apply and email candidates'}
            </button>
            <button onClick={() => setSelected(new Set())} className="text-sm text-zinc-500 underline hover:text-red-600">
              Clear
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-zinc-500">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="text-zinc-500">No applicants match these filters.</p>
        ) : (
          <>
            <label className="mb-2 flex items-center gap-2 text-sm text-zinc-600">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              Select all
            </label>
            <div className="divide-y divide-zinc-200 border-y border-zinc-200">
              {shown.map((app) => {
                const closed = app.status === 'REJECTED' || app.status === 'WITHDRAWN'
                return (
                  <div key={app.id} className="py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${app.applicant?.name}`}
                          className="mt-1.5"
                          checked={selected.has(app.id)}
                          disabled={app.status === 'WITHDRAWN'}
                          onChange={() => toggleOne(app.id)}
                        />
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
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
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
                        {!closed && (
                          <button
                            onClick={() => setScheduleId(scheduleId === app.id ? null : app.id)}
                            className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:border-red-600 hover:text-red-600"
                          >
                            Schedule interview
                          </button>
                        )}
                        <Link href={`/applications/${app.id}`} className="text-sm font-medium text-red-600 hover:text-red-700">
                          Review →
                        </Link>
                      </div>
                    </div>

                    {scheduleId === app.id && !closed && (
                      <div className="mt-3">
                        <InterviewForm
                          applicationId={app.id}
                          onCancel={() => setScheduleId(null)}
                          onDone={() => {
                            setScheduleId(null)
                            setNotice(
                              `Interview scheduled for ${app.applicant?.name}. They were emailed a calendar invite.`
                            )
                            load()
                          }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </main>
    </div>
  )
}