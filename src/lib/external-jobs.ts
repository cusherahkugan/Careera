/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from '@/lib/prisma'
import {
  ATS_LABEL,
  defaultCareersUrl,
  getCareerSources,
  type Ats,
  type CareerSource,
} from '@/lib/career-sources'

export const SYNC_EVERY_MS = 6 * 60 * 60 * 1000

export const ROLE_CATEGORIES = [
  'Full Stack',
  'Frontend',
  'Backend',
  'Mobile',
  'DevOps / Cloud',
  'Data / AI',
  'QA / Testing',
  'Security',
  'Design',
  'Product / Project',
  'Engineering Manager',
  'Software Engineer',
  'Sales / Marketing',
  'Support / IT',
  'Business / Ops',
  'Other',
] as const

export type Normalized = {
  source: string
  externalId: string
  title: string
  company: string
  careersUrl?: string
  location?: string
  workMode?: string
  jobType?: string
  roleCategory: string
  salary?: string
  summary?: string
  requirements: string[]
  contactEmails: string[]
  tags: string[]
  url: string
  postedAt?: Date
}

type Feed = {
  name: string
  source: string
  /** externalId prefix that belongs to this feed (used to close removed postings) */
  prefix: string
  /** skip this feed if it already ran successfully within this many hours */
  minHours?: number
  fetch: () => Promise<Normalized[]>
}

// ---------------------------------------------------------------------------
// text helpers
// ---------------------------------------------------------------------------

const ENT: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'",
  '&nbsp;': ' ', '&rsquo;': "'", '&lsquo;': "'", '&ldquo;': '"', '&rdquo;': '"',
  '&ndash;': '-', '&mdash;': '-', '&bull;': '•',
}

const cp = (n: number) => (n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ')

const decode = (s: string) =>
  s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|[a-z]+);/gi, (m, d, h) =>
    d ? cp(Number(d)) : h ? cp(parseInt(h, 16)) : (ENT[m.toLowerCase()] ?? ' ')
  )

/** HTML (even Greenhouse's double-encoded HTML) -> plain text, list items become "• ..." lines. */
export function htmlToText(html?: string | null): string {
  if (!html) return ''
  let s = html
  if (!/<[a-z][\s\S]*>/i.test(s) && /&lt;[a-z]/i.test(s)) s = decode(s)
  s = s
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|ul|ol|tr|section|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  s = decode(s)
  return s
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const BAD_EMAIL = /(no-?reply|do-?not-?reply|example\.|sentry|wixpress|\.(png|jpe?g|gif|svg|webp)$)/i

export function extractEmails(raw: string): string[] {
  const found = new Set<string>()
  for (const m of raw.matchAll(EMAIL_RE)) {
    const e = m[0].toLowerCase().replace(/[.]+$/, '')
    if (!BAD_EMAIL.test(e)) found.add(e)
    if (found.size >= 5) break
  }
  return [...found]
}

const REQ_HEAD =
  /(requirements?|qualifications?|what you['’]ll need|what we['’]re looking for|what you bring|who you are|you have|must[- ]haves?|about you|your profile|minimum)/i
const NOT_REQ = /(nice[- ]to[- ]have|bonus|preferred|responsibilit|benefits|perks)/i
const REQ_WORDS = /\b(\d+\+?\s*years?|experience (with|in)|proficien|knowledge of|degree|familiar|expertise)/i

export function extractRequirements(text: string): string[] {
  const out: string[] = []
  let inReq = false

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const bullet = line.startsWith('•')
    const body = bullet ? line.replace(/^•\s*/, '') : line

    if (!bullet) {
      const h = body.replace(/[:：\s]+$/, '')
      if (h.length <= 70 && !/[.!?]$/.test(h)) {
        inReq = REQ_HEAD.test(h) && !NOT_REQ.test(h)
        continue
      }
    }
    if (inReq && body.length >= 8) out.push(body.slice(0, 220))
    if (out.length >= 12) break
  }

  if (out.length === 0) {
    for (const raw of text.split('\n')) {
      const l = raw.trim()
      if (l.startsWith('•') && REQ_WORDS.test(l)) out.push(l.replace(/^•\s*/, '').slice(0, 220))
      if (out.length >= 6) break
    }
  }
  return out
}

