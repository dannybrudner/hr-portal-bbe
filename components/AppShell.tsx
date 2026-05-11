'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/AuthContext'
import Sidebar from '@/components/Sidebar'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!user) {
      const next = window.location.pathname + window.location.search
      router.push(next && next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login')
      return
    }
    // Block access until profile is complete
    // profile_complete is false by default for new users
    // Only redirect when profile is fully loaded AND confirmed incomplete
    // Do NOT redirect when profile is null (still loading)
    if (profile !== null && profile !== undefined && !(profile as any).profile_complete) {
      router.push('/complete-profile')
    }
  }, [user, profile, loading, router])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '12px',
          background: 'var(--accent)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontFamily: 'Syne, sans-serif',
          fontWeight: '700', fontSize: '20px', color: '#1a1000', margin: '0 auto 1rem',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}>HR</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading...</div>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
    </div>
  )

  if (!user) return null

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto', padding: '2rem', maxWidth: '1100px' }}>
        {children}
      </main>
    </div>
  )
}
