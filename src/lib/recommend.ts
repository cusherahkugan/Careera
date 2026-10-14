// Local (no API key needed) job scoring. It runs on every active job, then the
// best candidates are re-scored by the AI in ai.ts.

export interface CandidateProfile {
  skills: string[]
  preferredRoles: string[]
  currentDesignation?: string | null
  headline?: string | null
  resumeText?: string | null
  experienceCount: number
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
  roleMatch: boolean
}

const STOP_WORDS = new Set(['senior', 'junior', 'lead', 'the', 'and', 'for', 'engineer', 'developer'])

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

/** Whole-word match, so "Go" does not match "google" and "Java" does not match "JavaScript". */
function mentions(text: string, term: string): boolean {
  if (!text || !term) return false
  const caseSensitive = /^[A-Za-z]{1,3}$/.test(term) // "Go", "C", "R"
  const re = new RegExp(`(?<![A-Za-z0-9+#])${escapeRegex(term)}(?![A-Za-z0-9+#])`, caseSensitive ? '' : 'i')
  return re.test(text)
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
}

export function localMatch(candidate: CandidateProfile, job: JobForMatching): LocalMatch {
  const mySkills = new Set(candidate.skills.map(canon))
  const resume = candidate.resumeText ?? ''

  // 3) breadth: how many of the person's skills show up in the job text at all
  const jobText = `${job.title} ${job.description} ${job.requirements.join(' ')}`
  const mentionedSkills = candidate.skills.filter((s) => mentions(jobText, s))
  const breadth = Math.min(mentionedSkills.length / Math.max(Math.min(candidate.skills.length, 8), 1), 1)

  // 1) skills: full credit if listed on the profile, partial if only the resume mentions it
  const matchedSkills: string[] = []
  let skillPoints = 0
  for (const skill of job.skills) {
    if (mySkills.has(canon(skill))) {
      matchedSkills.push(skill)
      skillPoints += 1
    } else if (resume && mentions(resume, skill)) {
      matchedSkills.push(skill)
      skillPoints += 0.6
    }
  }

  // jobs posted without a skills list used to score 0 for everyone -
  // judge those by which of the candidate's skills the job text mentions
  const hasJobSkills = job.skills.length > 0
  if (!hasJobSkills) matchedSkills.push(...mentionedSkills.slice(0, 8))
  const skillScore = hasJobSkills ? Math.min(skillPoints / job.skills.length, 1) : breadth

  // 2) role: does the title look like something the person wants / does today?
  const title = job.title.toLowerCase()
  const wanted = [...candidate.preferredRoles, candidate.currentDesignation ?? ''].filter(Boolean)
  const titleTokens = new Set(tokens(job.title))
  let roleScore = 0
  let roleMatch = false
  for (const role of wanted) {
    const r = role.toLowerCase()
    if (title.includes(r) || (title.length > 4 && r.includes(title))) {
      roleScore = 1
      roleMatch = true
      break
    }
    const roleTokens = tokens(role)
    if (roleTokens.length > 0) {
      const overlap = roleTokens.filter((t) => titleTokens.has(t)).length / roleTokens.length
      roleScore = Math.max(roleScore, overlap * 0.7)
    }
  }
  if (roleScore >= 0.5) roleMatch = true

  const score = Math.round(100 * (0.6 * skillScore + 0.3 * roleScore + 0.1 * breadth))
  return { score, matchedSkills, roleMatch }
}

export function describeLocalMatch(job: JobForMatching, m: LocalMatch): string {
  const parts: string[] = []
  if (job.skills.length > 0) {
    parts.push(`Matches ${m.matchedSkills.length} of ${job.skills.length} required skills`)
  } else if (m.matchedSkills.length > 0) {
    parts.push(`Mentions ${m.matchedSkills.length} of your skills`)
  }
  if (m.roleMatch) parts.push('fits a role you are looking for')
  return parts.length > 0 ? parts.join(', ') + '.' : 'Based on your profile.'
}