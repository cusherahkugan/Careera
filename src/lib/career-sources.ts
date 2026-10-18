// The companies whose career pages are synced. Each one is read through the
// public job-board API of the applicant tracking system (ATS) it uses.
// Tokens can change; a wrong token only logs an error for that company.
// Add more here, or without code changes via CAREER_SOURCES_EXTRA in .env.

export type Ats = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'recruitee'

export interface CareerSource {
  company: string
  ats: Ats
  /** the company's id on that ATS (see the guide for how to find it) */
  token: string
  /** public careers page; defaults to the ATS-hosted board */
  careersUrl?: string
}

export const ATS_LABEL: Record<Ats, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  workable: 'Workable',
  recruitee: 'Recruitee',
}

export function defaultCareersUrl(s: CareerSource): string {
  switch (s.ats) {
    case 'greenhouse':
      return `https://boards.greenhouse.io/${s.token}`
    case 'lever':
      return `https://jobs.lever.co/${s.token}`
    case 'ashby':
      return `https://jobs.ashbyhq.com/${s.token}`
    case 'workable':
      return `https://apply.workable.com/${s.token}/`
    case 'recruitee':
      return `https://${s.token}.recruitee.com/`
  }
}

const STARTER: CareerSource[] = [
  { company: 'Stripe', ats: 'greenhouse', token: 'stripe', careersUrl: 'https://stripe.com/jobs' },
  { company: 'Airbnb', ats: 'greenhouse', token: 'airbnb', careersUrl: 'https://careers.airbnb.com' },
  { company: 'Figma', ats: 'greenhouse', token: 'figma', careersUrl: 'https://www.figma.com/careers/' },
  { company: 'Discord', ats: 'greenhouse', token: 'discord', careersUrl: 'https://discord.com/careers' },
  { company: 'Datadog', ats: 'greenhouse', token: 'datadog', careersUrl: 'https://careers.datadoghq.com' },
  { company: 'Cloudflare', ats: 'greenhouse', token: 'cloudflare', careersUrl: 'https://www.cloudflare.com/careers/' },
  { company: 'GitLab', ats: 'greenhouse', token: 'gitlab', careersUrl: 'https://about.gitlab.com/jobs/' },
  { company: 'MongoDB', ats: 'greenhouse', token: 'mongodb', careersUrl: 'https://www.mongodb.com/careers' },
  { company: 'Coinbase', ats: 'greenhouse', token: 'coinbase', careersUrl: 'https://www.coinbase.com/careers' },
  { company: 'Twilio', ats: 'greenhouse', token: 'twilio', careersUrl: 'https://www.twilio.com/en-us/company/jobs' },
  { company: 'Vercel', ats: 'greenhouse', token: 'vercel', careersUrl: 'https://vercel.com/careers' },
  { company: 'Databricks', ats: 'greenhouse', token: 'databricks', careersUrl: 'https://www.databricks.com/company/careers' },
  { company: 'Spotify', ats: 'lever', token: 'spotify', careersUrl: 'https://www.lifeatspotify.com/jobs' },
  { company: 'Palantir', ats: 'lever', token: 'palantir', careersUrl: 'https://www.palantir.com/careers/' },
  { company: 'OpenAI', ats: 'ashby', token: 'openai', careersUrl: 'https://openai.com/careers' },
  { company: 'Notion', ats: 'ashby', token: 'notion', careersUrl: 'https://www.notion.so/careers' },
  { company: 'Ramp', ats: 'ashby', token: 'ramp', careersUrl: 'https://ramp.com/careers' },
  { company: 'Linear', ats: 'ashby', token: 'linear', careersUrl: 'https://linear.app/careers' },
]

/**
 * CAREER_SOURCES_EXTRA="Acme|greenhouse|acme|https://acme.com/careers;Foo|lever|foo"
 * format per entry: Company|ats|token|optional careers url   (entries split by ;)
 */
function fromEnv(): CareerSource[] {
  const raw = process.env.CAREER_SOURCES_EXTRA?.trim()
  if (!raw) return []
  return raw
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const [company, ats, token, careersUrl] = entry.split('|').map((p) => p.trim())
      if (!company || !token || !(ats in ATS_LABEL)) return []
      return [{ company, ats: ats as Ats, token, careersUrl: careersUrl || undefined }]
    })
}

export function getCareerSources(): CareerSource[] {
  const seen = new Set<string>()
  return [...STARTER, ...fromEnv()].filter((s) => {
    const key = `${s.ats}:${s.token.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}