function shorten(text: string, max = 500): string | undefined {
  const flat = text.replace(/\s*\n\s*/g, ' ').trim()
  if (!flat) return undefined
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return cut.slice(0, sp > 200 ? sp : max) + '…'
}

// ---------------------------------------------------------------------------
// classification
// ---------------------------------------------------------------------------

const CATEGORY_RULES: [string, RegExp][] = [
  ['Full Stack', /full[\s-]?stack/i],
  ['Engineering Manager', /engineering manager|head of engineering|director of engineering|vp,? engineering|tech lead manager/i],
  ['Product / Project', /product (manager|owner|lead)|program manager|project manager|scrum master|delivery manager/i],
  ['Mobile', /\bios\b|android|mobile|flutter|react native|swift developer|kotlin/i],
  ['Frontend', /front[\s-]?end|\bui (engineer|developer)|\breact\b|\bvue\b|angular|web developer/i],
  ['Data / AI', /data (scien|engineer|analy)|machine learning|\bml\b|\bai\b|analytics|research scientist|business intelligence|\bnlp\b/i],
  ['Security', /security|penetration|appsec|infosec|\bsoc\b/i],
  ['DevOps / Cloud', /devops|\bsre\b|site reliability|platform engineer|infrastructure|cloud|systems engineer|devsecops/i],
  ['QA / Testing', /\bqa\b|quality assurance|\btest(er|ing)?\b|sdet|automation engineer/i],
  ['Backend', /back[\s-]?end|server[\s-]?side|api engineer|\bjava\b|golang|\.net|python|ruby|\bphp\b|node(\.js)?\b/i],
  ['Design', /design|\bux\b|\bui\b|creative/i],
  ['Sales / Marketing', /sales|marketing|growth|account executive|\bseo\b|content|brand|partnership/i],
  ['Support / IT', /support|customer success|help ?desk|\bit (admin|specialist|technician)|system administrator|technician/i],
  ['Software Engineer', /software|developer|engineer|programmer/i],
  ['Business / Ops', /business analyst|operations|finance|account(ant|ing)|recruit|\bhr\b|people|legal|talent|administrat/i],
]

export function categorize(title: string): string {
  for (const [name, re] of CATEGORY_RULES) if (re.test(title)) return name
  return 'Other'
}

function detectMode(explicit: string | null | undefined, title: string, location: string | undefined, text: string) {
  const e = (explicit ?? '').toLowerCase()
  if (e.includes('hybrid')) return 'Hybrid'
  if (e.includes('remote')) return 'Remote'
  if (e.includes('on-site') || e.includes('onsite') || e.includes('on site')) return 'On-site'
  const head = `${title} ${location ?? ''}`
  if (/\bhybrid\b/i.test(head)) return 'Hybrid'
  if (/\bremote\b|anywhere/i.test(head)) return 'Remote'
  if (/\b(fully remote|100% remote|remote[- ]first|work from anywhere|remote position)\b/i.test(text)) return 'Remote'
  if (/\bhybrid\b/i.test(text)) return 'Hybrid'
  return 'On-site'
}

function detectType(explicit: string | null | undefined, title: string) {
  const s = `${explicit ?? ''} ${title}`.toLowerCase()
  if (/\bintern(ship)?\b/.test(s)) return 'Internship'
  if (/contract|freelance|temporary|\btemp\b/.test(s)) return 'Contract'
  if (/part[\s-]?time/.test(s)) return 'Part-time'
  return 'Full-time'
}

const toDate = (v: unknown): Date | null => {
  if (v === null || v === undefined || v === '') return null
  const d = new Date(v as string | number)
  return Number.isNaN(d.getTime()) ? null : d
}

