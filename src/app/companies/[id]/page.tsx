'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import axios from 'axios'
import { useSession } from 'next-auth/react'
import { Navbar } from '@/components/navbar'
import { Alert } from '@/components/ui/alert'
import { errorText } from '@/lib/client'
import { formatRelativeTime, formatSalary, jobTypeColors } from '@/lib/utils'

type PublicCompany = {
  id: string
  name: string
  logo: string | null
  website: string | null
  linkedin: string | null
  industry: string | null
  size: string | null
  founded: string | null
  location: string | null
  tagline: string | null
  description: string | null
  specialties: string[]
  jobs: {
    id: string
    title: string
    location: string
    type: string
    salary: string | null
    skills: string[]
    createdAt: string
  }[]
}

export default function CompanyPublicPage() {
  const { id } = useParams<{ id: string }>()
  const { data: session } = useSession()
  const role = session?.user.role

  const [company, setCompany] = useState<PublicCompany | null>(null)
  const [isOwn, setIsOwn] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    axios
      .get(`/api/companies/${id}`)
      .then(({ data }) => {
        setCompany(data.company)
        setIsOwn(!!data.isOwn)
      })
      .catch((err) => setError(errorText(err, 'Could not load this company')))
  }, [id])

  if (error) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <main className="mx-auto max-w-3xl px-5 py-10"><Alert variant="error">{error}</Alert></main>
      </div>
    )
  }
  if (!company) return <div className="min-h-screen bg-white p-8 text-zinc-500">Loading…</div>

  const meta = [
    company.industry,
    company.location,
    company.size && `${company.size} people`,
    company.founded && `Founded ${company.founded}`,
  ].filter(Boolean)

  const jobHref = (jobId: string) =>
    role === 'RECRUITER' ? (isOwn ? `/dashboard/jobs/${jobId}/edit` : null) : `/jobs/${jobId}`

  return (
    <div className="min-h-screen bg-zinc-50">
      <Navbar />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <Link href="/companies" className="text-sm text-zinc-500 hover:text-red-600">← Companies</Link>

        <section className="mt-3 rounded border border-zinc-200 bg-white">
          <div className="h-24 rounded-t bg-red-600" />
          <div className="px-6 pb-6">
            <div className="-mt-12 flex h-24 w-24 items-center justify-center overflow-hidden rounded border-4 border-white bg-zinc-100">
              {company.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={company.logo} alt={`${company.name} logo`} className="h-full w-full object-contain" />
              ) : (
                <span className="font-serif text-3xl font-bold text-zinc-400">{company.name[0]}</span>
              )}
            </div>
            <h1 className="mt-4 font-serif text-3xl font-bold text-zinc-900">{company.name}</h1>
            {company.tagline && <p className="mt-1 text-lg text-zinc-700">{company.tagline}</p>}
            <p className="mt-2 text-sm text-zinc-500">{meta.join(' · ')}</p>

            <div className="mt-4 flex flex-wrap gap-3 text-sm font-medium">
              {company.website && (
                <a href={company.website} target="_blank" rel="noreferrer"
                  className="rounded border border-zinc-300 px-4 py-2 text-zinc-700 hover:border-red-600 hover:text-red-600">
                  Website
                </a>
              )}
              {company.linkedin && (
                <a href={company.linkedin} target="_blank" rel="noreferrer"
                  className="rounded border border-zinc-300 px-4 py-2 text-zinc-700 hover:border-red-600 hover:text-red-600">
                  LinkedIn
                </a>
              )}
              {isOwn && (
                <Link href="/company" className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700">
                  Edit company profile
                </Link>
              )}
            </div>
          </div>
        </section>

        {company.description && (
          <section className="mt-6 rounded border border-zinc-200 bg-white p-6">
            <h2 className="font-serif text-xl font-bold text-zinc-900">About</h2>
            <p className="mt-2 whitespace-pre-line text-zinc-700">{company.description}</p>
            {company.specialties.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-semibold text-zinc-800">Specialties</p>
                <div className="flex flex-wrap gap-2">
                  {company.specialties.map((s) => (
                    <span key={s} className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <section className="mt-6 rounded border border-zinc-200 bg-white p-6">
          <h2 className="font-serif text-xl font-bold text-zinc-900">
            Open jobs ({company.jobs.length})
          </h2>
          {company.jobs.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">No open positions right now.</p>
          ) : (
            <div className="mt-3 divide-y divide-zinc-200">
              {company.jobs.map((j) => {
                const href = jobHref(j.id)
                const title = <span className="font-medium text-zinc-900">{j.title}</span>
                return (
                  <div key={j.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div>
                      {href ? <Link href={href} className="hover:text-red-600">{title}</Link> : title}
                      <p className="text-sm text-zinc-500">
                        {j.location} · {formatSalary(j.salary)} · {formatRelativeTime(j.createdAt)}
                      </p>
                      {j.skills.length > 0 && (
                        <p className="mt-1 text-xs text-zinc-400">{j.skills.slice(0, 6).join(' · ')}</p>
                      )}
                    </div>
                    <span className={`rounded border px-2.5 py-1 text-xs font-medium ${jobTypeColors[j.type] ?? ''}`}>
                      {j.type.replace('_', ' ')}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}