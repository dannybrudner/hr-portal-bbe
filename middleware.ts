/**
 * Next.js Edge Middleware — runs before every request.
 *
 * Enforces two things server-side (cannot be bypassed by frontend manipulation):
 * 1. Authentication — redirects unauthenticated users to /login
 * 2. Approval gate — redirects authenticated but unapproved users to /pending-approval
 *
 * Why middleware and not just AppShell:
 * - AppShell is client-side React — it fires after the page HTML is served
 * - Middleware runs at the edge, before the response is built
 * - Prevents unapproved users from making API calls or seeing any page content
 *
 * Note: Supabase session validation via @supabase/ssr is the correct pattern
 * for Next.js App Router. We deliberately use the cookie-based session here.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Paths that do NOT require authentication
const PUBLIC_PATHS = [
  '/login',
  '/api/register',           // signup endpoint
  '/api/approve-employee',   // manager approval links (token-authenticated)
  '/api/refund-status',      // JWT-authenticated separately
  '/auth',                   // Supabase auth callbacks
  '/pending-approval',       // "waiting for approval" page
  '/_next',
  '/favicon',
  '/logo',
]

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname.startsWith(p))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublic(pathname)) return NextResponse.next()

  // Build a Supabase server client using request cookies
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Validate session — getUser() verifies the JWT server-side
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const loginUrl = new URL('/login', request.url)
    if (pathname !== '/') loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Check approval status — query the profiles table
  // Use the anon client with the user's JWT: RLS allows reading own profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('approved, role, profile_complete')
    .eq('id', user.id)
    .single()

  // Email not confirmed — send to login
  if (!user.email_confirmed_at) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Account not approved — send to waiting page (API routes also blocked)
  if (!profile?.approved) {
    // Allow /pending-approval page itself and sign-out
    if (pathname.startsWith('/pending-approval') || pathname.startsWith('/api/auth')) {
      return response
    }
    return NextResponse.redirect(new URL('/pending-approval', request.url))
  }

  // Profile not complete — send to onboarding (except complete-profile itself)
  if (!profile?.profile_complete && !pathname.startsWith('/complete-profile')) {
    return NextResponse.redirect(new URL('/complete-profile', request.url))
  }

  return response
}

export const config = {
  matcher: [
    // Match all paths except static assets
    '/((?!_next/static|_next/image|favicon\\.ico|logo\\.png|.*\\.svg|.*\\.png|.*\\.jpg).*)',
  ],
}
