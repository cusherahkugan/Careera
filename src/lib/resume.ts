import { CASE_SENSITIVE_SKILLS, MAX_SKILLS, SKILLS, SKILL_ALIASES } from '@/lib/constants'

const MAX_TEXT_CHARS = 20_000

/** Pull plain text out of an uploaded resume (PDF, DOCX or TXT). */
export async function extractResumeText(buffer: Buffer, fileName: string): Promise<string> {
  const ext = fileName.toLowerCase().split('.').pop() ?? ''
  let text = ''

  if (ext === 'pdf') {
    // import the inner file: the package index runs a debug routine when bundled
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default
    const result = await pdfParse(buffer)
    text = result.text
  } else if (ext === 'docx') {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    text = result.value
  } else if (ext === 'txt' || ext === 'md') {
    text = buffer.toString('utf8')
  } else {
    throw new Error('UNSUPPORTED_TYPE')
  }

  return text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TEXT_CHARS)
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}

function containsTerm(text: string, term: string, caseSensitive: boolean): boolean {
  // lookarounds instead of \b so names like C++, C# and Node.js work
  const re = new RegExp(`(?<![A-Za-z0-9+#])${escapeRegex(term)}(?![A-Za-z0-9+#])`, caseSensitive ? '' : 'i')
  return re.test(text)
}

/** Which of the 100 known skills are mentioned in the resume text. */
export function detectSkills(text: string): string[] {
  return SKILLS.filter((skill) => {
    const caseSensitive = CASE_SENSITIVE_SKILLS.has(skill)
    const aliases = SKILL_ALIASES[skill] ?? []
    // ambiguous English words ("Express") only match through their aliases
    const names = caseSensitive && skill === 'Express' ? aliases : [skill, ...aliases]
    return names.some((n) => containsTerm(text, n, caseSensitive && n === skill))
  })
}

// ---------------------------------------------------------------------------
// Section based parsing (works without any AI key)
// ---------------------------------------------------------------------------

export type ParsedExp = { title: string; company: string; duration: string; description: string }
export type ParsedEdu = { degree: string; school: string; year: string }
export interface ParsedLite {
  headline: string | null
  location: string | null
  summary: string | null
  experience: ParsedExp[]
  education: ParsedEdu[]
}

const HEADINGS: Record<string, string[]> = {
  experience: [
    'experience', 'work experience', 'professional experience', 'employment', 'employment history',
    'work history', 'career history', 'relevant experience',
  ],
  education: [
    'education', 'academic background', 'education & training', 'education and training',
    'academic qualifications', 'qualifications', 'educational qualifications',
  ],
  skills: ['skills', 'technical skills', 'key skills', 'core competencies', 'skills & tools', 'technologies'],
  summary: ['summary', 'professional summary', 'profile', 'about me', 'about', 'objective', 'career objective', 'personal statement'],
  other: [
    'projects', 'personal projects', 'certifications', 'certificates', 'languages', 'interests',
    'references', 'awards', 'achievements', 'publications', 'volunteer', 'volunteering', 'hobbies',
    'extracurricular activities', 'courses',
  ],
}

const HEADING_LOOKUP = new Map<string, string>()
for (const [key, names] of Object.entries(HEADINGS)) for (const n of names) HEADING_LOOKUP.set(n, key)