function build(p: {
  source: string
  id: string
  title: string
  company: string
  careersUrl?: string
  location?: string | null
  mode?: string | null
  type?: string | null
  salary?: string | null
  html?: string | null
  requirementsHtml?: string | null
  tags?: (string | null | undefined)[]
  url: string
  postedAt?: Date | null
}): Normalized {
  const title = String(p.title ?? '').trim().slice(0, 200)
  const location = p.location ? String(p.location).trim().slice(0, 120) : undefined
  const text = htmlToText(p.html)
  const reqText = htmlToText(p.requirementsHtml)

  let requirements = reqText ? extractRequirements(`Requirements\n${reqText}`) : []
  if (requirements.length === 0) requirements = extractRequirements(text)

  return {
    source: p.source,
    externalId: p.id,
    title,
    company: String(p.company ?? '').trim().slice(0, 120),
    careersUrl: p.careersUrl,
    location,
    workMode: detectMode(p.mode, title, location, text),
    jobType: detectType(p.type, title),
    roleCategory: categorize(title),
    salary: p.salary ? String(p.salary).trim().slice(0, 100) : undefined,
    summary: shorten(text),
    requirements,
    contactEmails: extractEmails(`${decode(p.html ?? '')} ${decode(p.requirementsHtml ?? '')}`),
    tags: (p.tags ?? []).filter((t): t is string => !!t).map((t) => t.trim()).filter(Boolean).slice(0, 8),
    url: p.url,
    postedAt: p.postedAt ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// network
// ---------------------------------------------------------------------------

async function getJson(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: 'application/json', 'User-Agent': 'CareeraJobSync/1.0', ...headers },
  })
  if (!res.ok) throw new Error(`${new URL(url).host} -> ${res.status}`)
  return res.json()
}

const careers = (s: CareerSource) => s.careersUrl ?? defaultCareersUrl(s)

// ---------------------------------------------------------------------------
// ATS adapters (public job-board APIs of the company career pages)
// ---------------------------------------------------------------------------

async function greenhouse(s: CareerSource): Promise<Normalized[]> {
  const data = await getJson(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(s.token)}/jobs?content=true`
  )
  return (data.jobs ?? []).map((j: any) =>
    build({
      source: 'Greenhouse',
      id: `${s.token}:${j.id}`,
      title: j.title,
      company: s.company,
      careersUrl: careers(s),
      location: j.location?.name,
      html: j.content,
      url: j.absolute_url,
      postedAt: toDate(j.first_published ?? j.updated_at),
      tags: (j.departments ?? []).map((d: any) => d?.name),
    })
  )
}

async function lever(s: CareerSource): Promise<Normalized[]> {
  const data = await getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(s.token)}?mode=json`)
  return (Array.isArray(data) ? data : []).map((j: any) => {
    const lists = (j.lists ?? []).map((l: any) => `<h3>${l.text}</h3><ul>${l.content}</ul>`).join('')
    const r = j.salaryRange
    return build({
      source: 'Lever',
      id: `${s.token}:${j.id}`,
      title: j.text,
      company: s.company,
      careersUrl: careers(s),
      location: j.categories?.location ?? (j.categories?.allLocations ?? []).join(', '),
      mode: j.workplaceType,
      type: j.categories?.commitment,
      salary: r?.min ? `${r.currency ?? ''} ${r.min} - ${r.max ?? ''} ${r.interval ?? ''}`.trim() : null,
      html: `${j.description ?? ''}${lists}${j.additional ?? ''}`,
      url: j.hostedUrl,
      postedAt: toDate(j.createdAt),
      tags: [j.categories?.team, j.categories?.department],
    })
  })
}

async function ashby(s: CareerSource): Promise<Normalized[]> {
  const data = await getJson(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(s.token)}?includeCompensation=true`
  )
  return (data.jobs ?? []).map((j: any) =>
    build({
      source: 'Ashby',
      id: `${s.token}:${j.id}`,
      title: j.title,
      company: s.company,
      careersUrl: careers(s),
      location: j.location,
      mode: j.workplaceType ?? (j.isRemote ? 'Remote' : null),
      type: j.employmentType,
      salary: j.compensation?.compensationTierSummary,
      html: j.descriptionHtml ?? j.descriptionPlain,
      url: j.jobUrl ?? j.applyUrl,
      postedAt: toDate(j.publishedAt),
      tags: [j.department, j.team],
    })
  )
}

async function workable(s: CareerSource): Promise<Normalized[]> {
  const data = await getJson(
    `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(s.token)}?details=true`
  )
  return (data.jobs ?? []).map((j: any) =>
    build({
      source: 'Workable',
      id: `${s.token}:${j.shortcode}`,
      title: j.title,
      company: s.company,
      careersUrl: careers(s),
      location: [j.city, j.state, j.country].filter(Boolean).join(', '),
      mode: j.telecommuting ? 'Remote' : null,
      type: j.employment_type,
      html: j.description,
      url: j.url ?? j.shortlink,
      postedAt: toDate(j.published_on ?? j.created_at),
      tags: [j.department],
    })
  )
}

async function recruitee(s: CareerSource): Promise<Normalized[]> {
  const data = await getJson(`https://${encodeURIComponent(s.token)}.recruitee.com/api/offers/`)
  return (data.offers ?? []).map((j: any) =>
    build({
      source: 'Recruitee',
      id: `${s.token}:${j.id}`,
      title: j.title,
      company: s.company,
      careersUrl: careers(s),
      location: j.location ?? [j.city, j.country].filter(Boolean).join(', '),
      mode: j.remote ? 'Remote' : null,
      type: j.employment_type_code,
      html: j.description,
      requirementsHtml: j.requirements,
      url: j.careers_url ?? j.url,
      postedAt: toDate(j.created_at),
      tags: [j.department],
    })
  )
}

