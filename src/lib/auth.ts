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

        // emails are stored lowercase (see registerSchema)
        const email = credentials.email.trim().toLowerCase()
        const user = await prisma.user.findUnique({ where: { email } })

        // same result for "no such user" and "wrong password" so accounts can't be probed
        if (!user || !user.password) return null

        const isValid = await bcrypt.compare(credentials.password, user.password)
        if (!isValid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          image: user.image,
        }
      },
    }),
  ],
  session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE },
  jwt: { maxAge: SESSION_MAX_AGE },
  pages: { signIn: '/login' },
  callbacks: {
    async jwt({ token, user }) {
      // `user` is only present on sign-in; copy id + role into the token once
      if (user) {
        token.id = user.id
        token.role = user.role
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