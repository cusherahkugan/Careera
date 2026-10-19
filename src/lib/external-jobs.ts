/* eslint-disable @typescript-eslint/no-explicit-any */
// External jobs: fetched ONLY from JSearch, English only, IT sector only.
import { prisma } from '@/lib/prisma'
import { hasContent, isEnglish } from '@/lib/language'
import { isITJob } from '@/lib/it-filter'

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

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** HTML or plain text -> clean text, list items become "• ..." lines. */
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
    .replace(/^[ \t]*[-*–·▪●]\s+/gm, '• ')
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

/** Saved only with a real link, a readable description and English text. */
function isGood(j: Normalized): boolean {
  if (!j.title || j.title.length < 3 || !j.company) return false
  if (!/^https?:\/\//i.test(j.url)) return false
  if (!hasContent(j.summary)) return false
  return isEnglish(`${j.title}. ${j.summary}`)
}

// ---------------------------------------------------------------------------
// network
// ---------------------------------------------------------------------------

async function getJson(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(25_000),
    headers: { Accept: 'application/json', 'User-Agent': 'CareeraJobSync/1.0', ...headers },
  })
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 150)
    // host only: never put the full URL (it contains the search text) in the message
    throw new Error(`${new URL(url).host} -> ${res.status} ${body}`)
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// JSearch
//   JSEARCH_API_KEY   (required)
//   JSEARCH_PROVIDER  = rapidapi (default) | openwebninja
//   JSEARCH_QUERIES   = "query|country;query|country"   e.g. "software developer|lk;devops engineer|us"
//   JSEARCH_COUNTRY   = default country when a query has none
//   JSEARCH_PAGES     = pages per query (default 1, max 5)
//   JSEARCH_MIN_HOURS = minimum hours between runs (default 5)
//   JSEARCH_KEEP_DAYS = close jobs not seen for this many days (default 21)
// ---------------------------------------------------------------------------

function jsearchRequest(
  query: string,
  page: number,
  country: string
): { url: string; headers: Record<string, string> } {
  const key = process.env.JSEARCH_API_KEY!.trim()
  const provider = (process.env.JSEARCH_PROVIDER || 'rapidapi').trim().toLowerCase()
  const params = new URLSearchParams({
    query,
    page: String(page),
    num_pages: '1',
    date_posted: process.env.JSEARCH_DATE_POSTED?.trim() || 'month',
    language: process.env.JSEARCH_LANGUAGE?.trim() || 'en',
  })
  if (country) params.set('country', country)

  if (provider === 'openwebninja') {
    const headers: Record<string, string> = { 'x-api-key': key }
    return {
      url: `https://api.openwebninja.com/jsearch/search?${params}`,
      headers,
    }
  }
  const headers: Record<string, string> = {
    'X-RapidAPI-Key': key,
    'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
  }
  return {
    url: `https://jsearch.p.rapidapi.com/search?${params}`,
    headers,
  }
}

function jsearchJob(j: any): Normalized | null {
  const url = j.job_apply_link || j.job_google_link
  if (!j.job_id || !j.job_title || !j.employer_name || !url) return null

  const quals: string[] = j.job_highlights?.Qualifications ?? []

  // IT sector only (checked on the FULL description, before it is shortened)
  const category = categorize(String(j.job_title))
  if (!isITJob(String(j.job_title), category, `${j.job_description ?? ''} ${quals.join(' ')}`)) return null

  const salary =
    j.job_min_salary || j.job_max_salary
      ? [
          j.job_salary_currency,
          j.job_min_salary,
          j.job_max_salary ? `- ${j.job_max_salary}` : '',
          j.job_salary_period ? `/ ${String(j.job_salary_period).toLowerCase()}` : '',
        ]
          .filter(Boolean)
          .join(' ')
      : null

  const requirementsHtml = quals.length
    ? `<ul>${quals.map((q) => `<li>${escHtml(String(q))}</li>`).join('')}</ul>`
    : null

  const location =
    [j.job_city, j.job_state, j.job_country].filter(Boolean).join(', ') || j.job_location || null

  return build({
    source: 'JSearch',
    id: String(j.job_id),
    title: j.job_title,
    company: j.employer_name,
    careersUrl: j.employer_website || undefined,
    location,
    mode: j.job_is_remote ? 'Remote' : null,
    type: j.job_employment_type,
    salary,
    html: j.job_description,
    requirementsHtml,
    url,
    postedAt: toDate(j.job_posted_at_datetime_utc),
    tags: [j.job_publisher],
  })
}