function headingOf(line: string): string | null {
  const t = line
    .trim()
    .replace(/^[#*\s]+/, '')
    .replace(/[:：\-–_=*#\s]+$/, '')
    .trim()
    .toLowerCase()
  if (!t || t.length > 32) return null
  return HEADING_LOOKUP.get(t) ?? null
}

function sectionBlocks(text: string): Record<string, string[]> {
  const out: Record<string, string[]> = { header: [] }
  let cur = 'header'
  for (const line of text.split('\n')) {
    const h = headingOf(line)
    if (h) {
      cur = h
      out[cur] ??= []
      continue
    }
    ;(out[cur] ??= []).push(line)
  }
  return out
}

const SKILL_BY_LOWER = new Map(SKILLS.map((s) => [s.toLowerCase(), s]))
const ALIAS_TO_SKILL = new Map<string, string>()
for (const [canonical, aliases] of Object.entries(SKILL_ALIASES)) {
  for (const a of aliases) ALIAS_TO_SKILL.set(a.toLowerCase(), canonical)
}

/** Known skills + any extra skills listed in the resume's "Skills" section. */
export function detectAllSkills(text: string): string[] {
  const found = detectSkills(text)
  const seen = new Set(found.map((s) => s.toLowerCase()))

  for (const rawLine of sectionBlocks(text).skills ?? []) {
    const line = rawLine.replace(/^[^:]{2,30}:\s*/, '')
    for (const part of line.split(/[,;|•·\u2022]/)) {
      const t = part.replace(/^[\s\-–*]+|[\s.]+$/g, '').trim()
      if (t.length < 2 || t.length > 40 || t.split(/\s+/).length > 4 || /^\d/.test(t)) continue
      const lower = t.toLowerCase()
      const name = SKILL_BY_LOWER.get(lower) ?? ALIAS_TO_SKILL.get(lower) ?? t
      if (seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      found.push(name)
    }
  }
  return found.slice(0, MAX_SKILLS)
}

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?'
const DATE = `(?:${MONTH}\\s+)?(?:19|20)\\d{2}`
const RANGE = new RegExp(`(${DATE})\\s*(?:-|–|—|to)\\s*(${DATE}|present|current|now|ongoing|today)`, 'i')
const BULLET = /^\s*[-•*·▪●–]\s*/
const COMPANY_HINT =
  /\b(inc|ltd|llc|corp|company|technologies|technology|solutions|pvt|plc|group|labs|systems|software|bank|consulting)\b/i

const cleanEdge = (s: string) => s.replace(/^[\s|·•,;:()\-–—@]+|[\s|·•,;:()\-–—@]+$/g, '').trim()

function titleCompany(parts: string[]): { title: string; company: string } {
  const clean = parts.map(cleanEdge).filter(Boolean)
  let a = clean[0] ?? ''
  let b = clean[1] ?? ''
  if (clean.length < 2) {
    const split = a.split(/\s+(?:at|@)\s+|\s*[|·]\s*|\s+[-–—]\s+|,\s+/i).map(cleanEdge).filter(Boolean)
    a = split[0] ?? ''
    b = split[1] ?? ''
  }
  if (COMPANY_HINT.test(a) && b && !COMPANY_HINT.test(b)) [a, b] = [b, a]
  return { title: a, company: b }
}

type Cur = { heads: string[]; duration: string; desc: string[]; needHead: boolean }

function parseExperience(lines: string[]): ParsedExp[] {
  const out: ParsedExp[] = []
  let cur = null as Cur | null
  let recent: string[] = []

  const push = (c: Cur) => {
    const { title, company } = titleCompany(c.heads)
    if (!title || out.length >= 20) return
    out.push({
      title: title.slice(0, 100),
      company: company.slice(0, 100),
      duration: c.duration.slice(0, 60),
      description: c.desc.join('\n').slice(0, 1000),
    })
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    const m = line.match(RANGE)
    if (m) {
      const rest = cleanEdge(line.replace(RANGE, ''))
      // the short lines right before a date line are this entry's title/company,
      // so take them back out of the previous entry's description
      const heads = recent.slice(-2)
      if (cur) for (let i = 0; i < heads.length; i++) cur.desc.pop()
      if (cur) push(cur)
      if (rest) heads.push(rest)
      cur = { heads, duration: m[0].replace(/\s+/g, ' '), desc: [], needHead: heads.length === 0 }
      recent = []
      continue
    }

    const bullet = BULLET.test(line)
    const short = !bullet && line.length <= 80 && !/[.!?]$/.test(line)

    if (!cur) {
      recent.push(line)
      recent = recent.slice(-2)
      continue
    }
    if (cur.needHead && short) {
      cur.heads.push(line)
      cur.needHead = false
      continue
    }
    cur.desc.push(bullet ? line.replace(BULLET, '') : line)
    if (short) recent = [...recent, line].slice(-2)
    else recent = []
  }
  if (cur) push(cur)
  return out
}

const DEGREE =
  /(bachelor|\bb\.?sc\b|\bbsc\b|\bb\.?eng\b|\bb\.?tech\b|master|\bm\.?sc\b|\bmsc\b|\bm\.?eng\b|\bmba\b|ph\.?d|doctorate|diploma|\bhnd\b|associate degree|\bbs\b|\bba\b|\bms\b)/i
const SCHOOL = /\b(university|college|institute|school|academy|polytechnic)\b/i

function parseEducation(lines: string[]): ParsedEdu[] {
  const out: ParsedEdu[] = []
  let cur = null as ParsedEdu | null
  let pendingSchool = ''

  const yearOf = (s: string) => {
    const years = s.match(/(?:19|20)\d{2}/g)
    return years ? years[years.length - 1] : ''
  }

  for (const raw of lines) {
    const t = raw.trim()
    if (!t) continue
    const year = yearOf(t)
    const segs = t
      .split(/\s*[|,·]\s*|\s+[-–—]\s+/)
      .map((s) => s.replace(/\b(?:19|20)\d{2}\b/g, '').replace(/[()]/g, '').replace(/\s*[-–—]\s*$/, '').trim())
      .filter(Boolean)
    const schoolSeg = segs.find((s) => SCHOOL.test(s)) ?? ''

    if (DEGREE.test(t)) {
      if (cur) out.push(cur)
      const degree = segs.filter((s) => s !== schoolSeg).join(', ') || segs[0] || ''
      cur = { degree: degree.slice(0, 100), school: (schoolSeg || pendingSchool).slice(0, 100), year }
      pendingSchool = ''
    } else if (schoolSeg) {
      if (cur && !cur.school) cur.school = schoolSeg.slice(0, 100)
      else pendingSchool = schoolSeg
      if (cur && !cur.year && year) cur.year = year
    } else if (year && cur && !cur.year) {
      cur.year = year
    }
  }
  if (cur) out.push(cur)
  return out.filter((e) => e.degree).slice(0, 10)
}

const EMAIL_OR_URL = /@|https?:\/\/|www\.|linkedin|github/i

/** Heuristic parser: no API key needed. */
export function parseResumeLocal(text: string): ParsedLite {
  const blocks = sectionBlocks(text)
  const header = (blocks.header ?? []).map((l) => l.trim()).filter(Boolean).slice(0, 10)

  const candidates = header.slice(1).filter(
    (l) => l.length >= 3 && l.length <= 80 && !EMAIL_OR_URL.test(l) && !/\d{5,}/.test(l.replace(/\D/g, ' '))
  )
  const headline = candidates[0] ?? null

  const labelled = header.find((l) => /^(location|address|based in)\s*:/i.test(l))
  const placeLike = candidates
    .filter((l) => l !== headline)
    .find((l) => /^[A-Z][\p{L} .'-]+,\s*[A-Z][\p{L} .'-]+$/u.test(l))
  const location = labelled ? labelled.replace(/^[^:]+:\s*/, '') : (placeLike ?? null)

  const summaryText = (blocks.summary ?? []).map((l) => l.trim()).filter(Boolean).join(' ')

  return {
    headline: headline ? headline.slice(0, 150) : null,
    location: location ? location.slice(0, 100) : null,
    summary: summaryText ? summaryText.slice(0, 500) : null,
    experience: parseExperience(blocks.experience ?? []),
    education: parseEducation(blocks.education ?? []),
  }
}

/** Make AI output safe for the profile form / validation (no nulls, length limits). */
export function normalizeParsed(raw: unknown): ParsedLite | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const list = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []

  return {
    headline: str(r.headline, 150) || null,
    location: str(r.location, 100) || null,
    summary: str(r.summary, 500) || null,
    experience: list(r.experience)
      .map((x) => ({
        title: str(x.title, 100),
        company: str(x.company, 100),
        duration: str(x.duration, 60),
        description: str(x.description, 1000),
      }))
      .filter((x) => x.title)
      .slice(0, 20),
    education: list(r.education)
      .map((x) => ({ degree: str(x.degree, 100), school: str(x.school, 100), year: str(x.year, 20) }))
      .filter((x) => x.degree)
      .slice(0, 10),
  }
}

/** Best-effort email / phone found in the resume, used to pre-fill the form. */
export function detectContact(text: string): { email?: string; phone?: string } {
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase()

  let phone: string | undefined
  for (const m of text.matchAll(/\+?\d[\d\s().-]{7,18}\d/g)) {
    const candidate = m[0].trim()
    const digits = candidate.replace(/\D/g, '')
    if (digits.length < 9 || digits.length > 15) continue
    // skip date ranges such as "2019-2021" or "2019 - 2021"
    if (/^(?:19|20)\d{2}\D+(?:19|20)\d{2}$/.test(candidate)) continue
    phone = candidate
    break
  }
  return { email, phone }
}