import { NextResponse } from 'next/server'
import { syncExternalJobs } from '@/lib/external-jobs'

export const maxDuration = 60

// Called every 6 hours by the scheduler (GitHub Actions / Vercel cron).
// Protected with CRON_SECRET:  Authorization: Bearer <CRON_SECRET>
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const summary = await syncExternalJobs()
    return NextResponse.json(summary)
  } catch (error) {
    console.error('External job sync failed:', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}