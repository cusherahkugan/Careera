import { z } from 'zod'
import {
  MAX_PHOTO_CHARS,
  MAX_ROLES,
  MAX_SKILLS,
  ROLES,
  SKILL_SET,
} from '@/lib/constants'

// Emails are trimmed + lowercased everywhere so "Jane@X.com" and "jane@x.com"
// are the same account at registration and at login.
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

export const profileSchema = z.object({
  // account name (stored on the User row)
  name: z.string().trim().min(2, 'Name must be at least 2 characters').optional(),

  // onboarding fields
  photo: optionalPhoto,
  phone: optionalPhone,
  contactEmail: optionalEmail,
  currentDesignation: z.string().trim().max(100).optional(),
  preferredRoles: z
    .array(z.string())
    .max(MAX_ROLES, `Pick at most ${MAX_ROLES} roles`)
    .refine((roles) => roles.every((r) => ROLES.includes(r)), 'Unknown role selected')
    .optional(),
  skills: z
    .array(z.string())
    .max(MAX_SKILLS, `Pick at most ${MAX_SKILLS} skills`)
    .refine((skills) => skills.every((s) => SKILL_SET.has(s)), 'Unknown skill selected')
    .optional(),

  // other profile fields
  location: z.string().optional(),
  headline: z.string().optional(),
  bio: z.string().max(500, 'Bio must be less than 500 characters').optional(),
  resumeUrl: optionalUrl,
  experience: z.array(z.any()).optional(),
  education: z.array(z.any()).optional(),
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

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type ProfileInput = z.infer<typeof profileSchema>
export type JobInput = z.infer<typeof jobSchema>
export type ApplicationInput = z.infer<typeof applicationSchema>