async function fromJSearch(): Promise<{ rows: number; jobs: Normalized[]; errors: string[] }> {
  const defaultCountry = process.env.JSEARCH_COUNTRY?.trim().toLowerCase() || ''
  const pages = Math.min(Math.max(Number(process.env.JSEARCH_PAGES) || 1, 1), 5)
  const queries = (process.env.JSEARCH_QUERIES || 'software developer')
    .split(';')
    .map((q) => q.trim())
    .filter(Boolean)

  // queries run in parallel so the whole sync fits inside the serverless time limit
  const parts = await Promise.all(
    queries.map(async (entry) => {
      const [query, countryOverride] = entry.split('|').map((p) => p.trim())
      const country = (countryOverride ?? defaultCountry).toLowerCase()
      const jobs: Normalized[] = []
      let rows = 0
      let error: string | null = null

      for (let page = 1; page <= pages; page++) {
        try {
          const req = jsearchRequest(query, page, country)
          const data = await getJson(req.url, req.headers)
          const list: any[] = data.data ?? []
          rows += list.length
          for (const row of list) {
            const job = jsearchJob(row)
            if (job) jobs.push(job)
          }
          if (list.length < 10) break // no more pages for this query
        } catch (e: any) {
          error = String(e?.message ?? e)
          break
        }
      }
      return { rows, jobs, error }
    })
  )

  const errors = parts.map((p) => p.error).filter((e): e is string => !!e)
  const rows = parts.reduce((n, p) => n + p.rows, 0)
  const jobs = parts.flatMap((p) => p.jobs)

  if (jobs.length === 0 && errors.length > 0) throw new Error(errors[0])
  return { rows, jobs, errors }
}

// ---------------------------------------------------------------------------
// saving
// ---------------------------------------------------------------------------

const chunk = <T,>(arr: T[], size: number) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size))

async function persist(jobs: Normalized[], runStart: Date) {
  const unique = [...new Map(jobs.map((j) => [j.externalId, j])).values()]
  const have = new Set<string>()

  for (const ids of chunk(unique.map((j) => j.externalId), 1000)) {
    const rows = await prisma.externalJob.findMany({
      where: { source: 'JSearch', externalId: { in: ids } },
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
      where: { source: 'JSearch', externalId: { in: ids } },
      data: { lastSeenAt: runStart, isActive: true },
    })
  }
  return { added: fresh.length }
}

// ---------------------------------------------------------------------------
// sync
// ---------------------------------------------------------------------------

let running: Promise<SyncSummary> | null = null

export type SyncSummary = {
  results: Record<
    string,
    { fetched: number; skipped: number; added: number; closed: number; error?: string }
  >
  closedStale: number
  notes?: string
}

export function syncExternalJobs(opts: { force?: boolean } = {}): Promise<SyncSummary> {
  if (running) return running
  running = run(opts).finally(() => {
    running = null
  })
  return running
}

async function run(opts: { force?: boolean }): Promise<SyncSummary> {
  const runStart = new Date()
  const day = 24 * 60 * 60 * 1000
  const results: SyncSummary['results'] = {}

  // Only JSearch jobs may be visible: hide anything that came from another source.
  const hidden = await prisma.externalJob.updateMany({
    where: { isActive: true, source: { not: 'JSearch' } },
    data: { isActive: false },
  })

  if (!process.env.JSEARCH_API_KEY?.trim()) {
    return { results, closedStale: hidden.count, notes: 'JSEARCH_API_KEY is not set' }
  }

  // 5h default (not 6h) so a cron that fires a few minutes early is not skipped
  const minHours = Number(process.env.JSEARCH_MIN_HOURS) || 5
  if (!opts.force) {
    const last = await prisma.externalJobSyncLog.findFirst({
      where: { source: 'JSearch', error: null },
      orderBy: { ranAt: 'desc' },
    })
    if (last && Date.now() - last.ranAt.getTime() < minHours * 3_600_000) {
      const ago = ((Date.now() - last.ranAt.getTime()) / 3_600_000).toFixed(1)
      return {
        results,
        closedStale: hidden.count,
        notes: `Skipped: last successful JSearch run was ${ago}h ago (minimum ${minHours}h). Add ?force=1 to override.`,
      }
    }
  }

  let fetched = 0
  let skipped = 0
  let added = 0
  let error: string | undefined

  try {
    const r = await fromJSearch()
    fetched = r.rows
    const good = r.jobs.filter(isGood) // real link + readable text + English
    skipped = r.rows - good.length // not IT, not English, or unreadable
    if (good.length > 0) added = (await persist(good, runStart)).added
    if (r.errors.length) error = r.errors.join(' | ').slice(0, 500)
  } catch (e: any) {
    error = String(e?.message ?? e).slice(0, 500)
  }

  results.JSearch = { fetched, skipped, added, closed: 0, error }
  await prisma.externalJobSyncLog.create({
    data: { source: 'JSearch', fetched, added, error: error ?? null },
  })

  // search-based feed: close postings not seen for JSEARCH_KEEP_DAYS
  const keepDays = Number(process.env.JSEARCH_KEEP_DAYS) || 21
  const stale = await prisma.externalJob.updateMany({
    where: { isActive: true, source: 'JSearch', lastSeenAt: { lt: new Date(Date.now() - keepDays * day) } },
    data: { isActive: false },
  })

  return { results, closedStale: stale.count + hidden.count }
}