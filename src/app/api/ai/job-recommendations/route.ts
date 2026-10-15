import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  aiEnabled,
  embeddingSimilarity,
  rankJobs,
  type EmbedResult,
  type RankResult,
} from '@/lib/ai'
import { describeLocalMatch, localMatch, type CandidateProfile } from '@/lib/recommend'

export const maxDuration = 30

const AI_POOL = 20 // best local matches that get embedding similarity
const LLM_POOL = 12 // best of those that also get an LLM review
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 15_000
const AI_COOLDOWN_MS = 5 * 60 * 1000 // only after a bad key / no quota
const CACHE_MS = 10 * 60 * 1000
const MIN_RESULTS = 5
const MAX_RESULTS = 12

// Same profile + same jobs within 10 minutes -> reuse the AI answer.
// Answers without any AI are NOT cached, so a fixed API key works immediately.
const cache = new Map<string, { at: number; body: unknown }>()
let aiDownUntil = 0
let aiDownReason: string | null = null

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      () => {
        clearTimeout(t)
        resolve(fallback)
      }
    )
  })
}

// GET /api/ai/job-recommendations[?refresh=1]
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user || session.user.role !== 'JOB_SEEKER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const refresh = new URL(req.url).searchParams.get('refresh') === '1'

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
        take: 200,
      }),
      prisma.application.findMany({
        where: { applicantId: session.user.id },
        select: { jobId: true },
      }),
    ])

    const appliedIds = new Set(applied.map((a) => a.jobId))
    const open = jobs.filter((j) => !appliedIds.has(j.id))

    const enabled = aiEnabled()
    const base = { totalAnalyzed: open.length, usedResume: !!profile.resumeText, aiEnabled: enabled }

    if (open.length === 0) {
      return NextResponse.json({
        ...base,
        recommendations: [],
        usedAI: false,
        aiError: null,
        message: 'There are no open jobs you have not applied to yet.',
      })
    }

    const cacheKey = `${session.user.id}:${profile.updatedAt.getTime()}:${open.map((j) => j.id).join(',')}`
    const hit = cache.get(cacheKey)
    if (!refresh && hit && Date.now() - hit.at < CACHE_MS) {
      return NextResponse.json(hit.body)
    }

    const candidate: CandidateProfile = {
      skills: profile.skills,
      preferredRoles: profile.preferredRoles,
      currentDesignation: profile.currentDesignation,
      headline: profile.headline,
      resumeText: profile.resumeText,
      experienceCount: profile.experience.length,
      experienceTitles: profile.experience
        .map((e) => (e as { title?: string } | null)?.title ?? '')
        .filter(Boolean),
    }

    // 1) cheap local score for every open job
    const scored = open
      .map((job) => {
        const local = localMatch(candidate, job)
        return { job, local }
      })
      .sort((a, b) => b.local.score - a.local.score)

    // 2) AI on the best local matches (embeddings + LLM review), never waiting long
    const pool = scored.slice(0, AI_POOL)
    let embed: EmbedResult = { scores: null, error: null, fatal: false }
    let rank: RankResult = { results: null, error: null, fatal: false }
    let aiError: string | null = null

    if (enabled) {
      if (Date.now() < aiDownUntil) {
        aiError = aiDownReason
      } else {
        aiDownReason = null
        ;[embed, rank] = await Promise.all([
          withTimeout<EmbedResult>(
            embeddingSimilarity(candidate, pool.map((p) => p.job)),
            AI_TIMEOUT_MS,
            { scores: null, error: 'Embedding request timed out', fatal: false }
          ),
          withTimeout<RankResult>(
            rankJobs(candidate, pool.slice(0, LLM_POOL).map((p) => p.job)),
            AI_TIMEOUT_MS,
            { results: null, error: 'AI review timed out', fatal: false }
          ),
        ])

        const fatal = embed.fatal || rank.fatal
        if (fatal) {
          aiDownReason = rank.error || embed.error
          aiDownUntil = Date.now() + AI_COOLDOWN_MS
        }
        if (!embed.scores && !rank.results) aiError = rank.error || embed.error
      }
    }

    // 3) blend whatever signals are available
    let recommendations = pool
      .map(({ job, local }) => {
        const r = rank.results?.[job.id]
        const e = embed.scores?.[job.id]

        let score = local.score
        if (r && e !== undefined) score = 0.4 * r.score + 0.25 * e + 0.35 * local.score
        else if (r) score = 0.65 * r.score + 0.35 * local.score
        else if (e !== undefined) score = 0.5 * e + 0.5 * local.score

        return {
          ...job,
          matchScore: Math.round(score),
          matchAnalysis: r?.analysis || describeLocalMatch(job, local),
          matchedSkills: local.matchedSkills,
          missingSkills: local.missingSkills,
        }
      })
      .filter((j) => j.matchScore >= 10)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, MAX_RESULTS)

    // never leave the seeker with an empty list: pad with the newest openings
    if (recommendations.length < MIN_RESULTS) {
      const have = new Set(recommendations.map((r) => r.id))
      const fillers = scored
        .filter(({ job }) => !have.has(job.id))
        .sort((a, b) => b.job.createdAt.getTime() - a.job.createdAt.getTime())
        .slice(0, MIN_RESULTS - recommendations.length)
        .map(({ job, local }) => ({
          ...job,
          matchScore: local.score,
          matchAnalysis: 'New opening you may be interested in.',
          matchedSkills: local.matchedSkills,
          missingSkills: local.missingSkills,
        }))
      recommendations = [...recommendations, ...fillers]
    }

    const usedAI = !!(rank.results || embed.scores)
    const body = {
      ...base,
      recommendations,
      usedAI,
      usedLLM: !!rank.results,
      usedEmbeddings: !!embed.scores,
      aiError: usedAI ? null : aiError,
    }

    if (usedAI) {
      cache.set(cacheKey, { at: Date.now(), body })
      if (cache.size > 200) cache.delete(cache.keys().next().value as string)
    }

    return NextResponse.json(body)
  } catch (error) {
    console.error('Job recommendations error:', error)
    return NextResponse.json({ error: 'Failed to generate recommendations' }, { status: 500 })
  }
}