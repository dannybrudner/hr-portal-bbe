'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import { AuthProvider } from '@/lib/AuthContext'
import Image from 'next/image'

function LoginForm() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [signupDone, setSignupDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const nextPath = useNextPath()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: {
            // Supabase handles session persistence — rememberMe controls local storage vs session
          }
        })
        if (error) throw error
        // Store remember me preference
        if (rememberMe) {
          localStorage.setItem('hr_remember_me', 'true')
        } else {
          sessionStorage.setItem('hr_session_only', 'true')
          localStorage.removeItem('hr_remember_me')
        }
        router.push(nextPath)
      } else {
        // Registration goes through server-side route — prevents client from
        // manipulating role or approval status via direct Supabase calls
        if (password !== confirmPassword) throw new Error('Passwords do not match')
        if (password.length < 8) throw new Error('Password must be at least 8 characters')
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, fullName }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Registration failed')
        setSignupDone(true)
      }
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)', padding: '1rem',
    }}>
      {/* Background subtle pattern */}
      <div style={{
        position: 'fixed', inset: 0, opacity: 0.03,
        backgroundImage: 'repeating-linear-gradient(45deg, var(--accent) 0, var(--accent) 1px, transparent 0, transparent 50%)',
        backgroundSize: '20px 20px', pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: '420px', position: 'relative' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            background: '#1a1a1a', borderRadius: '16px', padding: '1.5rem 2rem',
            border: '1px solid var(--border-accent)', marginBottom: '1rem',
            display: 'inline-block', width: '100%',
          }}>
            <Image
              src="/logo.png"
              alt="Buchman Brudner Engineering"
              width={300}
              height={90}
              style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
              priority
            />
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Employee Self-Service Portal</div>
        </div>

        {/* Card */}
        {signupDone ? (
          <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '1rem' }}>📬</div>
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '20px', marginBottom: '0.75rem' }}>Check your email!</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              We sent a confirmation link to <strong style={{ color: 'var(--accent-light)' }}>{email}</strong>.<br />
              Click the link to verify your email. Your manager will then receive an approval request — you'll get a welcome email once approved.
            </p>
            <button className="btn-secondary" onClick={() => { setSignupDone(false); setMode('login') }}>
              ← Back to Sign In
            </button>
          </div>
        ) : (
        <div className="card" style={{ padding: '2rem' }}>
          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: 'var(--bg-input)', padding: '4px', borderRadius: '10px' }}>
            {(['login', 'signup'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
                fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '14px', fontWeight: '600',
                background: mode === m ? 'var(--accent)' : 'transparent',
                color: mode === m ? '#1a1000' : 'var(--text-secondary)',
                transition: 'all 0.2s',
              }}>
                {m === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {mode === 'signup' && (
              <div>
                <label>Full Name</label>
                <input className="input" type="text" placeholder="Your full name" value={fullName} onChange={e => setFullName(e.target.value)} required />
              </div>
            )}
            <div>
              <label>Email</label>
              <input className="input" type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <label>Password</label>
              <input className="input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            {mode === 'signup' && (
              <div>
                <label>Confirm Password</label>
                <input className="input" type="password" placeholder="••••••••" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
              </div>
            )}

            {mode === 'login' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }} onClick={() => setRememberMe(!rememberMe)}>
                <div style={{
                  width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0,
                  border: `2px solid ${rememberMe ? 'var(--accent)' : 'var(--border)'}`,
                  background: rememberMe ? 'var(--accent)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s',
                }}>
                  {rememberMe && (
                    <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                      <path d="M1 5L4.5 8.5L11 1" stroke="#1a1000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)', userSelect: 'none' }}>Remember me</span>
              </div>
            )}

            <button className="btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}>
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>
        )}
      </div>
    </div>
  )
}

function useNextPath() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/dashboard'
  // Prevent open redirect: only allow relative internal paths
  if (!next.startsWith('/') || next.startsWith('//')) return '/dashboard'
  return next
}

function LoginInner() {
  return (
    <AuthProvider>
      <LoginForm />
    </AuthProvider>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  )
}
