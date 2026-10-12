import { z } from 'zod'
import { MAX_PHOTO_CHARS, MAX_ROLES, MAX_SKILLS, ROLES } from '@/lib/constants'

const email = z.string().trim().toLowerCase().email('Invalid email address')

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters'),
    email,
    password: z.string().min(6, 'Password must be at least 6 characters'),
    role: z.enum(['JOB_SEEKER', 'RECRUITER']),
    companyName: z.string().trim().min(2).optional(),
  })
  .refine((d) => d.role !== 'RECRUITER' || !!d.companyName, {
    message: 'Company name is required for recruiters',
    path: ['companyName'],
  })

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
})

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
})

const optionalUrl = z.string().url('Invalid URL').optional().or(z.literal(''))

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email('Contact email is not valid')
  .optional()
  .or(z.literal(''))

const optionalPhone = z
  .string()
  .trim()
  .regex(/^[+()\d\s-]{7,20}$/, 'Phone number is not valid')
  .optional()
  .or(z.literal(''))

const optionalPhoto = z
  .string()
  .refine(
    (v) => /^data:image\/(jpeg|png|webp);base64,/.test(v) && v.length <= MAX_PHOTO_CHARS,
    'Photo must be a JPEG, PNG or WebP image under 200 KB'
  )
  .optional()
  .or(z.literal(''))

export const experienceItemSchema = z.object({
  title: z.string().trim().min(1, 'Each experience needs a job title').max(100),
  company: z.string().trim().max(100).default(''),
  duration: z.string().trim().max(60).default(''),
  description: z.string().trim().max(1000).default(''),
})

export const educationItemSchema = z.object({
  degree: z.string().trim().min(1, 'Each education entry needs a degree').max(100),
  school: z.string().trim().max(100).default(''),
  year: z.string().trim().max(20).default(''),
})

export const profileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').optional(),

  photo: optionalPhoto,
  phone: optionalPhone,
  contactEmail: optionalEmail,
  currentDesignation: z.string().trim().max(100).optional(),
  preferredRoles: z
    .array(z.string())
    .max(MAX_ROLES, `Pick at most ${MAX_ROLES} roles`)
    .refine((roles) => roles.every((r) => ROLES.includes(r)), 'Unknown role selected')
    .optional(),
  // custom skills are allowed now, the list on the form is only a set of suggestions
  skills: z
    .array(z.string().trim().min(1).max(40, 'A skill name can be at most 40 characters'))
    .max(MAX_SKILLS, `Pick at most ${MAX_SKILLS} skills`)
    .optional(),

  location: z.string().trim().max(100).optional(),
  headline: z.string().trim().max(150).optional(),
  bio: z.string().max(500, 'Bio must be less than 500 characters').optional(),
  resumeUrl: optionalUrl,
  experience: z.array(experienceItemSchema).max(20).optional(),
  education: z.array(educationItemSchema).max(10).optional(),
  linkedIn: optionalUrl,
  github: optionalUrl,
  portfolio: optionalUrl,
})

export const jobSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().min(50, 'Description must be at least 50 characters'),
  requirements: z.array(z.string()),
  responsibilities: z.array(z.string()),
  type: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'REMOTE']),
  location: z.string().min(2, 'Location is required'),
  salary: z.string().optional(),
  skills: z.array(z.string()),
})

export const jobUpdateSchema = jobSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })

export const applicationSchema = z.object({
  jobId: z.string().min(1),
  coverLetter: z.string().max(2000, 'Cover letter is too long').optional(),
  resumeUrl: z.string().url('Valid resume URL is required').optional(),
})

export const statusUpdateSchema = z.object({
  status: z.enum(['PENDING', 'REVIEWED', 'INTERVIEW', 'ACCEPTED', 'REJECTED', 'WITHDRAWN']),
  note: z.string().trim().max(1000).optional(),
})

export const messageSchema = z.object({
  content: z.string().trim().min(1, 'Write a message first').max(2000, 'Message is too long'),
})

const interviewMode = z.enum(['VIDEO', 'PHONE', 'ONSITE'])

export const interviewCreateSchema = z.object({
  applicationId: z.string().min(1),
  scheduledAt: z.coerce.date(),
  durationMins: z.number().int().min(10).max(480).default(30),
  mode: interviewMode.default('VIDEO'),
  location: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(1000).optional(),
})

export const interviewUpdateSchema = z.object({
  action: z.enum(['reschedule', 'cancel', 'complete', 'confirm', 'decline']),
  scheduledAt: z.coerce.date().optional(),
  durationMins: z.number().int().min(10).max(480).optional(),
  mode: interviewMode.optional(),
  location: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(1000).optional(),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type ProfileInput = z.infer<typeof profileSchema>
export type JobInput = z.infer<typeof jobSchema>
export type ApplicationInput = z.infer<typeof applicationSchema>