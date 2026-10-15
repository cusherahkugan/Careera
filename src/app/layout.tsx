import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { getServerSession } from 'next-auth'
import './globals.css'
import { Providers } from '@/components/providers'
import { authOptions } from '@/lib/auth'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Careera - Find work that fits',
  description:
    'An AI-assisted job board. Build one profile, get matched to jobs, apply in a click, and track every application in one place.',
  keywords: ['jobs', 'recruitment', 'hiring', 'careers'],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The server decides who is signed in, so the very first paint is correct
  // and a visitor never sees a logged-in interface.
  let session = null
  try {
    session = await getServerSession(authOptions)
  } catch {
    session = null // revoked / broken cookie counts as signed out
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} bg-white text-zinc-800 antialiased`}>
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  )
}