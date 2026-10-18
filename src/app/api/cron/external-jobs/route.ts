import { NextResponse } from 'next/server'
import { syncExternalJobs } from '@/lib/external-jobs'

export const maxDuration = 60

// Called by the scheduler. Protected with CRON_SECRET.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const summary = await syncExternalJobs()
  return NextResponse.json(summary)
}