import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting database seed...')

   await prisma.notification.deleteMany()
  await prisma.interview.deleteMany()
  await prisma.applicationEvent.deleteMany()
  await prisma.message.deleteMany()
  await prisma.application.deleteMany()
  await prisma.job.deleteMany()
  await prisma.company.deleteMany()
  await prisma.resumeFile.deleteMany()
  await prisma.profile.deleteMany()
  await prisma.user.deleteMany()

  console.log('✨ Cleared existing data')

 const jobSeeker = await prisma.user.create({
  data: {
    email: 'seeker@example.com',
    password: await bcrypt.hash('password123', 10),
    name: 'Alex Johnson',
    role: 'JOB_SEEKER',
    profile: {
      create: {
        phone: '+1234567890',
        onboardingCompleted: true,
        contactEmail: 'seeker@example.com',
        currentDesignation: 'Senior Software Engineer at Tech Corp',
        preferredRoles: ['Full Stack Developer', 'Software Engineer'],
        location: 'San Francisco, CA',
        headline: 'Full Stack Developer',
        bio: 'Passionate software engineer with 5 years of experience building scalable web applications.',
        resumeUrl: 'https://example.com/resume.pdf',
        skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'PostgreSQL', 'AWS', 'Docker', 'Git'],
        experience: [
          {
            title: 'Senior Software Engineer',
            company: 'Tech Corp',
            duration: '2021 - Present',
            description: 'Led development of microservices architecture...'
          }
        ],
        education: [
          {
            degree: 'BS Computer Science',
            school: 'University of California',
            year: '2019'
          }
        ],
        linkedIn: 'https://linkedin.com/in/alexjohnson',
        github: 'https://github.com/alexjohnson'
      }
    }
  },
  include: {
    profile: true
  }
})


  console.log('👤 Created job seeker:', jobSeeker.email)

  // Create Recruiter & Company
  const recruiter = await prisma.user.create({
    data: {
      email: 'recruiter@example.com',
      password: await bcrypt.hash('password123', 10),
      name: 'Sarah Williams',
      role: 'RECRUITER',
      company: {
        create: {
          name: 'InnovateTech Solutions',
          industry: 'Technology',
          size: '50-200',
          description: 'Leading software company building next-generation AI solutions. We empower businesses with cutting-edge technology and innovative products.',
          location: 'San Francisco, CA',
          website: 'https://innovatetech.example.com',
        }
      }
    },
    include: {
      company: true
    }
  })

  console.log('👤 Created recruiter:', recruiter.email)
  console.log('🏢 Created company:', recruiter.company?.name)

  // Create Jobs
  const jobs = await prisma.job.createMany({
    data: [
      {
        companyId: recruiter.company!.id,
        recruiterId: recruiter.id,
        title: 'Senior Full Stack Engineer',
        description: 'We are seeking an experienced Full Stack Engineer to join our growing team. You will work on cutting-edge projects using modern technologies and collaborate with cross-functional teams to deliver high-quality software solutions. This role offers the opportunity to make a significant impact on our product architecture and technical direction.',
        requirements: [
          '5+ years of professional software development experience',
          'Strong proficiency in JavaScript/TypeScript and React',
          'Experience with Node.js and RESTful APIs',
          'Knowledge of PostgreSQL or similar databases',
          'Familiarity with cloud platforms (AWS, GCP, or Azure)',
          'Experience with Git and CI/CD pipelines',
        ],
        responsibilities: [
          'Design and implement scalable backend services',
          'Build responsive user interfaces with React',
          'Collaborate with product and design teams',
          'Write clean, maintainable, and testable code',
          'Mentor junior developers and conduct code reviews',
          'Participate in technical discussions and architecture decisions',
        ],
        type: 'FULL_TIME',
        location: 'San Francisco, CA (Hybrid)',
        salary: '$140,000 - $180,000',
        skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'PostgreSQL', 'AWS'],
      },
      {
        companyId: recruiter.company!.id,
        recruiterId: recruiter.id,
        title: 'Frontend Developer',
        description: 'Join our frontend team to create beautiful, performant web applications. Work with the latest React technologies and modern UI frameworks to build exceptional user experiences.',
        requirements: [
          '3+ years of frontend development experience',
          'Expert knowledge of React and modern JavaScript',
          'Strong CSS and responsive design skills',
          'Experience with state management (Redux, Zustand)',
          'Understanding of web performance optimization',
        ],
        responsibilities: [
          'Build reusable component libraries',
          'Implement pixel-perfect designs',
          'Optimize application performance',
          'Write clean, maintainable code',
          'Collaborate with designers and backend engineers',
        ],
        type: 'FULL_TIME',
        location: 'Remote',
        salary: '$100,000 - $140,000',
        skills: ['React', 'JavaScript', 'CSS', 'Tailwind', 'Next.js'],
      },
      {
        companyId: recruiter.company!.id,
        recruiterId: recruiter.id,
        title: 'DevOps Engineer',
        description: 'Help us build and maintain robust infrastructure for our applications. Automate deployments, monitor systems, and ensure reliability at scale.',
        requirements: [
          '4+ years of DevOps experience',
          'Strong knowledge of AWS or GCP',
          'Experience with Docker and Kubernetes',
          'Proficiency in Infrastructure as Code (Terraform)',
          'Experience with CI/CD tools (Jenkins, GitHub Actions)',
        ],
        responsibilities: [
          'Manage cloud infrastructure and resources',
          'Build and maintain CI/CD pipelines',
          'Monitor system performance and reliability',
          'Implement security best practices',
          'Automate operational tasks',
        ],
        type: 'FULL_TIME',
        location: 'San Francisco, CA',
        salary: '$130,000 - $170,000',
        skills: ['AWS', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD'],
      },
      {
        companyId: recruiter.company!.id,
        recruiterId: recruiter.id,
        title: 'Product Designer',
        description: 'Shape the future of our products through exceptional design. Create intuitive, delightful experiences that users love.',
        requirements: [
          '3+ years of product design experience',
          'Strong portfolio demonstrating UI/UX work',
          'Proficiency in Figma or similar design tools',
          'Understanding of user-centered design principles',
          'Experience with design systems',
        ],
        responsibilities: [
          'Design user interfaces for web and mobile',
          'Create and maintain design systems',
          'Conduct user research and testing',
          'Collaborate with engineers on implementation',
          'Present designs to stakeholders',
        ],
        type: 'FULL_TIME',
        location: 'San Francisco, CA (Hybrid)',
        salary: '$110,000 - $150,000',
        skills: ['Figma', 'UI/UX', 'Design Systems', 'Prototyping'],
      },
      {
        companyId: recruiter.company!.id,
        recruiterId: recruiter.id,
        title: 'Data Scientist Intern',
        description: 'Learn and grow with our data science team. Work on real projects involving machine learning and data analysis.',
        requirements: [
          'Currently pursuing degree in Computer Science, Statistics, or related field',
          'Knowledge of Python and data analysis libraries',
          'Understanding of machine learning concepts',
          'Strong analytical and problem-solving skills',
        ],
        responsibilities: [
          'Assist in data analysis projects',
          'Build and train machine learning models',
          'Create data visualizations',
          'Collaborate with senior data scientists',
        ],
        type: 'INTERNSHIP',
        location: 'Remote',
        salary: '$25 - $35/hour',
        skills: ['Python', 'Machine Learning', 'Data Analysis', 'SQL'],
      },
    ]
  })

  console.log('💼 Created', jobs.count, 'jobs')

  // Create sample application
  const jobList = await prisma.job.findMany()
  
  if (jobList.length > 0) {
        const application = await prisma.application.create({
      data: {
        jobId: jobList[0].id,
        applicantId: jobSeeker.id,
        coverLetter: 'I am excited to apply for this position. My experience with React and Node.js aligns perfectly with your requirements.',
        resumeUrl: jobSeeker.profile?.resumeUrl,
        status: 'INTERVIEW',
        aiScore: 85.5,
        aiNotes: 'Strong technical match with 6/6 required skills. Relevant experience in similar role.',
        events: {
          create: [
            { type: 'APPLIED', title: 'Application submitted' },
            { type: 'STATUS', title: 'Status changed to "Interview stage"' },
          ],
        },
        interviews: {
          create: [
            {
              scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
              durationMins: 45,
              mode: 'VIDEO',
              location: 'https://meet.google.com/demo-link',
              notes: 'Technical discussion with the engineering lead.',
            },
          ],
        },
      },
    })

    await prisma.notification.create({
      data: {
        userId: jobSeeker.id,
        title: 'Interview scheduled: Senior Full Stack Engineer',
        body: 'InnovateTech Solutions invited you to an interview. Please confirm.',
        link: `/applications/${application.id}`,
      },
    })

    console.log('📝 Created sample application with an interview')

  console.log('✅ Database seeded successfully!')
  console.log('\n📧 Test Accounts:')
  console.log('Job Seeker: seeker@example.com / password123')
  console.log('Recruiter: recruiter@example.com / password123')
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })