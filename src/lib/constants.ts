// Shared lists + limits used by the onboarding page and the API routes.

export const MIN_SKILLS = 3
export const MAX_SKILLS = 30
export const MAX_ROLES = 5
export const MAX_PHOTO_CHARS = 300_000 // size of the base64 data URL
export const MAX_RESUME_BYTES = 5 * 1024 * 1024 // 5 MB

/** The 100 skills a job seeker can pick from. */
export const SKILLS: string[] = [
  // Languages (15)
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'C++', 'Go', 'Rust', 'PHP', 'Ruby',
  'Swift', 'Kotlin', 'SQL', 'HTML', 'CSS',
  // Frontend (10)
  'React', 'Next.js', 'Vue.js', 'Angular', 'Svelte', 'Tailwind CSS', 'Redux', 'Sass',
  'Webpack', 'jQuery',
  // Backend (10)
  'Node.js', 'Express', 'NestJS', 'Django', 'Flask', 'Spring Boot', 'ASP.NET', 'Laravel',
  'GraphQL', 'REST APIs',
  // Mobile (4)
  'React Native', 'Flutter', 'Android', 'iOS',
  // Databases (8)
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Firebase', 'Prisma', 'Elasticsearch', 'DynamoDB',
  // Cloud / DevOps (14)
  'AWS', 'Azure', 'Google Cloud', 'Docker', 'Kubernetes', 'Terraform', 'Jenkins',
  'GitHub Actions', 'CI/CD', 'Linux', 'Nginx', 'Ansible', 'Git', 'Microservices',
  // Data / AI (12)
  'Machine Learning', 'Deep Learning', 'Data Analysis', 'Pandas', 'NumPy', 'TensorFlow',
  'PyTorch', 'NLP', 'Power BI', 'Tableau', 'Apache Spark', 'Excel',
  // Quality / Security (6)
  'Unit Testing', 'Jest', 'Cypress', 'Selenium', 'Cybersecurity', 'Penetration Testing',
  // Design (7)
  'Figma', 'UI/UX Design', 'Adobe Photoshop', 'Adobe Illustrator', 'Prototyping',
  'Design Systems', 'User Research',
  // Business / soft skills (14)
  'Project Management', 'Agile', 'Scrum', 'Product Management', 'Leadership', 'Communication',
  'Problem Solving', 'Teamwork', 'Technical Writing', 'SEO', 'Digital Marketing',
  'Content Writing', 'Sales', 'Customer Support',
]

export const SKILL_SET = new Set(SKILLS)

/** Roles a job seeker can say they are looking for. */
export const ROLES: string[] = [
  'Frontend Developer',
  'Backend Developer',
  'Full Stack Developer',
  'Software Engineer',
  'Mobile Developer',
  'DevOps Engineer',
  'Cloud Engineer',
  'Site Reliability Engineer',
  'Data Scientist',
  'Data Analyst',
  'Data Engineer',
  'Machine Learning Engineer',
  'QA Engineer',
  'Security Engineer',
  'Database Administrator',
  'Systems Administrator',
  'IT Support Specialist',
  'Engineering Manager',
  'Product Manager',
  'Project Manager',
  'Business Analyst',
  'Product Designer',
  'UI/UX Designer',
  'Graphic Designer',
  'Technical Writer',
  'Content Writer',
  'Digital Marketing Specialist',
  'Sales Executive',
  'Customer Support Specialist',
  'Intern',
]

/** Alternative spellings found in resumes -> canonical skill name. */
export const SKILL_ALIASES: Record<string, string[]> = {
  'Node.js': ['nodejs', 'node js'],
  'Next.js': ['nextjs', 'next js'],
  'Vue.js': ['vue', 'vuejs'],
  Express: ['express.js', 'expressjs'],
  'Google Cloud': ['gcp', 'google cloud platform'],
  PostgreSQL: ['postgres'],
  Kubernetes: ['k8s'],
  MongoDB: ['mongo'],
  'Tailwind CSS': ['tailwind', 'tailwindcss'],
  'REST APIs': ['rest api', 'restful', 'rest apis'],
  'UI/UX Design': ['ui/ux', 'ux design', 'ui design'],
  'Machine Learning': ['ml models'],
  NLP: ['natural language processing'],
  'Spring Boot': ['springboot'],
  'ASP.NET': ['asp.net core', 'dotnet', '.net core'],
  'CI/CD': ['cicd', 'continuous integration'],
  'Unit Testing': ['unit tests'],
  'GitHub Actions': ['github action'],
  'Adobe Photoshop': ['photoshop'],
  'Adobe Illustrator': ['illustrator'],
  Excel: ['microsoft excel', 'ms excel'],
}

/** Skill names that are also everyday English words, so match them case-sensitively. */
export const CASE_SENSITIVE_SKILLS = new Set(['Go', 'Express', 'Swift', 'Excel', 'Sales'])