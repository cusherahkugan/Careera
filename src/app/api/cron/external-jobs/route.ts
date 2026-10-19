import { NextResponse } from 'next/server'
import { syncExternalJobs } from '@/lib/external-jobs'

export const maxDuration = 60

// Called by the scheduler (GitHub Actions / Vercel cron).
// Protected with CRON_SECRET:  Authorization: Bearer <CRON_SECRET>
// Add ?force=1 to ignore the JSearch "once per 24h" guard (use sparingly, it spends quota).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const force = new URL(req.url).searchParams.get('force') === '1'
    const summary = await syncExternalJobs({ force })
    return NextResponse.json(summary)
  } catch (error) {
    console.error('External job sync failed:', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}