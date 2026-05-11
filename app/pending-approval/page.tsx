'use client'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function PendingApprovalPage() {
  const router = useRouter()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)', padding: '1rem',
    }}>
      <div style={{ width: '100%', maxWidth: '460px', textAlign: 'center' }}>
        <div style={{
          background: '#1a1a1a', borderRadius: '16px', padding: '1.5rem 2rem',
          border: '1px solid var(--border-accent)', marginBottom: '1.5rem',
          display: 'inline-block', width: '100%',
        }}>
          <Image src="/logo.png" alt="Buchman Brudner Engineering"
            width={240} height={72} style={{ width: '100%', height: 'auto', objectFit: 'contain' }} priority />
        </div>

        <div className="card" style={{ padding: '2.5rem' }}>
          <div style={{ fontSize: '52px', marginBottom: '1.25rem' }}>⏳</div>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: '700', marginBottom: '0.75rem', color: 'var(--accent-light)' }}>
            Awaiting Manager Approval
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.7, marginBottom: '1.5rem' }}>
            Your registration is being reviewed by a manager. You'll receive a welcome email
            as soon as your account is approved — usually within one business day.
          </p>
          <div style={{
            background: 'var(--bg-input)', borderRadius: '12px', padding: '1rem 1.25rem',
            border: '1px solid var(--border)', marginBottom: '1.5rem',
            fontSize: '13px', color: 'var(--text-muted)', textAlign: 'left', lineHeight: 1.6,
          }}>
            <strong style={{ color: 'var(--text-secondary)' }}>What happens next?</strong><br />
            Your manager will receive an email with your registration details and can
            approve or reject your account with a single click.
          </div>
          <button onClick={handleSignOut} className="btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}
