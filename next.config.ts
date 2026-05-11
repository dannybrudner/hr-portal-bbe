import type { NextConfig } from 'next'

const SUPABASE_HOST = 'wxvcqykrwrqqosikfsnl.supabase.co'

const securityHeaders = [
  // Allow framing only from same origin (for PDF viewer iframes)
  // X-Frame-Options: DENY would block our own PDF iframe viewer
  { key: 'X-Frame-Options',           value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'X-XSS-Protection',          value: '1; mode=block' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
}

export default nextConfig
