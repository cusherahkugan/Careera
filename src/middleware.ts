import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

// Guards PAGES only. API routes check the session themselves and answer with
// a JSON 401/403, which is what axios callers need (a redirect to /login
// would hand them HTML instead).
export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const path = req.nextUrl.pathname

    if (
      path.startsWith('/dashboard/jobs/new') ||
      path.startsWith('/dashboard/applicants')
    ) {
      if (token?.role !== 'RECRUITER') {
        return NextResponse.redirect(new URL('/dashboard', req.url))
      }
    }

    if (path.startsWith('/dashboard/applications')) {
      if (token?.role !== 'JOB_SEEKER') {
        return NextResponse.redirect(new URL('/dashboard', req.url))
      }
    }

    // the profile / onboarding form is for job seekers only
    if (path.startsWith('/onboarding')) {
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
  matcher: ['/dashboard/:path*', '/onboarding/:path*'],
}