const ADAPTERS: Record<Ats, (s: CareerSource) => Promise<Normalized[]>> = {
  greenhouse,
  lever,
  ashby,
  workable,
  recruitee,
}

// ---------------------------------------------------------------------------
// job boards / aggregators
// ---------------------------------------------------------------------------

async function fromRemotive(): Promise<Normalized[]> {
  const data = await getJson('https://remotive.com/api/remote-jobs?category=software-dev&limit=150')
  return (data.jobs ?? []).map((j: any) =>
    build({
      source: 'Remotive',
      id: String(j.id),
      title: j.title,
      company: j.company_name,
      location: j.candidate_required_location,
      mode: 'Remote',
      type: j.job_type ? String(j.job_type).replace('_', ' ') : null,
      salary: j.salary,
      html: j.description,
      url: j.url,
      postedAt: toDate(j.publication_date),
      tags: Array.isArray(j.tags) ? j.tags : [],
    })
  )
}

async function fromArbeitnow(): Promise<Normalized[]> {
  const data = await getJson('https://www.arbeitnow.com/api/job-board-api')
  return (data.data ?? []).map((j: any) =>
    build({
      source: 'Arbeitnow',
      id: String(j.slug),
      title: j.title,
      company: j.company_name,
      location: j.location,
      mode: j.remote ? 'Remote' : null,
      type: Array.isArray(j.job_types) ? j.job_types.join(', ') : null,
      html: j.description,
      url: j.url,
      postedAt: j.created_at ? toDate(j.created_at * 1000) : null,
      tags: Array.isArray(j.tags) ? j.tags : [],
    })
  )
}

// Optional (needs JSEARCH_API_KEY): Google-for-Jobs aggregator, covers companies without a supported ATS.
async function fromJSearch(): Promise<Normalized[]> {
  const key = process.env.JSEARCH_API_KEY
  if (!key) return []
  const queries = (process.env.JSEARCH_QUERIES || 'software engineer')
    .split(',')
    .map((q) => q.trim())
    .filter(Boolean)
  const out: Normalized[] = []
  for (const q of queries) {
    const data = await getJson(
      `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(q)}&page=1&num_pages=1&date_posted=month`,
      { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': 'jsearch.p.rapidapi.com' }
    )
    for (const j of data.data ?? []) {
      const salary =
        j.job_min_salary || j.job_max_salary
          ? `${j.job_salary_currency ?? ''} ${j.job_min_salary ?? ''}${j.job_max_salary ? ' - ' + j.job_max_salary : ''}`.trim()
          : null
      out.push(
        build({
          source: 'JSearch',
          id: String(j.job_id),
          title: j.job_title,
          company: j.employer_name,
          careersUrl: j.employer_website || undefined,
          location: [j.job_city, j.job_country].filter(Boolean).join(', '),
          mode: j.job_is_remote ? 'Remote' : null,
          type: j.job_employment_type,
          salary,
          html: j.job_description,
          url: j.job_apply_link,
          postedAt: toDate(j.job_posted_at_datetime_utc),
        })
      )
    }
  }
  return out
}

function buildFeeds(): Feed[] {
  const feeds: Feed[] = getCareerSources().map((s) => ({
    name: `${ATS_LABEL[s.ats]}: ${s.company}`,
    source: ATS_LABEL[s.ats],
    prefix: `${s.token}:`,
    fetch: () => ADAPTERS[s.ats](s),
  }))
  feeds.push(
    { name: 'Remotive', source: 'Remotive', prefix: '', fetch: fromRemotive },
    { name: 'Arbeitnow', source: 'Arbeitnow', prefix: '', fetch: fromArbeitnow }
  )
  if (process.env.JSEARCH_API_KEY) {
    feeds.push({
      name: 'JSearch',
      source: 'JSearch',
      prefix: '',
      minHours: Number(process.env.JSEARCH_MIN_HOURS) || 24, // protects the free quota
      fetch: fromJSearch,
    })
  }
  return feeds
}

// ---------------------------------------------------------------------------
// saving
// ---------------------------------------------------------------------------

const chunk = <T,>(arr: T[], size: number) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size))

