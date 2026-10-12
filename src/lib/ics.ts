const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

const esc = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Minimal iCalendar file so candidates can add the interview to Google/Outlook/Apple calendar. */
export function buildIcs(o: {
  uid: string
  start: Date
  durationMins: number
  summary: string
  description?: string
  location?: string
  cancel?: boolean
  sequence?: number
}): string {
  const end = new Date(o.start.getTime() + o.durationMins * 60_000)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Careera//Interviews//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${o.cancel ? 'CANCEL' : 'REQUEST'}`,
    'BEGIN:VEVENT',
    `UID:${o.uid}`,
    `SEQUENCE:${o.sequence ?? 0}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(o.start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(o.summary)}`,
    ...(o.description ? [`DESCRIPTION:${esc(o.description)}`] : []),
    ...(o.location ? [`LOCATION:${esc(o.location)}`] : []),
    `STATUS:${o.cancel ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.join('\r\n')
}