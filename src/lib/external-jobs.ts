import { prisma } from '@/lib/prisma'

type Normalized = {
  source: string
  externalId: string
  title: string
  company: string
  location?: string
  workMode?: string
  jobType?: string
  salary?: string
  summary?: string
  tags: string[]
  url: string
  postedAt?: Date
}

const ROLE_RE = /(software|full[\s-]?stack|front[\s-]?end|back[\s-]?end|web\s+developer|developer|engineer|programmer)/i

const clean = (html?: string | null, max = 400) => {
  if (!html) return undefined
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&amp;|&#\d+;|&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text || undefined
}

async function getJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, cache: 'no-store' })
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  return res.json()
}

async function fromRemotive(): Promise<Normalized[]> {
  const data = await getJson('https://remotive.com/api/remote-jobs?category=software-dev&limit=100')
  return (data.jobs ?? []).map((j: any): Normalized => ({
    source: 'Remotive',
    externalId: String(j.id),
    title: j.title,
    company: j.company_name,
    location: j.candidate_required_location || undefined,
    workMode: 'Remote',
    jobType: j.job_type ? String(j.job_type).replace('_', ' ') : undefined,
    salary: j.salary || undefined,
    summary: clean(j.description),
    tags: Array.isArray(j.tags) ? j.tags.slice(0, 8) : [],
    url: j.url,
    postedAt: j.publication_date ? new Date(j.publication_date) : undefined,
  }))
}

async function fromArbeitnow(): Promise<Normalized[]> {
  const data = await getJson('https://www.arbeitnow.com/api/job-board-api')
  return (data.data ?? []).map((j: any): Normalized => ({
    source: 'Arbeitnow',
    externalId: String(j.slug),
    title: j.title,
    company: j.company_name,
    location: j.location || undefined,
    workMode: j.remote ? 'Remote' : 'On-site / Hybrid',
    jobType: Array.isArray(j.job_types) ? j.job_types.join(', ') || undefined : undefined,
    summary: clean(j.description),
    tags: Array.isArray(j.tags) ? j.tags.slice(0, 8) : [],
    url: j.url,
    postedAt: j.created_at ? new Date(j.created_at * 1000) : undefined,
  }))
}

// Optional: needs JSEARCH_API_KEY (RapidAPI). Aggregates Google for Jobs legally.
async function fromJSearch(): Promise<Normalized[]> {
  const key = process.env.JSEARCH_API_KEY
  if (!key) return []
  const queries = (process.env.JSEARCH_QUERIES || 'software engineer,full stack developer')
    .split(',')
    .map((q) => q.trim())
    .filter(Boolean)
  const out: Normalized[] = []
  for (const q of queries) {
    const data = await getJson(
      `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(q)}&page=1&num_pages=1&date_posted=month`,
      { headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': 'jsearch.p.rapidapi.com' } }
    )
    for (const j of data.data ?? []) {
      const salary =
        j.job_min_salary || j.job_max_salary
          ? `${j.job_salary_currency ?? ''} ${j.job_min_salary ?? ''}${j.job_max_salary ? ' - ' + j.job_max_salary : ''}`.trim()
          : undefined
      out.push({
        source: 'JSearch',
        externalId: String(j.job_id),
        title: j.job_title,
        company: j.employer_name,
        location: [j.job_city, j.job_country].filter(Boolean).join(', ') || undefined,
        workMode: j.job_is_remote ? 'Remote' : undefined,
        jobType: j.job_employment_type || undefined,
        salary,
        summary: clean(j.job_description),
        tags: [],
        url: j.job_apply_link,
        postedAt: j.job_posted_at_datetime_utc ? new Date(j.job_posted_at_datetime_utc) : undefined,
      })
    }
  }
  return out
}

const SOURCES: Record<string, () => Promise<Normalized[]>> = {
  Remotive: fromRemotive,
  Arbeitnow: fromArbeitnow,
  JSearch: fromJSearch,
}

export async function syncExternalJobs() {
  const results: Record<string, { fetched: number; added: number; error?: string }> = {}

  for (const [name, fetcher] of Object.entries(SOURCES)) {
    let fetched = 0
    let added = 0
    try {
      const jobs = (await fetcher()).filter(
        (j) => j.title && j.company && j.url && ROLE_RE.test(j.title)
      )
      fetched = jobs.length
      for (const j of jobs) {
        const existing = await prisma.externalJob.findUnique({
          where: { source_externalId: { source: j.source, externalId: j.externalId } },
          select: { id: true },
        })
        const data = {
          title: j.title,
          company: j.company,
          location: j.location ?? null,
          workMode: j.workMode ?? null,
          jobType: j.jobType ?? null,
          salary: j.salary ?? null,
          summary: j.summary ?? null,
          tags: j.tags,
          url: j.url,
          postedAt: j.postedAt ?? null,
          lastSeenAt: new Date(),
          isActive: true,
        }
        if (existing) {
          await prisma.externalJob.update({ where: { id: existing.id }, data })
        } else {
          await prisma.externalJob.create({
            data: { source: j.source, externalId: j.externalId, ...data },
          })
          added++
        }
      }
      results[name] = { fetched, added }
      await prisma.externalJobSyncLog.create({ data: { source: name, fetched, added } })
    } catch (e: any) {
      results[name] = { fetched, added, error: e?.message ?? 'failed' }
      await prisma.externalJobSyncLog.create({
        data: { source: name, fetched, added, error: String(e?.message ?? e).slice(0, 500) },
      })
    }
  }

  // postings not seen for 7 days are treated as closed (kept as history)
  const closed = await prisma.externalJob.updateMany({
    where: { isActive: true, lastSeenAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    data: { isActive: false },
  })

  return { results, closed: closed.count }
}