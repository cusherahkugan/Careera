import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Navbar } from '@/components/navbar'

const steps = [
  {
    n: '1',
    title: 'Make a profile',
    text: 'Add your skills, your experience and your resume. You do it once.',
  },
  {
    n: '2',
    title: 'Get matched',
    text: 'Our AI reads your profile and resume and ranks open jobs by how well they fit you.',
  },
  {
    n: '3',
    title: 'Know where you stand',
    text: 'Every application shows its status, from pending to interview, in your dashboard.',
  },
]

const popular = ['Frontend', 'Designer', 'DevOps', 'Remote', 'Intern']

export default async function HomePage() {
  let session = null
  try {
    session = await getServerSession(authOptions)
  } catch {
    session = null
  }
  const role = session?.user.role
  const loggedIn = !!session?.user
  const isRecruiter = role === 'RECRUITER'

  return (
    <div className="min-h-screen bg-white text-zinc-800">
      <Navbar />

      <section className="mx-auto max-w-6xl px-5 pb-20 pt-20 md:pt-28">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-red-600">
          AI-assisted recruitment
        </p>
        <h1 className="max-w-3xl font-serif text-4xl font-bold leading-tight text-zinc-900 md:text-6xl">
          {isRecruiter
            ? 'Find the right people for your team.'
            : 'Find work you\u2019d actually look forward to.'}
        </h1>
        <p className="mt-6 max-w-xl text-lg text-zinc-600">
          {isRecruiter
            ? 'Post roles, see every applicant ranked by how well they match your requirements, and move people through review, interview and offer.'
            : 'Build one profile, get jobs recommended by AI, apply in a click, and keep track of every application in one place.'}
        </p>

        {isRecruiter ? (
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/dashboard" className="rounded bg-red-600 px-6 py-3 font-medium text-white hover:bg-red-700">
              Company dashboard
            </Link>
            <Link href="/dashboard/jobs/new" className="rounded border border-zinc-300 px-6 py-3 font-medium text-zinc-800 hover:border-red-600 hover:text-red-600">
              Post a job
            </Link>
          </div>
        ) : (
          <>
            <form action="/jobs" method="get" className="mt-10 flex max-w-xl gap-2">
              <input
                name="search"
                placeholder="Job title or keyword"
                className="w-full rounded border border-zinc-300 px-4 py-3 text-zinc-900 placeholder-zinc-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
              />
              <button className="rounded bg-red-600 px-6 py-3 font-medium text-white hover:bg-red-700">
                Search
              </button>
            </form>
            <p className="mt-4 text-sm text-zinc-500">
              Popular:{' '}
              {popular.map((p, i) => (
                <span key={p}>
                  <Link
                    href={`/jobs?search=${encodeURIComponent(p)}`}
                    className="underline decoration-zinc-300 underline-offset-4 hover:text-red-600"
                  >
                    {p}
                  </Link>
                  {i < popular.length - 1 ? ', ' : ''}
                </span>
              ))}
            </p>
          </>
        )}
      </section>

      <section className="border-t border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="font-serif text-3xl font-bold text-zinc-900">How it works</h2>
          <div className="mt-12 grid gap-10 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n}>
                <div className="font-serif text-5xl font-bold text-red-600">{s.n}</div>
                <h3 className="mt-3 text-lg font-semibold text-zinc-900">{s.title}</h3>
                <p className="mt-2 text-zinc-600">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-12 px-5 py-20 md:grid-cols-2">
        <div className="border-t-4 border-red-600 pt-6">
          <h2 className="font-serif text-2xl font-bold text-zinc-900">If you&apos;re looking</h2>
          <ul className="mt-4 space-y-2 text-zinc-600">
            <li>Browse every open role and every company without an account.</li>
            <li>Get AI recommendations based on your skills and resume.</li>
            <li>Track each application from pending to offer.</li>
          </ul>
          {!loggedIn ? (
            <Link href="/register?role=seeker" className="mt-6 inline-block font-medium text-red-600 underline underline-offset-4 hover:text-red-700">
              Create a profile
            </Link>
          ) : !isRecruiter ? (
            <Link href="/dashboard" className="mt-6 inline-block font-medium text-red-600 underline underline-offset-4 hover:text-red-700">
              See my recommendations
            </Link>
          ) : null}
        </div>
        <div className="border-t-4 border-zinc-900 pt-6">
          <h2 className="font-serif text-2xl font-bold text-zinc-900">If you&apos;re hiring</h2>
          <ul className="mt-4 space-y-2 text-zinc-600">
            <li>Post a role in a few minutes, with an AI-written description if you like.</li>
            <li>See every applicant and their match with your requirements.</li>
            <li>Schedule interviews and message candidates in one place.</li>
          </ul>
          {!loggedIn ? (
            <Link href="/register?role=recruiter" className="mt-6 inline-block font-medium text-zinc-900 underline underline-offset-4 hover:text-red-600">
              Post a job
            </Link>
          ) : isRecruiter ? (
            <Link href="/dashboard/jobs/new" className="mt-6 inline-block font-medium text-zinc-900 underline underline-offset-4 hover:text-red-600">
              Post a job
            </Link>
          ) : null}
        </div>
      </section>

      <section className="bg-red-600">
        <div className="mx-auto max-w-6xl px-5 py-16 text-center">
          <h2 className="font-serif text-3xl font-bold text-white">Ready when you are.</h2>
          <p className="mx-auto mt-3 max-w-lg text-red-50">
            {loggedIn ? 'Pick up where you left off.' : 'Free to join. It takes a minute to set up.'}
          </p>
          <Link
            href={loggedIn ? '/dashboard' : '/register'}
            className="mt-8 inline-block rounded bg-white px-8 py-3 font-semibold text-red-700 hover:bg-red-50"
          >
            {loggedIn ? 'Go to dashboard' : 'Create an account'}
          </Link>
        </div>
      </section>

      <footer className="border-t border-zinc-200">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-zinc-500 sm:flex-row">
          <span className="font-serif text-lg font-bold text-zinc-900">
            Careera<span className="text-red-600">.</span>
          </span>
          <div className="flex gap-6">
            {!isRecruiter && <Link href="/jobs" className="hover:text-red-600">Jobs</Link>}
            {!isRecruiter && <Link href="/companies" className="hover:text-red-600">Companies</Link>}
            {!loggedIn && <Link href="/register?role=recruiter" className="hover:text-red-600">Employers</Link>}
            {!loggedIn ? (
              <Link href="/login" className="hover:text-red-600">Sign in</Link>
            ) : (
              <Link href="/dashboard" className="hover:text-red-600">Dashboard</Link>
            )}
          </div>
          <span>© {new Date().getFullYear()} Careera</span>
        </div>
      </footer>
    </div>
  )
}