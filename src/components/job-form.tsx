'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { Alert } from '@/components/ui/alert'
import { errorText } from '@/lib/client'
import type { Job, JobType } from '@/types'

const inputCls =
  'w-full rounded border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 placeholder-zinc-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600'
const labelCls = 'mb-1.5 block text-sm font-medium text-zinc-700'

const TYPES: { value: JobType; label: string }[] = [
  { value: 'FULL_TIME', label: 'Full time' },
  { value: 'PART_TIME', label: 'Part time' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'INTERNSHIP', label: 'Internship' },
  { value: 'REMOTE', label: 'Remote' },
]

const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)

/** Create a job, or edit one when `job` is passed. */
export function JobForm({ job }: { job?: Job }) {
  const router = useRouter()
  const [title, setTitle] = useState(job?.title ?? '')
  const [type, setType] = useState<JobType>(job?.type ?? 'FULL_TIME')
  const [location, setLocation] = useState(job?.location ?? '')
  const [salary, setSalary] = useState(job?.salary ?? '')
  const [skills, setSkills] = useState(job?.skills.join(', ') ?? '')
  const [description, setDescription] = useState(job?.description ?? '')
  const [requirements, setRequirements] = useState(job?.requirements.join('\n') ?? '')
  const [responsibilities, setResponsibilities] = useState(job?.responsibilities.join('\n') ?? '')
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const generate = async () => {
    setError('')
    if (title.trim().length < 3) return setError('Add a job title first')
    setGenerating(true)
    try {
      const { data } = await axios.post('/api/ai/generate-job-description', {
        title: title.trim(),
        skills: csv(skills),
        type,
      })
      setDescription(data.description)
    } catch (err) {
      setError(errorText(err, 'Could not generate a description'))
    } finally {
      setGenerating(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)

    const payload = {
      title: title.trim(),
      type,
      location: location.trim(),
      salary: salary.trim() || undefined,
      skills: csv(skills),
      description: description.trim(),
      requirements: lines(requirements),
      responsibilities: lines(responsibilities),
    }

    try {
      if (job) await axios.put(`/api/jobs/${job.id}`, payload)
      else await axios.post('/api/jobs', payload)
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setError(errorText(err, 'Could not save the job'))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded border border-zinc-200 bg-white p-6 md:p-8">
      {error && <Alert variant="error">{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="title">Job title</label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} required />
        </div>
        <div>
          <label className={labelCls} htmlFor="type">Type</label>
          <select id="type" value={type} onChange={(e) => setType(e.target.value as JobType)} className={inputCls}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="location">Location</label>
          <input id="location" value={location} onChange={(e) => setLocation(e.target.value)}
            placeholder="Colombo (Hybrid)" className={inputCls} required />
        </div>
        <div>
          <label className={labelCls} htmlFor="salary">Salary (optional)</label>
          <input id="salary" value={salary} onChange={(e) => setSalary(e.target.value)}
            placeholder="$80,000 - $100,000" className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="skills">Skills (comma separated)</label>
          <input id="skills" value={skills} onChange={(e) => setSkills(e.target.value)}
            placeholder="React, TypeScript, PostgreSQL" className={inputCls} />
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-sm font-medium text-zinc-700" htmlFor="description">Description</label>
          <button type="button" onClick={generate} disabled={generating}
            className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50">
            {generating ? 'Writing…' : 'Write it with AI'}
          </button>
        </div>
        <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)}
          rows={8} className={inputCls} required minLength={50} />
        <p className="mt-1 text-xs text-zinc-500">At least 50 characters.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="requirements">Requirements (one per line)</label>
          <textarea id="requirements" value={requirements} onChange={(e) => setRequirements(e.target.value)}
            rows={6} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="responsibilities">Responsibilities (one per line)</label>
          <textarea id="responsibilities" value={responsibilities}
            onChange={(e) => setResponsibilities(e.target.value)} rows={6} className={inputCls} />
        </div>
      </div>

      <button type="submit" disabled={saving}
        className="w-full rounded bg-red-600 py-3 font-medium text-white hover:bg-red-700 disabled:opacity-50">
        {saving ? 'Saving…' : job ? 'Save changes' : 'Publish job'}
      </button>
    </form>
  )
}