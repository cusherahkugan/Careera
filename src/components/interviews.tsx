'use client'

import { useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { Alert } from '@/components/ui/alert'
import { errorText } from '@/lib/client'
import {
  formatDateTime,
  interviewStatusColors,
  interviewStatusLabels,
  toLocalInput,
} from '@/lib/utils'
import type { Interview, InterviewMode } from '@/types'

const MODES: Record<InterviewMode, string> = {
  VIDEO: 'Video call',
  PHONE: 'Phone call',
  ONSITE: 'On-site',
}

const inputCls =
  'w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600'

/** Schedule a new interview, or (with `interview`) reschedule an existing one. */
export function InterviewForm({
  applicationId,
  interview,
  onDone,
  onCancel,
}: {
  applicationId: string
  interview?: Interview
  onDone: () => void
  onCancel: () => void
}) {
  const [when, setWhen] = useState(interview ? toLocalInput(interview.scheduledAt) : '')
  const [duration, setDuration] = useState(interview?.durationMins ?? 30)
  const [mode, setMode] = useState<InterviewMode>(interview?.mode ?? 'VIDEO')
  const [location, setLocation] = useState(interview?.location ?? '')
  const [notes, setNotes] = useState(interview?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!when) return setError('Pick a date and time')

    setSaving(true)
    try {
      const payload = {
        scheduledAt: new Date(when).toISOString(),
        durationMins: Number(duration),
        mode,
        location: location.trim(),
        notes: notes.trim(),
      }
      if (interview) {
        await axios.patch(`/api/interviews/${interview.id}`, { action: 'reschedule', ...payload })
      } else {
        await axios.post('/api/interviews', { applicationId, ...payload })
      }
      onDone()
    } catch (err) {
      setError(errorText(err, 'Could not save the interview'))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded border border-zinc-200 bg-zinc-50 p-4">
      {error && <Alert variant="error">{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-zinc-600">Date and time (your timezone)</label>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls} required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Minutes</label>
          <input type="number" min={10} max={480} step={5} value={duration}
            onChange={(e) => setDuration(Number(e.target.value))} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Format</label>
          <select value={mode} onChange={(e) => setMode(e.target.value as InterviewMode)} className={inputCls}>
            {Object.entries(MODES).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-zinc-600">Meeting link or address</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)}
            placeholder="https://meet.google.com/..." className={inputCls} />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Notes for the candidate (optional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
          {saving ? 'Saving…' : interview ? 'Reschedule and notify' : 'Schedule and notify candidate'}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:border-zinc-400">
          Close
        </button>
      </div>
    </form>
  )
}

export function InterviewList({
  interviews,
  role,
  onChanged,
  showContext = false,
}: {
  interviews: Interview[]
  role: 'JOB_SEEKER' | 'RECRUITER'
  onChanged: () => void
  /** show the job / candidate name (dashboard) instead of just the time (application page) */
  showContext?: boolean
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const act = async (id: string, action: string, extra: Record<string, unknown> = {}) => {
    setError('')
    setBusyId(id)
    try {
      await axios.patch(`/api/interviews/${id}`, { action, ...extra })
      onChanged()
    } catch (err) {
      setError(errorText(err, 'Could not update the interview'))
    } finally {
      setBusyId(null)
    }
  }

  const decline = (id: string) => {
    const reason = window.prompt('Let the recruiter know why you cannot attend (optional):')
    if (reason === null) return
    act(id, 'decline', { notes: reason })
  }

  if (interviews.length === 0) return <p className="text-sm text-zinc-500">No interviews yet.</p>

  const btn = 'rounded border px-3 py-1 text-xs font-medium disabled:opacity-50'

  return (
    <div className="space-y-3">
      {error && <Alert variant="error">{error}</Alert>}
      {interviews.map((i) => {
        const active = i.status === 'SCHEDULED' || i.status === 'CONFIRMED'
        const app = i.application
        const isLink = !!i.location && /^https?:\/\//i.test(i.location)

        return (
          <div key={i.id} className="rounded border border-zinc-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                {showContext && app && (
                  <Link href={`/applications/${app.id}`} className="font-medium text-zinc-900 hover:text-red-600">
                    {role === 'RECRUITER' ? app.applicant?.name : app.job?.title}
                    <span className="font-normal text-zinc-500">
                      {' · '}
                      {role === 'RECRUITER' ? app.job?.title : app.job?.company?.name}
                    </span>
                  </Link>
                )}
                <p className="text-sm font-medium text-zinc-900">{formatDateTime(i.scheduledAt)}</p>
                <p className="text-sm text-zinc-500">
                  {i.durationMins} min · {MODES[i.mode]}
                  {i.location && (
                    <>
                      {' · '}
                      {isLink ? (
                        <a href={i.location} target="_blank" rel="noreferrer" className="text-red-600 underline">
                          Join link
                        </a>
                      ) : (
                        i.location
                      )}
                    </>
                  )}
                </p>
                {i.notes && <p className="mt-1 text-sm text-zinc-600">{i.notes}</p>}
              </div>
              <span className={`rounded border px-2.5 py-1 text-xs font-medium ${interviewStatusColors[i.status]}`}>
                {interviewStatusLabels[i.status]}
              </span>
            </div>

            {active && (
              <div className="mt-3 flex flex-wrap gap-2">
                {role === 'JOB_SEEKER' ? (
                  <>
                    {i.status === 'SCHEDULED' && (
                      <button onClick={() => act(i.id, 'confirm')} disabled={busyId === i.id}
                        className={`${btn} border-green-600 bg-green-600 text-white hover:bg-green-700`}>
                        Confirm
                      </button>
                    )}
                    <button onClick={() => decline(i.id)} disabled={busyId === i.id}
                      className={`${btn} border-zinc-300 text-zinc-700 hover:border-red-600 hover:text-red-600`}>
                      Can&apos;t attend
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setEditingId(editingId === i.id ? null : i.id)}
                      className={`${btn} border-zinc-300 text-zinc-700 hover:border-red-600 hover:text-red-600`}>
                      Reschedule
                    </button>
                    <button onClick={() => act(i.id, 'complete')} disabled={busyId === i.id}
                      className={`${btn} border-zinc-300 text-zinc-700 hover:border-zinc-500`}>
                      Mark completed
                    </button>
                    <button
                      onClick={() => window.confirm('Cancel this interview and notify the candidate?') && act(i.id, 'cancel')}
                      disabled={busyId === i.id}
                      className={`${btn} border-zinc-300 text-zinc-500 hover:border-red-600 hover:text-red-600`}>
                      Cancel
                    </button>
                  </>
                )}
              </div>
            )}

            {editingId === i.id && (
              <div className="mt-3">
                <InterviewForm
                  applicationId={i.applicationId}
                  interview={i}
                  onCancel={() => setEditingId(null)}
                  onDone={() => {
                    setEditingId(null)
                    onChanged()
                  }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}