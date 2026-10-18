'use client'

import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { useSession } from 'next-auth/react'
import { Navbar } from '@/components/navbar' // <- use `import Navbar from ...` if it's a default export
import {
  formatDateTime,
  interviewStatusColors,
  interviewStatusLabels,
} from '@/lib/utils'

type CalInterview = {
  id: string
  scheduledAt: string
  status: string
  application?: {
    job?: {
      title?: string
      company?: { name?: string }
      recruiter?: { name?: string }
    }
  }
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

export default function CalendarPage() {
  useSession()
  const [offset, setOffset] = useState(0) // months from current month
  const [items, setItems] = useState<CalInterview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth() + offset, 1)
  const nextMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
  const daysInMonth = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + 1,
    0
  ).getDate()
  const leadingBlanks = monthStart.getDay()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    axios
      .get('/api/interviews', {
        params: {
          from: monthStart.toISOString(),
          to: nextMonthStart.toISOString(),
        },
      })
      .then((res) => {
        if (cancelled) return
        const d = res.data
        const list = Array.isArray(d) ? d : d?.interviews ?? d?.data ?? []
        setItems(list)
      })
      .catch((e) => {
        if (cancelled) return
        setError(
          e?.response?.data?.error ||
            e?.response?.data?.message ||
            'Could not load interviews'
        )
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset])

  const byDay = useMemo(() => {
    const map = new Map<string, CalInterview[]>()
    for (const it of items) {
      const k = dayKey(new Date(it.scheduledAt))
      map.set(k, [...(map.get(k) ?? []), it])
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      )
    }
    return map
  }, [items])

  const cells: (number | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  const totalRows = cells.length / 7

  const monthLabel = monthStart.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-zinc-50">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-serif text-3xl text-zinc-900">Interview calendar</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOffset((o) => o - 1)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-100"
              aria-label="Previous month"
            >
              ←
            </button>
            <span className="min-w-40 text-center font-medium text-zinc-800">
              {monthLabel}
            </span>
            <button
              onClick={() => setOffset((o) => o + 1)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-100"
              aria-label="Next month"
            >
              →
            </button>
            {offset !== 0 && (
              <button
                onClick={() => setOffset(0)}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
              >
                Today
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-zinc-200 bg-white">
          <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-100 text-center text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>

          <div className={`grid grid-cols-7 ${loading ? 'opacity-60' : ''}`}>
            {cells.map((day, idx) => {
              const col = idx % 7
              const row = Math.floor(idx / 7)
              if (day === null) {
                return (
                  <div
                    key={idx}
                    className="min-h-28 border-b border-r border-zinc-100 bg-zinc-50/50"
                  />
                )
              }
              const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day)
              const list = byDay.get(dayKey(date)) ?? []
              const isToday = dayKey(date) === dayKey(today)

              // keep popover inside the grid
              const horiz = col >= 4 ? 'right-0' : 'left-0'
              const vert = row >= totalRows - 2 && totalRows > 2 ? 'bottom-full mb-1' : 'top-full mt-1'

              return (
                <div
                  key={idx}
                  tabIndex={list.length ? 0 : -1}
                  className="group relative min-h-28 border-b border-r border-zinc-100 p-1.5 outline-none hover:bg-red-50/40 focus:bg-red-50/40"
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                      isToday ? 'bg-red-600 font-semibold text-white' : 'text-zinc-600'
                    }`}
                  >
                    {day}
                  </span>

                  <div className="mt-1 space-y-1">
                    {list.slice(0, 2).map((it) => (
                      <div
                        key={it.id}
                        className="truncate rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700"
                      >
                        Interview @ {it.application?.job?.company?.name ?? 'Company'}
                      </div>
                    ))}
                    {list.length > 2 && (
                      <div className="px-1 text-[11px] text-zinc-500">
                        +{list.length - 2} more
                      </div>
                    )}
                  </div>

                  {list.length > 0 && (
                    <div
                      className={`invisible absolute z-30 w-80 ${horiz} ${vert} rounded-xl border border-zinc-200 bg-white p-3 opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100`}
                    >
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        {date.toLocaleDateString(undefined, {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                        })}
                      </p>
                      <ul className="space-y-3">
                        {list.map((it) => {
                          const job = it.application?.job
                          const when = new Date(it.scheduledAt)
                          return (
                            <li
                              key={it.id}
                              className="border-l-2 border-red-600 pl-3 text-sm"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-semibold text-zinc-900">
                                  {job?.company?.name ?? 'Company'}
                                </p>
                                <span
                                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                    (interviewStatusColors as Record<string, string>)[it.status] ?? ''
                                  }`}
                                >
                                  {(interviewStatusLabels as Record<string, string>)[it.status] ??
                                    it.status}
                                </span>
                              </div>
                              <p className="text-zinc-700">{job?.title ?? 'Role'}</p>
                              <p className="text-xs text-zinc-500">
                                Interviewer: {job?.recruiter?.name ?? 'Not specified'}
                              </p>
                              <p className="text-xs text-zinc-500">
                                {when.toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}{' '}
                                · {formatDateTime(it.scheduledAt)}
                              </p>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {!loading && !error && items.length === 0 && (
          <p className="mt-4 text-center text-sm text-zinc-500">
            No interviews scheduled in {monthLabel}.
          </p>
        )}
      </main>
    </div>
  )
}