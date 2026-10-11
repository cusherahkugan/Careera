export type UserRole = 'JOB_SEEKER' | 'RECRUITER' | 'ADMIN'

export type JobType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP' | 'REMOTE'

export type ApplicationStatus =
  | 'PENDING'
  | 'REVIEWED'
  | 'INTERVIEW'
  | 'ACCEPTED'
  | 'REJECTED'

export interface User {
  id: string
  name: string
  email: string
  image: string | null
  role: UserRole
  createdAt: string
  updatedAt: string
}

export interface Profile {
  id: string
  userId: string
  photo: string | null
  phone: string | null
  contactEmail: string | null
  location: string | null
  headline: string | null
  currentDesignation: string | null
  bio: string | null
  preferredRoles: string[]
  skills: string[]
  resumeUrl: string | null
  resumeFileName: string | null
  /** true when a resume has been uploaded (the text itself is never sent to the browser) */
  hasResume: boolean
  experience: unknown[]
  education: unknown[]
  linkedIn: string | null
  github: string | null
  portfolio: string | null
  onboardingCompleted: boolean
  createdAt: string
  updatedAt: string
  user?: { name: string; email: string; image: string | null }
}

export interface Job {
  id: string
  companyId: string
  recruiterId: string
  title: string
  description: string
  requirements: string[]
  responsibilities: string[]
  type: JobType
  location: string
  salary: string | null
  skills: string[]
  isActive: boolean
  views: number
  createdAt: string
  updatedAt: string
  company?: {
    name: string
    logo: string | null
    location: string | null
  }
  _count?: {
    applications: number
  }
}

export interface Application {
  id: string
  jobId: string
  applicantId: string
  status: ApplicationStatus
  coverLetter: string | null
  resumeUrl: string | null
  aiScore: number | null
  aiNotes: string | null
  createdAt: string
  updatedAt: string
  job?: Job
  /** Only present when a recruiter fetches applications */
  applicant?: {
    id: string
    name: string
    email: string
    profile?: {
      headline: string | null
      skills: string[]
      location: string | null
    } | null
  }
}

export interface JobFilters {
  search?: string
  type?: JobType
  location?: string
  skills?: string[]
}