/**
 * Next.js Edge Middleware — server-side auth + approval gate.
 * Uses @supabase/ssr to read the session from cookies set by Supabase Auth.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_PATHS = [
  '/login',
  '/api/register',
  '/api/approve-employee',
  '/api/refund-status',
  '/auth',
  '/pending-approval',
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

  // Build response object — cookies must be forwarded back to the browser
  const response = NextResponse.next({ request })

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

  // getUser() validates the JWT from the cookie server-side
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user || !user.email_confirmed_at) {
    const loginUrl = new URL('/login', request.url)
    if (pathname !== '/') loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Check approval — read own profile row (RLS allows auth.uid() = id always)
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('approved, profile_complete')
    .eq('id', user.id)
    .single()

  // If profile doesn't exist yet (race on first login after signup), let through
  // so the app can handle it gracefully — the insert may still be in flight
  if (profileError || !profile) {
    return response
  }

  // Unapproved — gate to pending page
  if (!profile.approved) {
    if (pathname.startsWith('/pending-approval')) return response
    return NextResponse.redirect(new URL('/pending-approval', request.url))
  }

  // Profile incomplete — gate to onboarding
  if (!profile.profile_complete && !pathname.startsWith('/complete-profile')) {
    return NextResponse.redirect(new URL('/complete-profile', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|logo\\.png|.*\\.svg|.*\\.png|.*\\.jpg|.*\\.ico).*)',
  ],
}
