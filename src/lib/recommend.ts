// Local (no API key needed) job scoring. It runs on every active job; the best
// candidates are then re-scored with embeddings and an LLM (see ai.ts).

export interface CandidateProfile {
  skills: string[]
  preferredRoles: string[]
  currentDesignation?: string | null
  headline?: string | null
  resumeText?: string | null
  experienceCount: number
  /** job titles from the candidate's work history */
  experienceTitles?: string[]
}

export interface JobForMatching {
  id: string
  title: string
  description: string
  skills: string[]
  requirements: string[]
}

export interface LocalMatch {
  score: number
  matchedSkills: string[]
  missingSkills: string[]
  roleMatch: boolean
  /** 0-1: how much of the candidate's profile vocabulary appears in the job */
  similarity: number
}

const STOP_WORDS = new Set([
  'senior', 'junior', 'lead', 'engineer', 'developer', 'the', 'and', 'for', 'with', 'you', 'your',
  'our', 'are', 'will', 'have', 'has', 'from', 'this', 'that', 'who', 'what', 'work', 'working',
  'team', 'teams', 'experience', 'years', 'year', 'strong', 'ability', 'skills', 'skill',
  'knowledge', 'good', 'great', 'including', 'etc', 'such', 'using', 'use', 'new', 'join',
  'role', 'job', 'looking', 'seeking', 'we', 'to', 'of', 'in', 'on', 'at', 'as', 'an', 'is', 'be',
  'or', 'by', 'it', 'its', 'about', 'more', 'also', 'can', 'all', 'any', 'their', 'them', 'they',
  'across', 'into', 'out', 'high', 'quality', 'help', 'build', 'make', 'based', 'within', 'js',
])

const ALIASES: Record<string, string> = {
  postgres: 'postgresql',
  k8s: 'kubernetes',
  golang: 'go',
  tailwindcss: 'tailwind',
  restapis: 'rest',
  restapi: 'rest',
  restful: 'rest',
  uiux: 'uiuxdesign',
  gcp: 'googlecloud',
  mongo: 'mongodb',
  cicd: 'cicd',
  continuousintegration: 'cicd',
  reactjs: 'react',
  nodejs: 'node',
  nextjs: 'next',
  vuejs: 'vue',
  ts: 'typescript',
  py: 'python',
  ml: 'machinelearning',
}

/** "Node.js" / "NodeJS" / "node js" -> "node"; "Tailwind CSS" -> "tailwind" */
function canon(skill: string): string {
  let s = skill.toLowerCase().replace(/[^a-z0-9+#]/g, '')
  if (s.length > 4 && s.endsWith('js')) s = s.slice(0, -2)
  return ALIASES[s] ?? s
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}

/** Everyday English words that are also skill names: only match with exact capitalisation. */
const AMBIGUOUS = new Set(['go', 'swift', 'express', 'excel', 'sales', 'r', 'c', 'rust', 'spring'])

/** Whole-word match, so "Go" does not match "google" and "Java" does not match "JavaScript". */
function mentions(text: string, term: string): boolean {
  if (!text || !term) return false
  const caseSensitive = AMBIGUOUS.has(term.toLowerCase())
  const re = new RegExp(`(?<![A-Za-z0-9+#])${escapeRegex(term)}(?![A-Za-z0-9+#])`, caseSensitive ? '' : 'i')
  return re.test(text)
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t))
    .map((t) => ALIASES[t] ?? t)
}

/** Weighted vocabulary of the candidate: skills count most, resume words least. */
function candidateWeights(c: CandidateProfile): Map<string, number> {
  const m = new Map<string, number>()
  const add = (text: string, w: number) => {
    for (const t of new Set(tokenize(text))) m.set(t, (m.get(t) ?? 0) + w)
  }
  for (const s of c.skills) add(s, 3)
  for (const r of c.preferredRoles) add(r, 2)
  add(c.currentDesignation ?? '', 2)
  add(c.headline ?? '', 1.5)
  for (const t of c.experienceTitles ?? []) add(t, 1.5)

  if (c.resumeText) {
    const counts = new Map<string, number>()
    for (const t of tokenize(c.resumeText.slice(0, 8000))) counts.set(t, (counts.get(t) ?? 0) + 1)
    for (const [t, n] of counts) m.set(t, (m.get(t) ?? 0) + Math.min(n * 0.3, 1.5))
  }

  // keep the 60 most important words so long resumes do not drown the signal
  return new Map([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60))
}

