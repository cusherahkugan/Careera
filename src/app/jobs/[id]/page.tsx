'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import axios from 'axios'
import { useSession } from 'next-auth/react'
import { Navbar } from '@/components/navbar'
import { Alert } from '@/components/ui/alert'
import { errorText } from '@/lib/client'
import { formatRelativeTime, formatSalary, jobTypeColors } from '@/lib/utils'
import type { Job } from '@/types'

type FullJob = Job & {
  company?: Job['company'] & { website?: string | null; industry?: string | null; size?: string | null; description?: string | null }
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { status, data: session } = useSession()
  const role = session?.user.role

  const [job, setJob] = useState<FullJob | null>(null)
  const [loadError, setLoadError] = useState('')
  const [applicationId, setApplicationId] = useState<string | null>(null)
  const [cover, setCover] = useState('')
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    axios
      .get(`/api/jobs/${id}`)
      .then(({ data }) => setJob(data.job))
      .catch((err) => setLoadError(errorText(err, 'Could not load this job')))
  }, [id])

  useEffect(() => {
    if (status !== 'authenticated' || role !== 'JOB_SEEKER') return
    axios
      .get('/api/applications')
      .then(({ data }) => {
        const found = (data.applications as { id: string; jobId: string }[]).find((a) => a.jobId === id)
        if (found) setApplicationId(found.id)
      })
      .catch(() => {})
  }, [status, role, id])

  const apply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (status === 'unauthenticated') {
      router.push(`/login?callbackUrl=/jobs/${id}`)
      return
    }
    setError('')
    setApplying(true)
    try {
      const { data } = await axios.post('/api/applications', {
        jobId: id,
        coverLetter: cover.trim() || undefined,
      })
      router.push(`/applications/${data.application.id}`)
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (err.response?.data?.needsProfile) {
          setError('Please complete your profile first. Taking you there…')
          setTimeout(() => router.push('/onboarding'), 1200)
          return
        }
        if (err.response?.status === 401) return void router.push(`/login?callbackUrl=/jobs/${id}`)
        if (err.response?.status === 409) {
          setError('You already applied to this job.')
          setApplying(false)
          return
        }
      }
      setError(errorText(err, 'Could not send your application. Try again.'))
      setApplying(false)
    }
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <main className="mx-auto max-w-3xl px-5 py-10"><Alert variant="error">{loadError}</Alert></main>
      </div>
    )
  }
  if (!job) return <div className="min-h-screen bg-white p-8 text-zinc-500">Loading…</div>

  const list = (items: string[]) =>
    items.length > 0 && (
      <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-700">
        {items.map((x, i) => <li key={i}>{x}</li>)}
      </ul>
    )

  const isRecruiter = role === 'RECRUITER'

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <Link href={isRecruiter ? '/dashboard' : '/jobs'} className="text-sm text-zinc-500 hover:text-red-600">
          ← {isRecruiter ? 'Dashboard' : 'All jobs'}
        </Link>

        <div className="mb-6 mt-3 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            {job.company?.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={job.company.logo} alt="" className="h-14 w-14 rounded border border-zinc-200 object-contain" />
            )}
            <div>
              <h1 className="font-serif text-3xl font-bold text-zinc-900">{job.title}</h1>
              <p className="mt-1 text-zinc-500">
                {job.company?.name} · {job.location} · {formatSalary(job.salary)} · {formatRelativeTime(job.createdAt)}
              </p>
            </div>
          </div>
          <span className={`whitespace-nowrap rounded border px-2.5 py-1 text-xs font-medium ${jobTypeColors[job.type] ?? ''}`}>
            {job.type.replace('_', ' ')}
          </span>
        </div>

        {!job.isActive && <Alert variant="info" className="mb-6">This job is no longer open.</Alert>}

        <div className="flex flex-wrap gap-2">
          {job.skills.map((s) => (
            <span key={s} className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600">{s}</span>
          ))}
        </div>

        <p className="mt-6 whitespace-pre-line text-zinc-700">{job.description}</p>

        {job.responsibilities.length > 0 && (
          <section className="mt-8">
            <h2 className="font-serif text-xl font-bold text-zinc-900">Responsibilities</h2>
            {list(job.responsibilities)}
          </section>
        )}
        {job.requirements.length > 0 && (
          <section className="mt-8">
            <h2 className="font-serif text-xl font-bold text-zinc-900">Requirements</h2>
            {list(job.requirements)}
          </section>
        )}

        {job.company?.description && (
          <section className="mt-8">
            <h2 className="font-serif text-xl font-bold text-zinc-900">About {job.company.name}</h2>
            <p className="mt-2 text-zinc-700">{job.company.description}</p>
          </section>
        )}

        {isRecruiter && (
          <section className="mt-10 rounded border border-zinc-200 bg-zinc-50 p-6">
            <p className="text-zinc-700">
              This is one of your company&apos;s postings{job.recruiter?.name ? `, posted by ${job.recruiter.name}` : ''}.
            </p>
            <div className="mt-3 flex gap-4 text-sm font-medium">
              <Link href={`/dashboard/jobs/${job.id}/edit`} className="text-red-600 underline">Edit job</Link>
              <Link href={`/dashboard/applicants?jobId=${job.id}`} className="text-red-600 underline">
                View applicants
              </Link>
            </div>
          </section>
        )}

        {!isRecruiter && job.isActive && (
          <section className="mt-10 rounded border border-zinc-200 bg-zinc-50 p-6">
            {applicationId ? (
              <p className="text-zinc-700">
                You already applied.{' '}
                <Link href={`/applications/${applicationId}`} className="font-medium text-red-600 underline">
                  Track your application
                </Link>
              </p>
            ) : (
              <form onSubmit={apply} className="space-y-3">
                <h2 className="font-serif text-xl font-bold text-zinc-900">Apply for this job</h2>
                {error && <Alert variant="error">{error}</Alert>}
                <textarea value={cover} onChange={(e) => setCover(e.target.value)} rows={5} maxLength={2000}
                  placeholder="Cover letter (optional) - tell them why you are a good fit"
                  className="w-full rounded border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600" />
                <button type="submit" disabled={applying || status === 'loading'}
                  className="rounded bg-red-600 px-6 py-2.5 font-medium text-white hover:bg-red-700 disabled:opacity-50">
                  {applying ? 'Sending…' : status === 'unauthenticated' ? 'Sign in to apply' : 'Submit application'}
                </button>
                <p className="text-xs text-zinc-500">Your profile and resume are shared with the recruiter.</p>
              </form>
            )}
          </section>
        )}
      </main>
    </div>
  )
}