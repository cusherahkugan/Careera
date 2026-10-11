'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { useSession } from 'next-auth/react'
import { Alert } from '@/components/ui/alert'
import { MAX_RESUME_BYTES, MAX_ROLES, MAX_SKILLS, MIN_SKILLS, ROLES, SKILLS } from '@/lib/constants'
import type { Profile } from '@/types'

const inputCls =
  'w-full rounded border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 placeholder-zinc-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600'
const labelCls = 'mb-1.5 block text-sm font-medium text-zinc-700'

const errorText = (err: unknown, fallback: string) =>
  axios.isAxiosError(err) ? err.response?.data?.error || fallback : fallback

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

export default function OnboardingPage() {
  const router = useRouter()
  const { data: session, status, update } = useSession()

  const [name, setName] = useState('')
  const [photo, setPhoto] = useState('')
  const [designation, setDesignation] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [roles, setRoles] = useState<string[]>([])
  const [skills, setSkills] = useState<string[]>([])
  const [skillSearch, setSkillSearch] = useState('')

  const [resumeName, setResumeName] = useState('')
  const [detected, setDetected] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [resumeMsg, setResumeMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  const [isEdit, setIsEdit] = useState(false)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [photoError, setPhotoError] = useState('')

  const fileInput = useRef<HTMLInputElement>(null)
  const resumeInput = useRef<HTMLInputElement>(null)

  // load whatever the profile already has (also makes this page work as "edit profile")
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
        setContactEmail(p.contactEmail ?? '')
        setPhone(p.phone ?? '')
        setRoles(p.preferredRoles ?? [])
        setSkills(p.skills ?? [])
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

  const filteredSkills = useMemo(() => {
    const q = skillSearch.trim().toLowerCase()
    return q ? SKILLS.filter((s) => s.toLowerCase().includes(q)) : SKILLS
  }, [skillSearch])

  const toggleSkill = (skill: string) =>
    setSkills((prev) => {
      if (prev.includes(skill)) return prev.filter((s) => s !== skill)
      return prev.length >= MAX_SKILLS ? prev : [...prev, skill]
    })

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
      // only fill blanks - never overwrite what the person typed
      if (data.detectedEmail) setContactEmail((v) => v || data.detectedEmail)
      if (data.detectedPhone) setPhone((v) => v || data.detectedPhone)
      setResumeMsg({
        type: 'success',
        text:
          data.detectedSkills?.length > 0
            ? `Resume read. We found ${data.detectedSkills.length} skills in it.`
            : 'Resume read. We could not match any skills from our list - pick them below.',
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
        if (!merged.includes(s) && merged.length < MAX_SKILLS) merged.push(s)
      }
      return merged
    })

  const removeResume = async () => {
    try {
      await axios.delete('/api/profile/resume')
      setResumeName('')
      setDetected([])
      setResumeMsg(null)
    } catch (err) {
      setResumeMsg({ type: 'error', text: errorText(err, 'Could not remove the resume') })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (name.trim().length < 2) return setError('Enter your full name')
    if (!photo) return setError('Upload a profile photo')
    if (!designation.trim()) return setError('Enter your current designation')
    if (!contactEmail.trim()) return setError('Enter a contact email')
    if (!phone.trim()) return setError('Enter your phone number')
    if (roles.length < 1) return setError('Pick at least one role you are looking for')
    if (skills.length < MIN_SKILLS) return setError(`Pick at least ${MIN_SKILLS} skills`)

    setSaving(true)
    try {
      await axios.put('/api/profile', {
        name: name.trim(),
        photo,
        currentDesignation: designation.trim(),
        contactEmail: contactEmail.trim(),
        phone: phone.trim(),
        preferredRoles: roles,
        skills,
      })
      // refresh the name stored in the session cookie
      await update({ name: name.trim() })
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setError(errorText(err, 'Could not save your profile'))
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

  const sectionCls = 'border-t border-zinc-200 pt-8'
  const headingCls = 'font-serif text-xl font-bold text-zinc-900'

  return (
    <div className="min-h-screen bg-zinc-50">
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

      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="font-serif text-3xl font-bold text-zinc-900">
          {isEdit ? 'Edit your profile' : 'Complete your profile'}
        </h1>
        <p className="mb-8 mt-2 text-zinc-600">
          {isEdit
            ? 'Keep this up to date - your job matches are based on it.'
            : 'Tell us about yourself. We use your skills, preferred roles and resume to recommend jobs that fit.'}
        </p>

        {error && <Alert variant="error" className="mb-6">{error}</Alert>}

        <form onSubmit={handleSubmit} className="space-y-10 rounded border border-zinc-200 bg-white p-6 md:p-8">
          {/* Photo + basics */}
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
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  onChange={onPhoto}
                  className="hidden"
                  data-testid="photo-input"
                />
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:border-red-600 hover:text-red-600"
                >
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
                  <input id="designation" value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="e.g. Software Engineer at Acme" className={inputCls} required />
                </div>
                <div>
                  <label htmlFor="contactEmail" className={labelCls}>Contact email</label>
                  <input id="contactEmail" type="email" value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    autoComplete="email" className={inputCls} required />
                </div>
                <div>
                  <label htmlFor="phone" className={labelCls}>Phone number</label>
                  <input id="phone" type="tel" value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel" placeholder="+94 77 123 4567" className={inputCls} required />
                </div>
              </div>
            </div>
          </section>

          {/* Resume */}
          <section className={sectionCls}>
            <h2 className={headingCls}>Your resume</h2>
            <p className="mt-1 text-sm text-zinc-500">
              PDF, DOCX or TXT, up to 5 MB. The AI reads it to find better matches, and we use it to
              suggest skills.
            </p>

            <input ref={resumeInput} type="file" accept=".pdf,.docx,.txt"
              onChange={onResume} className="hidden" data-testid="resume-input" />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => resumeInput.current?.click()}
                disabled={uploading}
                className="rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:border-red-600 hover:text-red-600 disabled:opacity-50"
              >
                {uploading ? 'Reading resume…' : resumeName ? 'Replace resume' : 'Upload resume'}
              </button>
              {resumeName && (
                <>
                  <span className="text-sm text-zinc-600">{resumeName}</span>
                  <button type="button" onClick={removeResume}
                    className="text-sm text-zinc-500 underline hover:text-red-600">
                    Remove
                  </button>
                </>
              )}
            </div>

            {resumeMsg && <Alert variant={resumeMsg.type} className="mt-4">{resumeMsg.text}</Alert>}

            {detected.length > 0 && (
              <div className="mt-4 rounded border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-sm font-medium text-zinc-700">Skills found in your resume</p>
                <p className="mt-2 text-sm text-zinc-600">{detected.join(', ')}</p>
                <button type="button" onClick={addDetected}
                  className="mt-3 rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700">
                  Add these to my skills
                </button>
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
                {skills.length} selected (min {MIN_SKILLS}, max {MAX_SKILLS})
              </span>
            </div>
            <input
              value={skillSearch}
              onChange={(e) => setSkillSearch(e.target.value)}
              placeholder={`Search ${SKILLS.length} skills`}
              className={`${inputCls} mt-4`}
            />
            <div className="mt-4 flex max-h-72 flex-wrap gap-2 overflow-y-auto rounded border border-zinc-200 p-3">
              {filteredSkills.length === 0 && (
                <p className="text-sm text-zinc-500">No skills match “{skillSearch}”.</p>
              )}
              {filteredSkills.map((skill) => {
                const active = skills.includes(skill)
                const disabled = !active && skills.length >= MAX_SKILLS
                return (
                  <button key={skill} type="button" onClick={() => toggleSkill(skill)}
                    disabled={disabled} aria-pressed={active} className={chip(active, disabled)}>
                    {skill}
                  </button>
                )
              })}
            </div>
            {skills.length > 0 && (
              <p className="mt-3 text-sm text-zinc-600">
                <span className="font-medium">Selected:</span> {skills.join(', ')}
              </p>
            )}
          </section>

          <button
            type="submit"
            disabled={saving || uploading}
            className="w-full rounded bg-red-600 py-3 font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save and find my jobs'}
          </button>
        </form>
      </main>
    </div>
  )
}