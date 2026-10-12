'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { useSession } from 'next-auth/react'
import { Navbar } from '@/components/navbar'
import { Alert } from '@/components/ui/alert'
import { errorText } from '@/lib/client'
import { MAX_RESUME_BYTES, MAX_ROLES, MAX_SKILLS, MIN_SKILLS, ROLES, SKILLS } from '@/lib/constants'
import type { Profile } from '@/types'

type Exp = { title: string; company: string; duration: string; description: string }
type Edu = { degree: string; school: string; year: string }
type Parsed = {
  headline?: string | null
  location?: string | null
  summary?: string | null
  experience?: Partial<Exp>[]
  education?: Partial<Edu>[]
}

const inputCls =
  'w-full rounded border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 placeholder-zinc-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600'
const labelCls = 'mb-1.5 block text-sm font-medium text-zinc-700'
const sectionCls = 'border-t border-zinc-200 pt-8'
const headingCls = 'font-serif text-xl font-bold text-zinc-900'
const ghostBtn =
  'rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:border-red-600 hover:text-red-600'

/** Crop to a square and shrink to 256px so the stored data URL stays small (~20 KB). */
function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const size = 256
      const side = Math.min(img.width, img.height)
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('canvas'))
        return
      }
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image'))
    }
    img.src = url
  })
}

const emptyExp = (): Exp => ({ title: '', company: '', duration: '', description: '' })
const emptyEdu = (): Edu => ({ degree: '', school: '', year: '' })

