import { CASE_SENSITIVE_SKILLS, SKILLS, SKILL_ALIASES } from '@/lib/constants'

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

/** Best-effort email / phone found in the resume, used to pre-fill the form. */
export function detectContact(text: string): { email?: string; phone?: string } {
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase()
  const phone = text.match(/(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?){2,4}\d{2,4}/)?.[0]?.trim()
  return {
    email,
    phone: phone && phone.replace(/\D/g, '').length >= 8 ? phone : undefined,
  }
}