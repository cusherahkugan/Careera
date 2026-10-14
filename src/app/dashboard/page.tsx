'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { useSession } from 'next-auth/react'
import { Navbar } from '@/components/navbar'
import { InterviewList } from '@/components/interviews'
import { Alert } from '@/components/ui/alert'
import { errorText } from '@/lib/client'
import {
  applicationStatusColors,
  applicationStatusLabels,
  formatDate,
  getMatchScoreColor,
  getMatchScoreLabel,
} from '@/lib/utils'
import type { Application, ApplicationStatus, Company, Interview, Job, Profile } from '@/types'

type Recommendation = Job & { matchScore: number; matchAnalysis: string; matchedSkills?: string[] }

const STATUSES: ApplicationStatus[] = ['PENDING', 'REVIEWED', 'INTERVIEW', 'ACCEPTED', 'REJECTED']

export default function DashboardPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const role = session?.user.role

  const [applications, setApplications] = useState<Application[]>([])
  const [myJobs, setMyJobs] = useState<Job[]>([])
  const [company, setCompany] = useState<Company | null>(null)
  const [companyComplete, setCompanyComplete] = useState(true)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [recError, setRecError] = useState('')
  const [recLoading, setRecLoading] = useState(false)
  const [recInfo, setRecInfo] = useState<{ usedAI: boolean; usedResume: boolean } | null>(null)

  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login?callbackUrl=/dashboard')
  }, [status, router])

  const loadInterviews = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/interviews', { params: { upcoming: true } })
      setInterviews(data.interviews)
    } catch {
      /* the rest of the dashboard still works */
    }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      if (role === 'RECRUITER') {
        const [companyRes, jobsRes, appsRes] = await Promise.all([
          axios.get('/api/company'),
          axios.get('/api/jobs', { params: { limit: 50 } }),
          axios.get('/api/applications'),
        ])
        setCompany(companyRes.data.company)
        setCompanyComplete(!!companyRes.data.complete)
        setMyJobs(jobsRes.data.jobs)
        setApplications(appsRes.data.applications)
      } else {
        const [appsRes, profileRes] = await Promise.all([
          axios.get('/api/applications'),
          axios.get('/api/profile'),
        ])
        const p: Profile = profileRes.data.profile

        if (!p.onboardingCompleted) {
          router.replace('/onboarding')
          return
        }

        setProfile(p)
        setApplications(appsRes.data.applications)
      }
      await loadInterviews()
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        router.replace('/login?callbackUrl=/dashboard')
        return
      }
      setLoadError(errorText(err, 'Could not load your dashboard. Please try again.'))
    } finally {
      setLoading(false)
    }
  }, [role, router, loadInterviews])

  useEffect(() => {
    if (status === 'authenticated' && role) loadData()
  }, [status, role, loadData])

  const loadRecommendations = useCallback(async () => {
    setRecError('')
    setRecLoading(true)
    try {
      const { data } = await axios.get('/api/ai/job-recommendations')
      setRecommendations(data.recommendations)
      setRecInfo({ usedAI: data.usedAI, usedResume: data.usedResume })
      if (data.recommendations.length === 0) {
        setRecError('No strong matches yet. Try adding more skills or roles to your profile.')
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.needsProfile) {
        router.replace('/onboarding')
        return
      }
      setRecError(errorText(err, 'Could not load recommendations'))
    } finally {
      setRecLoading(false)
    }
  }, [router])

  useEffect(() => {
    if (role === 'JOB_SEEKER' && profile?.onboardingCompleted) loadRecommendations()
  }, [role, profile?.onboardingCompleted, loadRecommendations])

  const updateStatus = async (appId: string, next: ApplicationStatus) => {
    setActionError('')
    setUpdatingId(appId)
    try {
      await axios.patch(`/api/applications/${appId}`, { status: next })
      setApplications((prev) => prev.map((a) => (a.id === appId ? { ...a, status: next } : a)))
      loadInterviews()
    } catch (err) {
      setActionError(errorText(err, 'Could not update the status'))
    } finally {
      setUpdatingId(null)
    }
  }

  const toggleJob = async (job: Job) => {
    setActionError('')
    try {
      await axios.put(`/api/jobs/${job.id}`, { isActive: !job.isActive })
      setMyJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, isActive: !job.isActive } : j)))
    } catch (err) {
      setActionError(errorText(err, 'Could not update the job'))
    }
  }

  const deleteJob = async (job: Job) => {
    if (!window.confirm(`Delete "${job.title}" and all its applications? This cannot be undone.`)) return
    setActionError('')
    try {
      await axios.delete(`/api/jobs/${job.id}`)
      setMyJobs((prev) => prev.filter((j) => j.id !== job.id))
      setApplications((prev) => prev.filter((a) => a.jobId !== job.id))
    } catch (err) {
      setActionError(errorText(err, 'Could not delete the job'))
    }
  }

  const toggleCollapsed = (jobId: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(jobId)) next.delete(jobId)
      else next.add(jobId)
      return next
    })

  if (status === 'loading' || status === 'unauthenticated') {
    return <div className="min-h-screen bg-white p-8 text-zinc-500">Loading…</div>
  }

  const isRecruiter = role === 'RECRUITER'

  if (!isRecruiter && !profile && !loadError) {
    return <div className="min-h-screen bg-white p-8 text-zinc-500">Loading…</div>
  }

  const activeJobs = myJobs.filter((j) => j.isActive).length
  const h2 = 'font-serif text-xl font-bold text-zinc-900'

  // applicants grouped under the job they applied to
  const appsByJob: Record<string, Application[]> = {}
  for (const a of applications) (appsByJob[a.jobId] ??= []).push(a)

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="mx-auto max-w-4xl px-5 py-10">
        <div className="mb-10 flex items-center gap-4">
          {!isRecruiter && profile?.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.photo}
              alt=""
              className="h-16 w-16 rounded-full border border-zinc-200 object-cover"
            />
          )}
          {isRecruiter && company?.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={company.logo}
              alt=""
              className="h-16 w-16 rounded border border-zinc-200 object-contain"
            />
          )}
          <div>
            <h1 className="font-serif text-3xl font-bold text-zinc-900">
              {isRecruiter && company ? (
                <>{company.name}</>
              ) : (
                <>
                  Hello, <span className="text-red-600">{session?.user.name}</span>
                </>
              )}
            </h1>
            <p className="mt-1 text-zinc-500">
              {isRecruiter
                ? `Hello ${session?.user.name}. These are your company's jobs and the people who applied.`
                : profile?.currentDesignation || 'Your applications'}
              {isRecruiter ? (
                <>
                  {' · '}
                  <Link href="/company" className="text-red-600 hover:text-red-700">
                    Company details
                  </Link>
                </>
              ) : (
                <>
                  {' · '}
                  <Link href="/profile" className="text-red-600 hover:text-red-700">
                    Edit profile
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>

        {loadError && (
          <Alert variant="error" className="mb-6">
            {loadError}{' '}
            <button onClick={loadData} className="font-medium underline">
              Retry
            </button>
          </Alert>
        )}
        {actionError && <Alert variant="error" className="mb-6">{actionError}</Alert>}

        {isRecruiter && !loading && !companyComplete && (
          <Alert variant="info" className="mb-6">
            Add your company details before posting jobs.{' '}
            <Link href="/company" className="font-medium text-red-600 underline">
              Complete company details
            </Link>
          </Alert>
        )}

        {/* upcoming interviews: same block for both roles */}
        {interviews.length > 0 && (
          <section className="mb-12">
            <h2 className={`mb-4 ${h2}`}>Upcoming interviews</h2>
            <InterviewList
              interviews={interviews}
              role={isRecruiter ? 'RECRUITER' : 'JOB_SEEKER'}
              onChanged={() => {
                loadInterviews()
              }}
              showContext
            />
          </section>
        )}

        {isRecruiter ? (
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className={h2}>Job postings and applicants</h2>
              <Link
                href="/dashboard/jobs/new"
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Post a job
              </Link>
            </div>
            <p className="mb-4 text-sm text-zinc-500">
              {myJobs.length} postings · {activeJobs} open · {applications.length} applicants in total
              {company ? ` · ${company.members?.length ?? 1} recruiter(s)` : ''}
            </p>

            {loading ? (
              <p className="text-zinc-500">Loading…</p>
            ) : myJobs.length === 0 ? (
              <p className="text-zinc-500">Your company has not posted any jobs yet.</p>
            ) : (
              <div className="space-y-6">
                {myJobs.map((job) => {
                  const jobApps = [...(appsByJob[job.id] ?? [])].sort(
                    (a, b) => (b.aiScore ?? -1) - (a.aiScore ?? -1)
                  )
                  const isCollapsed = collapsed.has(job.id)

                  return (
                    <div key={job.id} className="rounded border border-zinc-200">
                      <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-50 px-4 py-3">
                        <div>
                          <p className="font-medium text-zinc-900">
                            {job.title}
                            {!job.isActive && (
                              <span className="ml-2 rounded border border-zinc-300 px-1.5 py-0.5 text-xs font-normal text-zinc-500">
                                Closed
                              </span>
                            )}
                          </p>
                          <p className="text-sm text-zinc-500">
                            {job.location} · {job.views} views
                            {job.recruiter?.name && ` · Posted by ${job.recruiter.name}`}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          <Link href={`/dashboard/jobs/${job.id}/edit`} className="text-zinc-600 hover:text-red-600">
                            Edit
                          </Link>
                          <button onClick={() => toggleJob(job)} className="text-zinc-600 hover:text-red-600">
                            {job.isActive ? 'Close' : 'Reopen'}
                          </button>
                          <button onClick={() => deleteJob(job)} className="text-zinc-400 hover:text-red-600">
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className="px-4 py-3">
                        <button
                          onClick={() => toggleCollapsed(job.id)}
                          className="text-sm font-medium text-red-600 hover:text-red-700"
                        >
                          {isCollapsed ? '▸' : '▾'} {jobApps.length} {jobApps.length === 1 ? 'applicant' : 'applicants'}
                        </button>

                        {!isCollapsed && (
                          <div className="mt-2">
                            {jobApps.length === 0 ? (
                              <p className="py-2 text-sm text-zinc-500">No one has applied yet.</p>
                            ) : (
                              <div className="divide-y divide-zinc-100">
                                {jobApps.map((app) => (
                                  <div
                                    key={app.id}
                                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                                  >
                                    <div>
                                      <Link
                                        href={`/applications/${app.id}`}
                                        className="font-medium text-zinc-900 hover:text-red-600"
                                      >
                                        {app.applicant?.name}
                                      </Link>{' '}
                                      <span className="text-sm text-zinc-500">· {app.applicant?.email}</span>
                                      <p className="text-sm text-zinc-500">Applied {formatDate(app.createdAt)}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      {app.aiScore !== null && (
                                        <span className={`text-sm font-semibold ${getMatchScoreColor(app.aiScore)}`}>
                                          {Math.round(app.aiScore)}%
                                        </span>
                                      )}
                                      {app.status === 'WITHDRAWN' ? (
                                        <span className="text-sm text-zinc-500">Withdrawn</span>
                                      ) : (
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
                                      )}
                                      <Link
                                        href={`/applications/${app.id}`}
                                        className="text-sm font-medium text-red-600 hover:text-red-700"
                                      >
                                        Review →
                                      </Link>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        ) : (
          <>
            <section className="mb-12">
              <div className="mb-1 flex items-center justify-between">
                <h2 className={h2}>Recommended for you</h2>
                <button
                  onClick={loadRecommendations}
                  disabled={recLoading}
                  className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-red-600 hover:text-red-600 disabled:opacity-50"
                >
                  {recLoading ? 'Looking…' : 'Refresh'}
                </button>
              </div>
              <p className="mb-4 text-sm text-zinc-500">
                Based on your skills, preferred roles
                {profile?.hasResume ? ' and your resume' : ''}.
                {!profile?.hasResume && (
                  <>
                    {' '}
                    <Link href="/profile" className="text-red-600 hover:text-red-700">
                      Upload your resume
                    </Link>{' '}
                    for sharper matches.
                  </>
                )}
                {recInfo && !recInfo.usedAI && ' (AI scoring is off, showing skill-based matches.)'}
              </p>
              {recError && <Alert variant="info" className="mb-4">{recError}</Alert>}
              {recLoading && recommendations.length === 0 && (
                <p className="text-zinc-500">Finding jobs that fit you…</p>
              )}
              <div className="divide-y divide-zinc-200 border-y border-zinc-200 empty:hidden">
                {recommendations.map((job) => (
                  <div key={job.id} className="py-4">
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-medium text-zinc-900">
                        <Link href={`/jobs/${job.id}`} className="hover:text-red-600">
                          {job.title}
                        </Link>{' '}
                        <span className="text-sm font-normal text-zinc-500">· {job.company?.name}</span>
                      </p>
                      <span
                        className={`whitespace-nowrap text-sm font-semibold ${getMatchScoreColor(job.matchScore)}`}
                      >
                        {Math.round(job.matchScore)}% · {getMatchScoreLabel(job.matchScore)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">{job.matchAnalysis}</p>
                    {job.matchedSkills && job.matchedSkills.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {job.matchedSkills.map((s) => (
                          <span key={s} className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-700">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className={h2}>My applications</h2>
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
                    <Link
                      key={app.id}
                      href={`/applications/${app.id}`}
                      className="flex items-center justify-between py-4 hover:bg-zinc-50"
                    >
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
                    </Link>
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