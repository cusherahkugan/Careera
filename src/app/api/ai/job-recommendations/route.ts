import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { rankJobsWithAI } from '@/lib/ai'
import {
  describeLocalMatch,
  localMatch,
  type CandidateProfile,
} from '@/lib/recommend'

const AI_CANDIDATES = 15 // only the best local matches are sent to the AI
const AI_TIMEOUT_MS = 8_000 // never make the dashboard wait longer than this for the AI
const AI_COOLDOWN_MS = 5 * 60 * 1000 // after an AI failure, skip it for a while
const CACHE_MS = 10 * 60 * 1000
const MIN_RESULTS = 5

// Same profile + same jobs within 10 minutes -> reuse the AI answer.
// Local-only answers are NOT cached, so a fixed API key works immediately.
const cache = new Map<string, { at: number; body: unknown }>()
let aiDownUntil = 0

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      () => {
        clearTimeout(t)
        resolve(null)
      }
    )
  })
}

// GET /api/ai/job-recommendations
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user || session.user.role !== 'JOB_SEEKER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profile = await prisma.profile.findUnique({
      where: { userId: session.user.id },
    })

    if (!profile || !profile.onboardingCompleted) {
      return NextResponse.json(
        { error: 'Complete your profile to get job recommendations', needsProfile: true },
        { status: 400 }
      )
    }

    const [jobs, applied] = await Promise.all([
      prisma.job.findMany({
        where: { isActive: true },
        include: { company: { select: { name: true, location: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.application.findMany({
        where: { applicantId: session.user.id },
        select: { jobId: true },
      }),
    ])

    const appliedIds = new Set(applied.map((a) => a.jobId))
    const open = jobs.filter((j) => !appliedIds.has(j.id))

    const cacheKey = `${session.user.id}:${profile.updatedAt.getTime()}:${open.map((j) => j.id).join(',')}`
    const hit = cache.get(cacheKey)
    if (hit && Date.now() - hit.at < CACHE_MS) {
      return NextResponse.json(hit.body)
    }

    const candidate: CandidateProfile = {
      skills: profile.skills,
      preferredRoles: profile.preferredRoles,
      currentDesignation: profile.currentDesignation,
      headline: profile.headline,
      resumeText: profile.resumeText,
      experienceCount: profile.experience.length,
    }

    // 1) cheap local score for every open job
    const scored = open
      .map((job) => {
        const m = localMatch(candidate, job)
        return { job, local: m, localScore: m.score }
      })
      .sort((a, b) => b.localScore - a.localScore)

    // 2) let the AI re-score the best ones - but never wait long for it
    const top = scored.slice(0, AI_CANDIDATES)
    let ai: Awaited<ReturnType<typeof rankJobsWithAI>> = null
    if (Date.now() >= aiDownUntil) {
      ai = await withTimeout(
        rankJobsWithAI(
          candidate,
          top.map(({ job }) => job)
        ),
        AI_TIMEOUT_MS
      )
      if (!ai) aiDownUntil = Date.now() + AI_COOLDOWN_MS
    }

    let recommendations = top
      .map(({ job, local, localScore }) => {
        const aiResult = ai?.[job.id]
        const matchScore = aiResult ? Math.round(0.7 * aiResult.score + 0.3 * localScore) : localScore
        return {
          ...job,
          matchScore,
          matchAnalysis: aiResult?.analysis || describeLocalMatch(job, local),
          matchedSkills: local.matchedSkills,
        }
      })
      .filter((j) => j.matchScore >= 15)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 10)

    // never leave the seeker with an empty list: pad with the newest openings
    if (recommendations.length < MIN_RESULTS) {
      const have = new Set(recommendations.map((r) => r.id))
      const fillers = scored
        .filter(({ job }) => !have.has(job.id))
        .sort((a, b) => b.job.createdAt.getTime() - a.job.createdAt.getTime())
        .slice(0, MIN_RESULTS - recommendations.length)
        .map(({ job, local, localScore }) => ({
          ...job,
          matchScore: localScore,
          matchAnalysis: 'New opening you may be interested in.',
          matchedSkills: local.matchedSkills,
        }))
      recommendations = [...recommendations, ...fillers]
    }

    const body = {
      recommendations,
      totalAnalyzed: open.length,
      usedAI: !!ai,
      usedResume: !!profile.resumeText,
    }

    if (ai) {
      cache.set(cacheKey, { at: Date.now(), body })
      if (cache.size > 200) cache.delete(cache.keys().next().value as string)
    }

    return NextResponse.json(body)
  } catch (error) {
    console.error('Job recommendations error:', error)
    return NextResponse.json({ error: 'Failed to generate recommendations' }, { status: 500 })
  }
}