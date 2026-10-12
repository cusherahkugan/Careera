import type { AuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const email = credentials.email.trim().toLowerCase()
        const user = await prisma.user.findUnique({ where: { email } })

        // same result for "no such user" and "wrong password"
        if (!user || !user.password) return null

        const isValid = await bcrypt.compare(credentials.password, user.password)
        if (!isValid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tokenVersion: user.tokenVersion,
        }
      },
    }),
  ],
  session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE },
  jwt: { maxAge: SESSION_MAX_AGE },
  pages: { signIn: '/login' },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // sign-in: remember who this is and which "generation" of sessions it belongs to
      if (user) {
        token.id = user.id
        token.role = user.role
        token.tv = user.tokenVersion ?? 0
        return token
      }

      // every later request: make sure the session was not revoked
      // ("sign out everywhere" / password change bump tokenVersion).
      // Throwing makes next-auth clear the cookie and treat the user as signed out.
      if (token.id) {
        const db = await prisma.user.findUnique({
          where: { id: token.id },
          select: { tokenVersion: true, role: true },
        })
        if (!db || db.tokenVersion !== token.tv) throw new Error('SESSION_REVOKED')
        token.role = db.role
      }

      // useSession().update({ name }) after the profile form changes the name
      if (trigger === 'update' && typeof session?.name === 'string' && session.name.trim()) {
        token.name = session.name.trim()
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id
        session.user.role = token.role
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}