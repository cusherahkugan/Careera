import { Navbar } from '@/components/navbar'
import { JobForm } from '@/components/job-form'

export default function NewJobPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <Navbar />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="mb-6 font-serif text-3xl font-bold text-zinc-900">Post a job</h1>
        <JobForm />
      </main>
    </div>
  )
}