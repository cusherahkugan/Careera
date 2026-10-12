'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import axios from 'axios'
import { useSession } from 'next-auth/react'
import { Navbar } from '@/components/navbar'
import { InterviewForm, InterviewList } from '@/components/interviews'
import { Alert } from '@/components/ui/alert'
import { errorText } from '@/lib/client'
import {
  applicationStatusColors,
  applicationStatusLabels,
  formatDate,
  formatDateTime,
  getMatchScoreColor,
  getMatchScoreLabel,
} from '@/lib/utils'
import type { Application, ApplicationMessage, ApplicationStatus } from '@/types'

type Exp = { title?: string; company?: string; duration?: string; description?: string }
type Edu = { degree?: string; school?: string; year?: string }

const STATUSES: ApplicationStatus[] = ['PENDING', 'REVIEWED', 'INTERVIEW', 'ACCEPTED', 'REJECTED']
const inputCls =
  'w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600'
const h2 = 'mb-3 font-serif text-xl font-bold text-zinc-900'

export default function ApplicationPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: session, status } = useSession()
  const isRecruiter = session?.user.role === 'RECRUITER'

  const [app, setApp] = useState<Application | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [newStatus, setNewStatus] = useState<ApplicationStatus>('PENDING')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const [showSchedule, setShowSchedule] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.replace(`/login?callbackUrl=/applications/${id}`)
  }, [status, router, id])

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`/api/applications/${id}`)
      setApp(data.application)
      setNewStatus(data.application.status)
      setError('')
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        router.replace(`/login?callbackUrl=/applications/${id}`)
        return
      }
      setError(errorText(err, 'Could not load this application'))
    }
  }, [id, router])

  useEffect(() => {
    if (status === 'authenticated') load()
  }, [status, load])

  // light polling so new messages show up without a refresh
  useEffect(() => {
    if (status !== 'authenticated') return
    const timer = setInterval(() => {
      axios
        .get(`/api/applications/${id}/messages`)
        .then(({ data }) => setApp((prev) => (prev ? { ...prev, messages: data.messages } : prev)))
        .catch(() => {})
    }, 20_000)
    return () => clearInterval(timer)
  }, [status, id])

  const updateStatus = async () => {
    setSaving(true)
    setNotice('')
    setError('')
    try {
      await axios.patch(`/api/applications/${id}`, { status: newStatus, note: note.trim() || undefined })
      setNote('')
      setNotice('Status updated. The candidate was notified by email.')
      await load()
    } catch (err) {
      setError(errorText(err, 'Could not update the status'))
    } finally {
      setSaving(false)
    }
  }

  const withdraw = async () => {
    if (!window.confirm('Withdraw this application? This cannot be undone.')) return
    setError('')
    try {
      await axios.patch(`/api/applications/${id}`, { status: 'WITHDRAWN' })
      await load()
    } catch (err) {
      setError(errorText(err, 'Could not withdraw the application'))
    }
  }

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    setSending(true)
    setError('')
    try {
      const { data } = await axios.post(`/api/applications/${id}/messages`, { content: text.trim() })
      const message: ApplicationMessage = data.message
      setApp((prev) => (prev ? { ...prev, messages: [...(prev.messages ?? []), message] } : prev))
      setText('')
    } catch (err) {
      setError(errorText(err, 'Could not send your message'))
    } finally {
      setSending(false)
    }
  }

  if (status !== 'authenticated' || (!app && !error)) {
    return <div className="min-h-screen bg-white p-8 text-zinc-500">Loading…</div>
  }

  if (!app) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <main className="mx-auto max-w-3xl px-5 py-10">
          <Alert variant="error">{error}</Alert>
        </main>
      </div>
    )
  }

  const candidate = app.applicant
  const profile = candidate?.profile
  const experience = (profile?.experience ?? []) as Exp[]
  const education = (profile?.education ?? []) as Edu[]
  const closed = app.status === 'REJECTED' || app.status === 'WITHDRAWN'
  const interviews = app.interviews ?? []

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <Link
          href={isRecruiter ? '/dashboard/applicants' : '/dashboard'}
          className="text-sm text-zinc-500 hover:text-red-600"
        >
          ← Back
        </Link>

        <div className="mb-8 mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-bold text-zinc-900">{app.job?.title}</h1>
            <p className="mt-1 text-zinc-500">
              {app.job?.company?.name} · {app.job?.location} · Applied {formatDate(app.createdAt)}
            </p>
            {app.job && (
              <Link href={`/jobs/${app.job.id}`} className="text-sm text-red-600 hover:text-red-700">
                View job posting
              </Link>
            )}
          </div>
          <span className={`rounded border px-3 py-1.5 text-sm font-medium ${applicationStatusColors[app.status]}`}>
            {applicationStatusLabels[app.status]}
          </span>
        </div>

        {error && <Alert variant="error" className="mb-6">{error}</Alert>}
        {notice && <Alert variant="success" className="mb-6">{notice}</Alert>}

        {/* Recruiter: candidate profile */}
        {isRecruiter && candidate && (
          <section className="mb-10">
            <h2 className={h2}>Candidate</h2>
            <div className="rounded border border-zinc-200 p-5">
              <div className="flex items-start gap-4">
                {profile?.photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.photo} alt="" className="h-16 w-16 rounded-full border border-zinc-200 object-cover" />
                )}
                <div className="flex-1">
                  <p className="text-lg font-semibold text-zinc-900">{candidate.name}</p>
                  <p className="text-sm text-zinc-500">
                    {profile?.currentDesignation || profile?.headline}
                    {profile?.location && ` · ${profile.location}`}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">
                    {profile?.contactEmail || candidate.email}
                    {profile?.phone && ` · ${profile.phone}`}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-sm">
                    {profile?.resumeFileName && (
                      <a href={`/api/applications/${app.id}/resume`} target="_blank" rel="noreferrer"
                        className="font-medium text-red-600 underline">
                        Open resume
                      </a>
                    )}
                    {profile?.linkedIn && <a href={profile.linkedIn} target="_blank" rel="noreferrer" className="text-zinc-600 underline">LinkedIn</a>}
                    {profile?.github && <a href={profile.github} target="_blank" rel="noreferrer" className="text-zinc-600 underline">GitHub</a>}
                    {profile?.portfolio && <a href={profile.portfolio} target="_blank" rel="noreferrer" className="text-zinc-600 underline">Portfolio</a>}
                  </div>
                </div>
                {app.aiScore !== null && (
                  <div className="text-right">
                    <p className={`text-2xl font-bold ${getMatchScoreColor(app.aiScore)}`}>{Math.round(app.aiScore)}%</p>
                    <p className="text-xs text-zinc-500">{getMatchScoreLabel(app.aiScore)}</p>
                  </div>
                )}
              </div>

              {app.aiNotes && <p className="mt-3 text-sm text-zinc-500">{app.aiNotes}</p>}
              {profile?.bio && <p className="mt-4 text-sm text-zinc-700">{profile.bio}</p>}

              {profile?.skills && profile.skills.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {profile.skills.map((s) => (
                    <span key={s} className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700">{s}</span>
                  ))}
                </div>
              )}

              {experience.length > 0 && (
                <div className="mt-5">
                  <p className="mb-2 text-sm font-semibold text-zinc-800">Experience</p>
                  {experience.map((x, i) => (
                    <div key={i} className="mb-3 text-sm">
                      <p className="font-medium text-zinc-900">
                        {x.title}{x.company && <span className="font-normal text-zinc-600"> · {x.company}</span>}
                      </p>
                      {x.duration && <p className="text-zinc-500">{x.duration}</p>}
                      {x.description && <p className="mt-1 text-zinc-600">{x.description}</p>}
                    </div>
                  ))}
                </div>
              )}

              {education.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-sm font-semibold text-zinc-800">Education</p>
                  {education.map((x, i) => (
                    <p key={i} className="text-sm text-zinc-700">
                      {x.degree}{x.school && ` · ${x.school}`}{x.year && ` · ${x.year}`}
                    </p>
                  ))}
                </div>
              )}

              {app.coverLetter && (
                <div className="mt-5">
                  <p className="mb-1 text-sm font-semibold text-zinc-800">Cover letter</p>
                  <p className="whitespace-pre-line text-sm text-zinc-700">{app.coverLetter}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Recruiter: status control */}
        {isRecruiter && !closed && (
          <section className="mb-10">
            <h2 className={h2}>Move this application</h2>
            <div className="space-y-3 rounded border border-zinc-200 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as ApplicationStatus)}
                  className={`${inputCls} max-w-xs`} aria-label="New status">
                  {STATUSES.map((s) => <option key={s} value={s}>{applicationStatusLabels[s]}</option>)}
                </select>
                <button onClick={updateStatus} disabled={saving || newStatus === app.status}
                  className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                  {saving ? 'Saving…' : 'Update and email candidate'}
                </button>
              </div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000}
                placeholder="Optional message included in the email (e.g. feedback or next steps)"
                className={inputCls} />
            </div>
          </section>
        )}

        {/* Seeker: withdraw */}
        {!isRecruiter && !['ACCEPTED', 'REJECTED', 'WITHDRAWN'].includes(app.status) && (
          <div className="mb-10">
            <button onClick={withdraw} className="text-sm text-zinc-500 underline hover:text-red-600">
              Withdraw my application
            </button>
          </div>
        )}

        {/* Interviews */}
        <section className="mb-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-serif text-xl font-bold text-zinc-900">Interviews</h2>
            {isRecruiter && !closed && !showSchedule && (
              <button onClick={() => setShowSchedule(true)}
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
                Schedule interview
              </button>
            )}
          </div>
          {showSchedule && (
            <div className="mb-4">
              <InterviewForm
                applicationId={app.id}
                onCancel={() => setShowSchedule(false)}
                onDone={() => {
                  setShowSchedule(false)
                  setNotice('Interview scheduled. The candidate got an email with a calendar invite.')
                  load()
                }}
              />
            </div>
          )}
          <InterviewList
            interviews={interviews}
            role={isRecruiter ? 'RECRUITER' : 'JOB_SEEKER'}
            onChanged={load}
          />
        </section>

        {/* Timeline */}
        <section className="mb-10">
          <h2 className={h2}>Timeline</h2>
          <ol className="space-y-4 border-l-2 border-zinc-200 pl-5">
            {(app.events ?? []).map((ev) => (
              <li key={ev.id} className="relative">
                <span className="absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full bg-red-600" />
                <p className="text-sm font-medium text-zinc-900">{ev.title}</p>
                {ev.note && <p className="whitespace-pre-line text-sm text-zinc-600">{ev.note}</p>}
                <p className="text-xs text-zinc-400">{formatDateTime(ev.createdAt)}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Messages */}
        <section>
          <h2 className={h2}>Messages</h2>
          <div className="mb-4 max-h-96 space-y-3 overflow-y-auto rounded border border-zinc-200 p-4">
            {(app.messages ?? []).length === 0 && (
              <p className="text-sm text-zinc-500">No messages yet. Say hello.</p>
            )}
            {(app.messages ?? []).map((m) => {
              const mine = m.senderId === session?.user.id
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded px-3 py-2 text-sm ${mine ? 'bg-red-600 text-white' : 'bg-zinc-100 text-zinc-800'}`}>
                    {!mine && <p className="mb-0.5 text-xs font-semibold text-zinc-500">{m.sender?.name}</p>}
                    <p className="whitespace-pre-line">{m.content}</p>
                    <p className={`mt-1 text-xs ${mine ? 'text-red-100' : 'text-zinc-400'}`}>
                      {formatDateTime(m.createdAt)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
          <form onSubmit={send} className="flex gap-2">
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000}
              placeholder="Write a message…" className={inputCls} />
            <button type="submit" disabled={sending || !text.trim()}
              className="rounded bg-red-600 px-5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
              Send
            </button>
          </form>
        </section>
      </main>
    </div>
  )
}