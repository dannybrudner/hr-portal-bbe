'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'
import { Suspense } from 'react'

function ConfirmContent() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const handleConfirm = async () => {
      // Supabase puts the token in the URL hash or as query params
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        setStatus('error')
      } else {
        setStatus('success')
      }
    }
    // Give Supabase a moment to process the token from the URL
    setTimeout(handleConfirm, 1000)
  }, [])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)', padding: '1rem',
    }}>
      <div style={{ width: '100%', maxWidth: '420px', textAlign: 'center' }}>
        <div style={{
          background: '#1a1a1a', borderRadius: '16px', padding: '1.5rem 2rem',
          border: '1px solid var(--border-accent)', marginBottom: '2rem',
          display: 'inline-block', width: '100%',
        }}>
          <Image src="/logo.png" alt="Buchman Brudner Engineering" width={300} height={90}
            style={{ width: '100%', height: 'auto', objectFit: 'contain' }} priority />
        </div>

        <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
          {status === 'loading' && (
            <>
              <div style={{ fontSize: '48px', marginBottom: '1rem' }}>⏳</div>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '20px', marginBottom: '0.5rem' }}>Confirming your email...</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Please wait a moment.</p>
            </>
          )}
          {status === 'success' && (
            <>
              <div style={{
                width: '72px', height: '72px', borderRadius: '50%',
                background: 'var(--status-approved-bg)', border: '2px solid var(--status-approved)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 1.5rem', fontSize: '32px',
              }}>✓</div>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', marginBottom: '0.75rem' }}>Email Confirmed!</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '2rem', lineHeight: 1.6 }}>
                Your account has been verified successfully.<br />You can now sign in to the HR Portal.
              </p>
              <button className="btn-primary" onClick={() => router.push('/login')}
                style={{ width: '100%', justifyContent: 'center', fontSize: '15px' }}>
                → Go to Sign In
              </button>
            </>
          )}
          {status === 'error' && (
            <>
              <div style={{
                width: '72px', height: '72px', borderRadius: '50%',
                background: 'var(--status-rejected-bg)', border: '2px solid var(--status-rejected)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 1.5rem', fontSize: '32px',
              }}>✗</div>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', marginBottom: '0.75rem' }}>Something went wrong</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '2rem' }}>
                The confirmation link may have expired. Please try signing up again.
              </p>
              <button className="btn-primary" onClick={() => router.push('/login')}
                style={{ width: '100%', justifyContent: 'center' }}>
                → Back to Sign In
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }} />}>
      <ConfirmContent />
    </Suspense>
  )
}