export function ProfileForm({ mode }: { mode: 'onboarding' | 'edit' }) {
  const router = useRouter()
  const { data: session, status, update } = useSession()

  const [name, setName] = useState('')
  const [photo, setPhoto] = useState('')
  const [designation, setDesignation] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [location, setLocation] = useState('')
  const [headline, setHeadline] = useState('')
  const [bio, setBio] = useState('')
  const [linkedIn, setLinkedIn] = useState('')
  const [github, setGithub] = useState('')
  const [portfolio, setPortfolio] = useState('')
  const [roles, setRoles] = useState<string[]>([])
  const [skills, setSkills] = useState<string[]>([])
  const [skillSearch, setSkillSearch] = useState('')
  const [customSkill, setCustomSkill] = useState('')
  const [experience, setExperience] = useState<Exp[]>([])
  const [education, setEducation] = useState<Edu[]>([])

  const [resumeName, setResumeName] = useState('')
  const [detected, setDetected] = useState<string[]>([])
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [uploading, setUploading] = useState(false)
  const [resumeMsg, setResumeMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  const [isEdit, setIsEdit] = useState(false)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [photoError, setPhotoError] = useState('')

  const fileInput = useRef<HTMLInputElement>(null)
  const resumeInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (status !== 'authenticated') return
    let cancelled = false

    axios
      .get('/api/profile')
      .then(({ data }) => {
        if (cancelled) return
        const p: Profile = data.profile
        setPhoto(p.photo ?? '')
        setDesignation(p.currentDesignation ?? '')
        setContactEmail(p.contactEmail ?? p.user?.email ?? '')
        setPhone(p.phone ?? '')
        setLocation(p.location ?? '')
        setHeadline(p.headline ?? '')
        setBio(p.bio ?? '')
        setLinkedIn(p.linkedIn ?? '')
        setGithub(p.github ?? '')
        setPortfolio(p.portfolio ?? '')
        setRoles(p.preferredRoles ?? [])
        setSkills(p.skills ?? [])
        setExperience(((p.experience ?? []) as Partial<Exp>[]).map((x) => ({ ...emptyExp(), ...x })))
        setEducation(((p.education ?? []) as Partial<Edu>[]).map((x) => ({ ...emptyEdu(), ...x })))
        setResumeName(p.resumeFileName ?? '')
        setIsEdit(p.onboardingCompleted)
        setName(p.user?.name ?? session?.user.name ?? '')
      })
      .catch(() => {
        if (!cancelled) setName(session?.user.name ?? '')
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const librarySkills = useMemo(() => {
    const q = skillSearch.trim().toLowerCase()
    return q ? SKILLS.filter((s) => s.toLowerCase().includes(q)) : SKILLS
  }, [skillSearch])

  const hasSkill = (s: string) => skills.some((x) => x.toLowerCase() === s.toLowerCase())

  const toggleSkill = (skill: string) =>
    setSkills((prev) => {
      if (prev.some((s) => s.toLowerCase() === skill.toLowerCase()))
        return prev.filter((s) => s.toLowerCase() !== skill.toLowerCase())
      return prev.length >= MAX_SKILLS ? prev : [...prev, skill]
    })

  const addCustomSkill = () => {
    const value = customSkill.trim().slice(0, 40)
    if (!value) return
    if (skills.length >= MAX_SKILLS) {
      setError(`You can add at most ${MAX_SKILLS} skills`)
      return
    }
    // use the library's spelling when the person typed a known skill
    const canonical = SKILLS.find((s) => s.toLowerCase() === value.toLowerCase()) ?? value
    if (!hasSkill(canonical)) setSkills((prev) => [...prev, canonical])
    setCustomSkill('')
    setError('')
  }

  const toggleRole = (role: string) =>
    setRoles((prev) => {
      if (prev.includes(role)) return prev.filter((r) => r !== role)
      return prev.length >= MAX_ROLES ? prev : [...prev, role]
    })

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotoError('')
    if (!file.type.startsWith('image/')) {
      setPhotoError('Choose an image file (JPG, PNG or WebP)')
      return
    }
    try {
      setPhoto(await resizeImage(file))
    } catch {
      setPhotoError('Could not read that image. Try another one.')
    }
  }

  const onResume = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setResumeMsg(null)
    if (file.size > MAX_RESUME_BYTES) {
      setResumeMsg({ type: 'error', text: 'Resume must be 5 MB or smaller' })
      return
    }

    setUploading(true)
    try {
      const body = new FormData()
      body.append('resume', file)
      const { data } = await axios.post('/api/profile/resume', body)

      setResumeName(data.fileName)
      setDetected(data.detectedSkills ?? [])
      setParsed(data.parsed ?? null)
      // only fill blanks - never overwrite what the person typed
      if (data.detectedEmail) setContactEmail((v) => v || data.detectedEmail)
      if (data.detectedPhone) setPhone((v) => v || data.detectedPhone)
      setResumeMsg({
        type: 'success',
        text:
          data.detectedSkills?.length > 0
            ? `Resume saved. We found ${data.detectedSkills.length} skills in it.`
            : 'Resume saved. We could not match any skills from our list - add them below.',
      })
    } catch (err) {
      setResumeMsg({ type: 'error', text: errorText(err, 'Could not upload your resume') })
    } finally {
      setUploading(false)
    }
  }

  const addDetected = () =>
    setSkills((prev) => {
      const merged = [...prev]
      for (const s of detected) {
        if (!merged.some((m) => m.toLowerCase() === s.toLowerCase()) && merged.length < MAX_SKILLS) merged.push(s)
      }
      return merged
    })

  const applyParsed = () => {
    if (!parsed) return
    if (parsed.experience?.length) setExperience(parsed.experience.map((x) => ({ ...emptyExp(), ...x })))
    if (parsed.education?.length) setEducation(parsed.education.map((x) => ({ ...emptyEdu(), ...x })))
    if (parsed.headline) setHeadline((v) => v || parsed.headline!)
    if (parsed.location) setLocation((v) => v || parsed.location!)
    if (parsed.summary) setBio((v) => v || parsed.summary!.slice(0, 500))
    setParsed(null)
    setResumeMsg({ type: 'success', text: 'Filled experience and education from your resume. Review them below.' })
  }

  const removeResume = async () => {
    try {
      await axios.delete('/api/profile/resume')
      setResumeName('')
      setDetected([])
      setParsed(null)
      setResumeMsg(null)
    } catch (err) {
      setResumeMsg({ type: 'error', text: errorText(err, 'Could not remove the resume') })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (name.trim().length < 2) return setError('Enter your full name')
    if (!photo) return setError('Upload a profile photo')
    if (!designation.trim()) return setError('Enter your current designation')
    if (!contactEmail.trim()) return setError('Enter a contact email')
    if (!phone.trim()) return setError('Enter your phone number')
    if (roles.length < 1) return setError('Pick at least one role you are looking for')
    if (skills.length < MIN_SKILLS) return setError(`Add at least ${MIN_SKILLS} skills`)

    setSaving(true)
    try {
      await axios.put('/api/profile', {
        name: name.trim(),
        photo,
        currentDesignation: designation.trim(),
        contactEmail: contactEmail.trim(),
        phone: phone.trim(),
        location: location.trim(),
        headline: headline.trim(),
        bio: bio.trim(),
        linkedIn: linkedIn.trim(),
        github: github.trim(),
        portfolio: portfolio.trim(),
        preferredRoles: roles,
        skills,
        experience: experience.filter((x) => x.title.trim()),
        education: education.filter((x) => x.degree.trim()),
      })
      await update({ name: name.trim() })

      if (mode === 'onboarding') {
        router.push('/dashboard')
      } else {
        setSuccess('Profile saved. Your job recommendations will use the new details.')
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
      router.refresh()
    } catch (err) {
      setError(errorText(err, 'Could not save your profile'))
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading' || !ready) {
    return <div className="min-h-screen bg-white p-8 text-zinc-500">Loading…</div>
  }

  const chip = (active: boolean, disabled = false) =>
    `rounded border px-3 py-1.5 text-sm transition ${
      active
        ? 'border-red-600 bg-red-50 text-red-700'
        : disabled
          ? 'cursor-not-allowed border-zinc-200 text-zinc-300'
          : 'border-zinc-300 text-zinc-600 hover:border-zinc-400'
    }`

  return (
    <div className="min-h-screen bg-zinc-50">
      {mode === 'edit' ? (
        <Navbar />
      ) : (
        <header className="border-b border-zinc-200 bg-white">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
            <Link href="/" className="font-serif text-2xl font-bold tracking-tight text-zinc-900">
              Careera<span className="text-red-600">.</span>
            </Link>
            {isEdit && (
              <Link href="/dashboard" className="text-sm text-zinc-600 hover:text-red-600">
                Back to dashboard
              </Link>
            )}
          </div>
        </header>
      )}

      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="font-serif text-3xl font-bold text-zinc-900">
          {mode === 'edit' ? 'Edit your profile' : 'Complete your profile'}
        </h1>
        <p className="mb-8 mt-2 text-zinc-600">
          {mode === 'edit'
            ? 'Keep this up to date - recruiters see it and your job matches are based on it.'
            : 'Tell us about yourself. We use your skills, preferred roles and resume to recommend jobs that fit.'}
        </p>

        {error && <Alert variant="error" className="mb-6">{error}</Alert>}
        {success && <Alert variant="success" className="mb-6">{success}</Alert>}

        <form onSubmit={handleSubmit} className="space-y-10 rounded border border-zinc-200 bg-white p-6 md:p-8">
          {/* About */}
          <section>
            <h2 className={headingCls}>About you</h2>
            <div className="mt-5 flex flex-col gap-6 sm:flex-row">
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border border-zinc-300 bg-zinc-100">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt="Your profile photo" className="h-full w-full object-cover" />
                  ) : (
                    <span className="px-3 text-center text-xs text-zinc-400">No photo yet</span>
                  )}
                </div>
                <input ref={fileInput} type="file" accept="image/*" onChange={onPhoto}
                  className="hidden" data-testid="photo-input" />
                <button type="button" onClick={() => fileInput.current?.click()} className={ghostBtn}>
                  {photo ? 'Change photo' : 'Upload photo'}
                </button>
                {photoError && <p className="max-w-[10rem] text-center text-xs text-red-600">{photoError}</p>}
              </div>

              <div className="grid flex-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="name" className={labelCls}>Full name</label>
                  <input id="name" value={name} onChange={(e) => setName(e.target.value)}
                    autoComplete="name" className={inputCls} required />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="designation" className={labelCls}>Current designation</label>
                  <input id="designation" value={designation} onChange={(e) => setDesignation(e.target.value)}
                    placeholder="e.g. Software Engineer at Acme" className={inputCls} required />
                </div>
                <div>
                  <label htmlFor="contactEmail" className={labelCls}>Contact email</label>
                  <input id="contactEmail" type="email" value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)} autoComplete="email"
                    className={inputCls} required />
                </div>
                <div>
                  <label htmlFor="phone" className={labelCls}>Phone number</label>
                  <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel" placeholder="+94 77 123 4567" className={inputCls} required />
                </div>
                <div>
                  <label htmlFor="location" className={labelCls}>Location</label>
                  <input id="location" value={location} onChange={(e) => setLocation(e.target.value)}
                    placeholder="Colombo, Sri Lanka" className={inputCls} />
                </div>
                <div>
                  <label htmlFor="headline" className={labelCls}>Headline</label>
                  <input id="headline" value={headline} onChange={(e) => setHeadline(e.target.value)}
                    placeholder="Full stack developer who loves clean APIs" className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="bio" className={labelCls}>
                    Short bio <span className="font-normal text-zinc-400">({bio.length}/500)</span>
                  </label>
                  <textarea id="bio" value={bio} maxLength={500} rows={3}
                    onChange={(e) => setBio(e.target.value)} className={inputCls} />
                </div>
              </div>
            </div>
          </section>

          {/* Resume */}
          <section className={sectionCls}>
            <h2 className={headingCls}>Your resume</h2>
            <p className="mt-1 text-sm text-zinc-500">
              PDF, DOCX or TXT, up to 5 MB. Recruiters can open it from your application, the AI reads
              it to find better matches, and we use it to suggest skills.
            </p>

            <input ref={resumeInput} type="file" accept=".pdf,.docx,.txt" onChange={onResume}
              className="hidden" data-testid="resume-input" />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => resumeInput.current?.click()} disabled={uploading}
                className={`${ghostBtn} disabled:opacity-50`}>
                {uploading ? 'Reading resume…' : resumeName ? 'Replace resume' : 'Upload resume'}
              </button>
              {resumeName && (
                <>
                  <a href="/api/profile/resume" target="_blank" rel="noreferrer"
                    className="text-sm text-red-600 underline">
                    {resumeName}
                  </a>
                  <button type="button" onClick={removeResume}
                    className="text-sm text-zinc-500 underline hover:text-red-600">
                    Remove
                  </button>
                </>
              )}
            </div>

            {resumeMsg && <Alert variant={resumeMsg.type} className="mt-4">{resumeMsg.text}</Alert>}

            {(detected.length > 0 || parsed) && (
              <div className="mt-4 space-y-3 rounded border border-zinc-200 bg-zinc-50 p-4">
                {detected.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-zinc-700">Skills found in your resume</p>
                    <p className="mt-2 text-sm text-zinc-600">{detected.join(', ')}</p>
                    <button type="button" onClick={addDetected}
                      className="mt-3 rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700">
                      Add these to my skills
                    </button>
                  </div>
                )}
                {parsed && (parsed.experience?.length || parsed.education?.length) ? (
                  <div>
                    <p className="text-sm font-medium text-zinc-700">
                      The AI read {parsed.experience?.length ?? 0} jobs and {parsed.education?.length ?? 0} education
                      entries from your resume
                    </p>
                    <button type="button" onClick={applyParsed}
                      className="mt-3 rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700">
                      Fill experience &amp; education from resume
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </section>

          {/* Roles */}
          <section className={sectionCls}>
            <div className="flex items-baseline justify-between">
              <h2 className={headingCls}>Roles you want</h2>
              <span className="text-sm text-zinc-500">{roles.length} / {MAX_ROLES}</span>
            </div>
            <p className="mt-1 text-sm text-zinc-500">Pick up to {MAX_ROLES}.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {ROLES.map((role) => {
                const active = roles.includes(role)
                const disabled = !active && roles.length >= MAX_ROLES
                return (
                  <button key={role} type="button" onClick={() => toggleRole(role)}
                    disabled={disabled} aria-pressed={active} className={chip(active, disabled)}>
                    {role}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Skills */}
          <section className={sectionCls}>
            <div className="flex items-baseline justify-between">
              <h2 className={headingCls}>Your skills</h2>
              <span className="text-sm text-zinc-500">
                {skills.length} added (min {MIN_SKILLS}, max {MAX_SKILLS})
              </span>
            </div>

            {skills.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {skills.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 rounded border border-red-600 bg-red-50 px-3 py-1.5 text-sm text-red-700">
                    {s}
                    <button type="button" onClick={() => toggleSkill(s)} aria-label={`Remove ${s}`}
                      className="text-red-400 hover:text-red-700">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <input
                value={customSkill}
                onChange={(e) => setCustomSkill(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCustomSkill()
                  }
                }}
                placeholder="Type any skill and press Enter (e.g. Terraform, Figma, Public speaking)"
                className={inputCls}
                maxLength={40}
              />
              <button type="button" onClick={addCustomSkill} className="rounded bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700">
                Add
              </button>
            </div>

            <p className="mb-2 mt-5 text-sm font-medium text-zinc-700">Or pick from suggestions</p>
            <input value={skillSearch} onChange={(e) => setSkillSearch(e.target.value)}
              placeholder={`Search ${SKILLS.length} skills`} className={inputCls} />
            <div className="mt-3 flex max-h-64 flex-wrap gap-2 overflow-y-auto rounded border border-zinc-200 p-3">
              {librarySkills.length === 0 && (
                <p className="text-sm text-zinc-500">No suggestion matches “{skillSearch}”. Add it above instead.</p>
              )}
              {librarySkills.map((skill) => {
                const active = hasSkill(skill)
                const disabled = !active && skills.length >= MAX_SKILLS
                return (
                  <button key={skill} type="button" onClick={() => toggleSkill(skill)}
                    disabled={disabled} aria-pressed={active} className={chip(active, disabled)}>
                    {skill}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Experience */}
          <section className={sectionCls}>
            <div className="flex items-baseline justify-between">
              <h2 className={headingCls}>Experience</h2>
              <button type="button" onClick={() => setExperience((p) => [...p, emptyExp()])} className={ghostBtn}>
                + Add job
              </button>
            </div>
            {experience.length === 0 && <p className="mt-3 text-sm text-zinc-500">No experience added yet.</p>}
            <div className="mt-4 space-y-4">
              {experience.map((x, i) => {
                const set = (patch: Partial<Exp>) =>
                  setExperience((p) => p.map((e, j) => (j === i ? { ...e, ...patch } : e)))
                return (
                  <div key={i} className="space-y-3 rounded border border-zinc-200 p-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <input aria-label="Job title" placeholder="Job title" value={x.title}
                        onChange={(e) => set({ title: e.target.value })} className={inputCls} />
                      <input aria-label="Company" placeholder="Company" value={x.company}
                        onChange={(e) => set({ company: e.target.value })} className={inputCls} />
                      <input aria-label="Duration" placeholder="2021 - Present" value={x.duration}
                        onChange={(e) => set({ duration: e.target.value })} className={inputCls} />
                    </div>
                    <textarea aria-label="Description" placeholder="What did you do there?" rows={3}
                      value={x.description} maxLength={1000}
                      onChange={(e) => set({ description: e.target.value })} className={inputCls} />
                    <button type="button" onClick={() => setExperience((p) => p.filter((_, j) => j !== i))}
                      className="text-sm text-zinc-500 underline hover:text-red-600">
                      Remove
                    </button>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Education */}
          <section className={sectionCls}>
            <div className="flex items-baseline justify-between">
              <h2 className={headingCls}>Education</h2>
              <button type="button" onClick={() => setEducation((p) => [...p, emptyEdu()])} className={ghostBtn}>
                + Add education
              </button>
            </div>
            {education.length === 0 && <p className="mt-3 text-sm text-zinc-500">No education added yet.</p>}
            <div className="mt-4 space-y-4">
              {education.map((x, i) => {
                const set = (patch: Partial<Edu>) =>
                  setEducation((p) => p.map((e, j) => (j === i ? { ...e, ...patch } : e)))
                return (
                  <div key={i} className="space-y-3 rounded border border-zinc-200 p-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <input aria-label="Degree" placeholder="Degree" value={x.degree}
                        onChange={(e) => set({ degree: e.target.value })} className={inputCls} />
                      <input aria-label="School" placeholder="School / University" value={x.school}
                        onChange={(e) => set({ school: e.target.value })} className={inputCls} />
                      <input aria-label="Year" placeholder="Year" value={x.year}
                        onChange={(e) => set({ year: e.target.value })} className={inputCls} />
                    </div>
                    <button type="button" onClick={() => setEducation((p) => p.filter((_, j) => j !== i))}
                      className="text-sm text-zinc-500 underline hover:text-red-600">
                      Remove
                    </button>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Links */}
          <section className={sectionCls}>
            <h2 className={headingCls}>Links</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="linkedIn" className={labelCls}>LinkedIn</label>
                <input id="linkedIn" type="url" value={linkedIn} onChange={(e) => setLinkedIn(e.target.value)}
                  placeholder="https://linkedin.com/in/..." className={inputCls} />
              </div>
              <div>
                <label htmlFor="github" className={labelCls}>GitHub</label>
                <input id="github" type="url" value={github} onChange={(e) => setGithub(e.target.value)}
                  placeholder="https://github.com/..." className={inputCls} />
              </div>
              <div>
                <label htmlFor="portfolio" className={labelCls}>Portfolio</label>
                <input id="portfolio" type="url" value={portfolio} onChange={(e) => setPortfolio(e.target.value)}
                  placeholder="https://..." className={inputCls} />
              </div>
            </div>
          </section>

          <button type="submit" disabled={saving || uploading}
            className="w-full rounded bg-red-600 py-3 font-medium text-white hover:bg-red-700 disabled:opacity-50">
            {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Save and find my jobs'}
          </button>
        </form>
      </main>
    </div>
  )
}