async function pool<T>(items: T[], size: number, fn: (t: T) => Promise<void>) {
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) await fn(items[i++])
    })
  )
}

async function persist(feed: Feed, jobs: Normalized[], runStart: Date) {
  const unique = [...new Map(jobs.map((j) => [j.externalId, j])).values()]
  const have = new Set<string>()

  for (const ids of chunk(unique.map((j) => j.externalId), 1000)) {
    const rows = await prisma.externalJob.findMany({
      where: { source: feed.source, externalId: { in: ids } },
      select: { externalId: true },
    })
    rows.forEach((r) => have.add(r.externalId))
  }

  const fresh = unique.filter((j) => !have.has(j.externalId))
  for (const part of chunk(fresh, 200)) {
    await prisma.externalJob.createMany({
      data: part.map((j) => ({ ...j, lastSeenAt: runStart, isActive: true })),
      skipDuplicates: true,
    })
  }
  for (const ids of chunk([...have], 1000)) {
    await prisma.externalJob.updateMany({
      where: { source: feed.source, externalId: { in: ids } },
      data: { lastSeenAt: runStart, isActive: true },
    })
  }

  // anything of this feed that was NOT seen in this run is gone from the company's page
  const closed = await prisma.externalJob.updateMany({
    where: {
      source: feed.source,
      ...(feed.prefix ? { externalId: { startsWith: feed.prefix } } : {}),
      isActive: true,
      lastSeenAt: { lt: runStart },
    },
    data: { isActive: false },
  })
  return { added: fresh.length, closed: closed.count }
}

// ---------------------------------------------------------------------------
// sync
// ---------------------------------------------------------------------------

let running: Promise<SyncSummary> | null = null

export type SyncSummary = {
  results: Record<string, { fetched: number; added: number; closed: number; error?: string }>
  closedStale: number
}

export function syncExternalJobs(): Promise<SyncSummary> {
  if (running) return running
  running = run().finally(() => {
    running = null
  })
  return running
}

async function run(): Promise<SyncSummary> {
  const runStart = new Date()
  const feeds = buildFeeds()
  const stats = new Map<string, { ran: number; fetched: number; added: number; closed: number; errors: string[] }>()
  const stat = (src: string) => {
    if (!stats.has(src)) stats.set(src, { ran: 0, fetched: 0, added: 0, closed: 0, errors: [] })
    return stats.get(src)!
  }

  await pool(feeds, 6, async (feed) => {
    const st = stat(feed.source)
    try {
      if (feed.minHours) {
        const last = await prisma.externalJobSyncLog.findFirst({
          where: { source: feed.source, error: null },
          orderBy: { ranAt: 'desc' },
        })
        if (last && Date.now() - last.ranAt.getTime() < feed.minHours * 3_600_000) return
      }
      st.ran++
      const jobs = (await feed.fetch()).filter((j) => j.title && j.company && j.url)
      st.fetched += jobs.length
      if (jobs.length === 0) return // never wipe a feed because of an empty answer
      const r = await persist(feed, jobs, runStart)
      st.added += r.added
      st.closed += r.closed
    } catch (e: any) {
      st.errors.push(`${feed.name}: ${String(e?.message ?? e).slice(0, 120)}`)
    }
  })

  const results: SyncSummary['results'] = {}
  for (const [source, st] of stats) {
    if (st.ran === 0) continue
    const error = st.errors.length ? st.errors.join(' | ').slice(0, 500) : undefined
    results[source] = { fetched: st.fetched, added: st.added, closed: st.closed, error }
    await prisma.externalJobSyncLog.create({
      data: { source, fetched: st.fetched, added: st.added, error: error ?? null },
    })
  }

  // safety net: anything not seen for 3 days is treated as closed
  const stale = await prisma.externalJob.updateMany({
    where: { isActive: true, lastSeenAt: { lt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } },
    data: { isActive: false },
  })

  return { results, closedStale: stale.count }
}