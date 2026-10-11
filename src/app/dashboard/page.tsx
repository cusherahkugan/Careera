'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { useSession } from 'next-auth/react'
import { Navbar } from '@/components/navbar'
import { Alert } from '@/components/ui/alert'
import {
  applicationStatusColors,
  applicationStatusLabels,
  formatDate,
  getMatchScoreColor,
  getMatchScoreLabel,
} from '@/lib/utils'
import type { Application, ApplicationStatus, Job } from '@/types'

type Recommendation = Job & { matchScore: number; matchAnalysis: string }

const STATUSES: ApplicationStatus[] = ['PENDING', 'REVIEWED', 'INTERVIEW', 'ACCEPTED', 'REJECTED']

const errorText = (err: unknown, fallback: string) =>
  axios.isAxiosError(err) ? err.response?.data?.error || fallback : fallback

export default function DashboardPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const role = session?.user.role

  const [applications, setApplications] = useState<Application[]>([])
  const [myJobs, setMyJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [recError, setRecError] = useState('')
  const [recLoading, setRecLoading] = useState(false)

  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [updateError, setUpdateError] = useState('')

  // no session -> sign-in page, and come back here afterwards
  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login?callbackUrl=/dashboard')
  }, [status, router])

  // load the data that matches the account type
  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      if (role === 'RECRUITER') {
        const [jobsRes, appsRes] = await Promise.all([
          axios.get('/api/jobs', { params: { mine: true, limit: 50 } }),
          axios.get('/api/applications'),
        ])
        setMyJobs(jobsRes.data.jobs)
        setApplications(appsRes.data.applications)
      } else {
        const { data } = await axios.get('/api/applications')
        setApplications(data.applications)
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        // session expired while the page was open
        router.replace('/login?callbackUrl=/dashboard')
        return
      }
      setLoadError(errorText(err, 'Could not load your dashboard. Please try again.'))
    } finally {
      setLoading(false)
    }
  }, [role, router])

  useEffect(() => {
    if (status === 'authenticated' && role) loadData()
  }, [status, role, loadData])

  const loadRecommendations = async () => {
    setRecError('')
    setRecLoading(true)
    try {
      const { data } = await axios.get('/api/ai/job-recommendations')
      setRecommendations(data.recommendations)
      if (data.recommendations.length === 0) {
        setRecError('No strong matches yet. Try adding more skills to your profile.')
      }
    } catch (err) {
      setRecError(errorText(err, 'Could not load recommendations'))
    } finally {
      setRecLoading(false)
    }
  }

  const updateStatus = async (appId: string, next: ApplicationStatus) => {
    setUpdateError('')
    setUpdatingId(appId)
    try {
      await axios.patch(`/api/applications/${appId}`, { status: next })
      setApplications((prev) => prev.map((a) => (a.id === appId ? { ...a, status: next } : a)))
    } catch (err) {
      setUpdateError(errorText(err, 'Could not update the status'))
    } finally {
      setUpdatingId(null)
    }
  }

  if (status === 'loading' || status === 'unauthenticated') {
    return <div className="min-h-screen bg-white p-8 text-zinc-500">Loading…</div>
  }

  const isRecruiter = role === 'RECRUITER'

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="mx-auto max-w-4xl px-5 py-10">
        <h1 className="font-serif text-3xl font-bold text-zinc-900">
          Hello, <span className="text-red-600">{session?.user.name}</span>
        </h1>
        <p className="mb-10 mt-1 text-zinc-500">
          {isRecruiter ? 'Your job postings and the people who applied' : 'Your applications'}
        </p>

        {loadError && (
          <Alert variant="error" className="mb-6">
            {loadError}{' '}
            <button onClick={loadData} className="font-medium underline">
              Retry
            </button>
          </Alert>
        )}

        {isRecruiter ? (
          <>
            <section className="mb-12">
              <h2 className="mb-4 font-serif text-xl font-bold text-zinc-900">Your job postings</h2>
              {loading ? (
                <p className="text-zinc-500">Loading…</p>
              ) : myJobs.length === 0 ? (
                <p className="text-zinc-500">You have not posted any jobs yet.</p>
              ) : (
                <div className="divide-y divide-zinc-200 border-y border-zinc-200">
                  {myJobs.map((job) => (
                    <div key={job.id} className="flex items-center justify-between py-4">
                      <div>
                        <p className="font-medium text-zinc-900">{job.title}</p>
                        <p className="text-sm text-zinc-500">
                          {job.location} · {job.views} views
                          {!job.isActive && ' · Closed'}
                        </p>
                      </div>
                      <span className="rounded border border-red-200 bg-red-50 px-3 py-1 text-sm text-red-700">
                        {job._count?.applications ?? 0} applicants
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-4 font-serif text-xl font-bold text-zinc-900">Applicants</h2>
              {updateError && <Alert variant="error" className="mb-4">{updateError}</Alert>}
              {loading ? (
                <p className="text-zinc-500">Loading…</p>
              ) : applications.length === 0 ? (
                <p className="text-zinc-500">No one has applied to your jobs yet.</p>
              ) : (
                <div className="divide-y divide-zinc-200 border-y border-zinc-200">
                  {applications.map((app) => (
                    <div key={app.id} className="py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-zinc-900">
                            {app.applicant?.name}{' '}
                            <span className="text-sm font-normal text-zinc-500">
                              · {app.applicant?.email}
                            </span>
                          </p>
                          <p className="text-sm text-zinc-500">
                            {app.job?.title} · Applied {formatDate(app.createdAt)}
                          </p>
                          {app.applicant?.profile?.headline && (
                            <p className="text-sm text-zinc-500">{app.applicant.profile.headline}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {app.aiScore !== null && (
                            <span className={`text-sm font-semibold ${getMatchScoreColor(app.aiScore)}`}>
                              {Math.round(app.aiScore)}%
                            </span>
                          )}
                          <select
                            aria-label="Application status"
                            value={app.status}
                            disabled={updatingId === app.id}
                            onChange={(e) => updateStatus(app.id, e.target.value as ApplicationStatus)}
                            className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 focus:border-red-600 focus:outline-none disabled:opacity-50"
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {applicationStatusLabels[s]}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {app.aiNotes && <p className="mt-1 text-sm text-zinc-500">{app.aiNotes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <>
            <section className="mb-12">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-serif text-xl font-bold text-zinc-900">Recommended for you</h2>
                <button
                  onClick={loadRecommendations}
                  disabled={recLoading}
                  className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {recLoading ? 'Looking…' : 'Find matches'}
                </button>
              </div>
              {recError && <Alert variant="info" className="mb-4">{recError}</Alert>}
              <div className="divide-y divide-zinc-200 border-y border-zinc-200 empty:hidden">
                {recommendations.map((job) => (
                  <div key={job.id} className="py-4">
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-medium text-zinc-900">
                        {job.title}{' '}
                        <span className="text-sm font-normal text-zinc-500">· {job.company?.name}</span>
                      </p>
                      <span
                        className={`whitespace-nowrap text-sm font-semibold ${getMatchScoreColor(job.matchScore)}`}
                      >
                        {Math.round(job.matchScore)}% · {getMatchScoreLabel(job.matchScore)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">{job.matchAnalysis}</p>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-serif text-xl font-bold text-zinc-900">My applications</h2>
                <Link href="/jobs" className="text-sm font-medium text-red-600 hover:text-red-700">
                  Browse jobs →
                </Link>
              </div>
              {loading ? (
                <p className="text-zinc-500">Loading…</p>
              ) : applications.length === 0 ? (
                <p className="text-zinc-500">You have not applied to any jobs yet.</p>
              ) : (
                <div className="divide-y divide-zinc-200 border-y border-zinc-200">
                  {applications.map((app) => (
                    <div key={app.id} className="flex items-center justify-between py-4">
                      <div>
                        <p className="font-medium text-zinc-900">{app.job?.title}</p>
                        <p className="text-sm text-zinc-500">
                          {app.job?.company?.name} · Applied {formatDate(app.createdAt)}
                        </p>
                      </div>
                      <span
                        className={`rounded border px-3 py-1 text-xs font-medium ${applicationStatusColors[app.status]}`}
                      >
                        {applicationStatusLabels[app.status]}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}