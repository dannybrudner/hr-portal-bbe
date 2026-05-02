'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import { AuthProvider } from '@/lib/AuthContext'

function LoginForm() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push('/dashboard')
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (data.user) {
          const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2)
          await supabase.from('profiles').insert({
            id: data.user.id,
            email,
            full_name: fullName,
            role: 'employee',
            avatar_initials: initials,
            phone: '', address: '', emergency_contact_name: '',
            emergency_contact_phone: '', bio: '',
          })
          toast.success('Account created! Please check your email to confirm.')
          setMode('login')
        }
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
      <div style={{ width: '100%', maxWidth: '420px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '18px',
            background: 'var(--accent)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontFamily: 'Syne, sans-serif',
            fontWeight: '700', fontSize: '24px', color: '#1a1000', margin: '0 auto 1rem',
          }}>HR</div>
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: '26px', fontWeight: '700' }}>HR Portal</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '0.25rem' }}>Employee Self-Service</div>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: 'var(--bg-input)', padding: '4px', borderRadius: '10px' }}>
            {(['login', 'signup'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
                fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '14px', fontWeight: '500',
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
            <button className="btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}>
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <AuthProvider>
      <LoginForm />
    </AuthProvider>
  )
}
