// Cheap, dependency-free English check used when saving external jobs.

const EN = new Set([
  'the', 'and', 'to', 'of', 'a', 'in', 'for', 'with', 'you', 'we', 'our', 'is', 'are', 'will',
  'experience', 'team', 'work', 'as', 'on', 'be', 'or', 'your', 'have', 'skills', 'years',
  'that', 'this', 'from', 'by', 'at', 'an', 'role', 'looking', 'responsibilities', 'requirements',
])

// very common words in German, French, Spanish, Portuguese, Italian, Dutch
const OTHER = new Set([
  'und', 'der', 'die', 'das', 'mit', 'für', 'wir', 'sie', 'ein', 'eine', 'nicht', 'werden', 'bei',
  'les', 'des', 'pour', 'vous', 'nous', 'une', 'est', 'dans', 'avec', 'sur',
  'para', 'con', 'los', 'las', 'una', 'del', 'por', 'como', 'más',
  'você', 'uma', 'não', 'com', 'ser', 'sua',
  'per', 'della', 'che', 'sono', 'gli',
  'het', 'een', 'voor', 'van', 'wij', 'jij',
])

export function isEnglish(text: string): boolean {
  const sample = (text || '').slice(0, 1500)
  const letters = sample.match(/\p{L}/gu) ?? []
  if (letters.length < 20) return false

  const latin = (sample.match(/[A-Za-z]/g) ?? []).length
  if (latin / letters.length < 0.9) return false // Cyrillic, CJK, Arabic, ...

  const accents = (sample.match(/[À-ÿ]/g) ?? []).length
  if (accents / letters.length > 0.02) return false // French / German / Spanish ...

  const words = sample.toLowerCase().match(/[a-zà-ÿ']+/g) ?? []
  if (words.length === 0) return false

  let en = 0
  let other = 0
  for (const w of words) {
    if (EN.has(w)) en++
    else if (OTHER.has(w)) other++
  }
  if (words.length < 15) return other === 0 && en >= 1
  return en / words.length >= 0.1 && en > other * 2
}

export const hasContent = (summary?: string | null) => (summary ?? '').trim().length >= 80