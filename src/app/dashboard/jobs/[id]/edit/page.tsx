'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import axios from 'axios'
import { Navbar } from '@/components/navbar'
import { JobForm } from '@/components/job-form'
import { Alert } from '@/components/ui/alert'
import { errorText } from '@/lib/client'
import type { Job } from '@/types'

export default function EditJobPage() {
  const { id } = useParams<{ id: string }>()
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    axios
      .get(`/api/jobs/${id}`)
      .then(({ data }) => setJob(data.job))
      .catch((err) => setError(errorText(err, 'Could not load this job')))
  }, [id])

  return (
    <div className="min-h-screen bg-zinc-50">
      <Navbar />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="mb-6 font-serif text-3xl font-bold text-zinc-900">Edit job</h1>
        {error && <Alert variant="error">{error}</Alert>}
        {!job && !error && <p className="text-zinc-500">Loading…</p>}
        {job && <JobForm job={job} />}
      </main>
    </div>
  )
}