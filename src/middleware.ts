import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

// Guards PAGES only. API routes check the session themselves and answer with
// a JSON 401/403.
export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const path = req.nextUrl.pathname

    // recruiter-only pages
    if (
      path.startsWith('/dashboard/jobs') ||
      path.startsWith('/dashboard/applicants') ||
      path.startsWith('/company')
    ) {
      if (token?.role !== 'RECRUITER') {
        return NextResponse.redirect(new URL('/dashboard', req.url))
      }
    }

    // job-seeker-only pages (profile form)
    if (path.startsWith('/onboarding') || path.startsWith('/profile')) {
      if (token?.role !== 'JOB_SEEKER') {
        return NextResponse.redirect(new URL('/dashboard', req.url))
      }
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: { signIn: '/login' },
  }
)

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/onboarding/:path*',
    '/profile/:path*',
    '/settings/:path*',
    '/applications/:path*',
    '/company/:path*',
  ],
}