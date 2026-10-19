// IT-sector filter for external jobs. No dependencies, so scripts can import it too.

export const IT_CATEGORIES = new Set([
  'Full Stack',
  'Frontend',
  'Backend',
  'Mobile',
  'DevOps / Cloud',
  'Data / AI',
  'QA / Testing',
  'Security',
  'Software Engineer',
  'Engineering Manager',
  'Product / Project',
  'Design',
  'Support / IT',
])

export const isITCategory = (category?: string | null) => !!category && IT_CATEGORIES.has(category)

// words that prove the posting is really about technology (not "security guard", "mobile crane", ...)
const TECH_WORDS = new RegExp(
  '\\b(' +
    [
      'software', 'developer', 'programmer', 'programming', 'javascript', 'typescript', 'python',
      'java', 'golang', 'php', 'ruby', 'rust', 'kotlin', 'swift', 'react', 'angular', 'vue',
      'node', 'django', 'spring', 'sql', 'nosql', 'mongodb', 'postgres', 'postgresql', 'mysql',
      'aws', 'azure', 'gcp', 'cloud', 'kubernetes', 'docker', 'terraform', 'devops', 'sre',
      'api', 'apis', 'backend', 'back-end', 'frontend', 'front-end', 'full[\\s-]?stack',
      'android', 'ios', 'flutter', 'machine learning', 'artificial intelligence', 'ai',
      'data (engineer|engineering|scientist|science|analyst|analytics)', 'cyber ?security',
      'infosec', 'network (engineer|administrator|admin)', 'linux', 'git', 'qa',
      'test automation', 'selenium', 'cypress', 'it support', 'help ?desk', 'sysadmin',
      'system administrator', 'ui/ux', 'figma', 'computer science', 'saas', 'database', 'etl',
      'web (developer|development|application|applications)',
    ].join('|') +
    ')\\b',
  'i'
)
const TECH_SYMBOLS = /c\+\+|c#|\.net/i

export function isITJob(title: string, category: string, text: string): boolean {
  if (!IT_CATEGORIES.has(category)) return false
  const hay = `${title}\n${text.slice(0, 6000)}`
  return TECH_WORDS.test(hay) || TECH_SYMBOLS.test(hay)
}