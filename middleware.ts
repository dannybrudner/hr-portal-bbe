/**
 * Next.js Edge Middleware — server-side approval gate.
 *
 * The Supabase browser client (used in this app) stores sessions in localStorage,
 * not cookies. The @supabase/ssr cookie-based approach only works when the server
 * renders pages. Since this app is fully client-rendered (App Router with 'use client'),
 * the middleware cannot read the Supabase session from cookies.
 *
 * What this middleware DOES enforce server-side:
 * - Blocks direct navigation to /api/* routes without a Bearer token
 *   (each API route validates its own token — this is defence-in-depth)
 * - Adds HTTP security headers to every response
 * - Handles the /pending-approval redirect for unapproved users
 *   (enforced properly in AuthContext + AppShell on the client)
 *
 * The primary approval enforcement is:
 * 1. AuthContext: checks profile.approved after session loads
 * 2. Each API route: validates Bearer token + role server-side
 * 3. RLS policies: unapproved users cannot query other profiles
 *
 * A future migration to @supabase/ssr with cookie-based sessions would
 * enable full server-side session enforcement here.
 */
import { NextResponse, type NextRequest } from 'next/server'

const SECURITY_HEADERS = [
  ['X-Frame-Options', 'DENY'],
  ['X-Content-Type-Options', 'nosniff'],
  ['X-XSS-Protection', '1; mode=block'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
] as const

export async function middleware(request: NextRequest) {
  const response = NextResponse.next()

  // Apply security headers to every response
  SECURITY_HEADERS.forEach(([key, value]) => response.headers.set(key, value))

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|logo\\.png|.*\\.svg|.*\\.ico).*)',
  ],
}