export function localMatch(candidate: CandidateProfile, job: JobForMatching): LocalMatch {
  const mySkills = new Set(candidate.skills.map(canon))
  const resume = candidate.resumeText ?? ''
  const jobText = `${job.title} ${job.description} ${job.requirements.join(' ')} ${job.skills.join(' ')}`

  // 1) vocabulary similarity (profile + resume vs the whole job text)
  const weights = candidateWeights(candidate)
  const jobTokens = new Set(tokenize(jobText))
  let total = 0
  let found = 0
  for (const [t, w] of weights) {
    total += w
    if (jobTokens.has(t)) found += w
  }
  const similarity = total > 0 ? found / total : 0
  const simScore = Math.min(similarity / 0.5, 1)

  // 2) skills: full credit if on the profile, partial if only the resume mentions it
  const matchedSkills: string[] = []
  const missingSkills: string[] = []
  let skillPoints = 0
  for (const skill of job.skills) {
    if (mySkills.has(canon(skill))) {
      matchedSkills.push(skill)
      skillPoints += 1
    } else if (resume && mentions(resume, skill)) {
      matchedSkills.push(skill)
      skillPoints += 0.6
    } else {
      missingSkills.push(skill)
    }
  }

  // jobs posted without a skills list: judge by which of the candidate's skills the text mentions
  const hasJobSkills = job.skills.length > 0
  const mentioned = candidate.skills.filter((s) => mentions(jobText, s))
  if (!hasJobSkills) matchedSkills.push(...mentioned.slice(0, 8))
  const breadth = Math.min(mentioned.length / Math.max(Math.min(candidate.skills.length, 8), 1), 1)
  const skillScore = hasJobSkills ? Math.min(skillPoints / job.skills.length, 1) : breadth

  // 3) role: does the title look like something the person wants / does today?
  const title = job.title.toLowerCase()
  const wanted = [
    ...candidate.preferredRoles,
    candidate.currentDesignation ?? '',
    ...(candidate.experienceTitles ?? []).slice(0, 2),
  ].filter(Boolean)
  const titleTokens = new Set(tokenize(job.title))
  let roleScore = 0
  let roleMatch = false
  for (const role of wanted) {
    const r = role.toLowerCase()
    if (title.includes(r) || (title.length > 4 && r.includes(title))) {
      roleScore = 1
      roleMatch = true
      break
    }
    const roleTokens = tokenize(role)
    if (roleTokens.length > 0) {
      const overlap = roleTokens.filter((t) => titleTokens.has(t)).length / roleTokens.length
      roleScore = Math.max(roleScore, overlap * 0.85)
    }
  }
  if (roleScore >= 0.5) roleMatch = true

  const score = Math.round(100 * (0.5 * skillScore + 0.25 * roleScore + 0.25 * simScore))
  return { score, matchedSkills, missingSkills: missingSkills.slice(0, 6), roleMatch, similarity }
}

export function describeLocalMatch(job: JobForMatching, m: LocalMatch): string {
  const parts: string[] = []
  if (job.skills.length > 0) {
    parts.push(`Matches ${m.matchedSkills.length} of ${job.skills.length} required skills`)
  } else if (m.matchedSkills.length > 0) {
    parts.push(`Mentions ${m.matchedSkills.length} of your skills`)
  }
  if (m.roleMatch) parts.push('fits a role you are looking for')
  if (m.missingSkills.length > 0 && m.matchedSkills.length > 0) {
    parts.push(`you could add ${m.missingSkills.slice(0, 3).join(', ')}`)
  }
  return parts.length > 0 ? parts.join(', ') + '.' : 'Based on your profile.'
}