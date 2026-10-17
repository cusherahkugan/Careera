import type { AuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

// Short, sliding session: every session check issues a fresh token, so an
// active user stays signed in, but a closed browser expires within the hour.
const SESSION_MAX_AGE = 60 * 60 // 1 hour

// Id of the running server process (set once in next.config.ts). Tokens made
// by an earlier run carry a different id, so restarting the server signs
// everyone out. Enforced in development, or in production when
// LOGOUT_ON_RESTART=true.
const bootId = () => process.env.APP_BOOT_ID
const enforceBoot = () =>
  !!bootId() && (process.env.NODE_ENV !== 'production' || process.env.LOGOUT_ON_RESTART === 'true')

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
        token.boot = bootId()
        return token
      }

      // every later request: make sure the session was not revoked
      // ("sign out everywhere" / password change bump tokenVersion).
      if (token.id) {
        // the server was restarted since this token was issued
        if (enforceBoot() && token.boot !== bootId()) throw new Error('SESSION_REVOKED')

        let db: { tokenVersion: number; role: string } | null = null
        let lookupFailed = false

        try {
          db = await prisma.user.findUnique({
            where: { id: token.id },
            select: { tokenVersion: true, role: true },
          })
        } catch (error) {
          // A database hiccup must not sign everybody out: keep the session
          // as it is and check again on the next request.
          lookupFailed = true
          console.error('Session check skipped (database error):', error)
        }

        if (!lookupFailed) {
          // Throwing makes next-auth clear the cookie and treat the user as signed out.
          if (!db || db.tokenVersion !== token.tv) throw new Error('SESSION_REVOKED')
          token.role = db.role
        }
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