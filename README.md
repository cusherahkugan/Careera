# Careera — AI-Powered Career Platform

Careera is a full-stack web application built with Next.js, TypeScript, and PostgreSQL, designed to provide career-related functionality through a modern web interface with AI-powered features.

## Tech Stack

- **Frontend:** Next.js, React, TypeScript, Tailwind CSS
- **Authentication:** NextAuth.js
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Validation:** Zod
- **State Management:** Zustand
- **AI Integration:** OpenAI API
- **Deployment:** Vercel
- **Version Control:** Git and GitHub

## Getting Started

### Prerequisites

Install [Node.js](https://nodejs.org/) and ensure you have access to a PostgreSQL database.

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/cusherahkugan/Careera.git
cd Careera
npm install
```

### Environment Variables

Create a `.env` file in the project root and configure the required environment variables:

```env
DATABASE_URL="your-postgresql-connection-string"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-generated-secret"
OPENAI_API_KEY="your-openai-api-key"
```

Ensure that these variable names match your application configuration. Keep all secrets private and never commit your `.env` file.

### Database Setup

Generate the Prisma Client and apply the existing database migrations:

```bash
npx prisma generate
npx prisma migrate deploy
```

### Run Locally

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

To build and run the production version locally:

```bash
npm run build
npm run start
```

## Deployment

Careera can be deployed to [Vercel](https://vercel.com/) by importing the GitHub repository. Configure the required production environment variables and ensure the PostgreSQL database is accessible from the deployed application.


---

Developed using Next.js, PostgreSQL, Prisma, and AI technologies.
