'use client'
/**
 * /complete-profile — mandatory onboarding page
 * Shown after email verification if profile is incomplete.
 * Users cannot access any other page until this is completed.
 */
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { AuthProvider } from '@/lib/AuthContext'
import Image from 'next/image'
import toast from 'react-hot-toast'

function CompleteProfileForm() {
  const { user, profile, loading, refreshProfile } = useAuth()
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  const [firstNameHe, setFirstNameHe] = useState('')
  const [lastNameHe, setLastNameHe] = useState('')
  const [firstNameEn, setFirstNameEn] = useState('')
  const [lastNameEn, setLastNameEn] = useState('')
  const [birthday, setBirthday] = useState('')
  const [phone, setPhone] = useState('')
  const [privateEmail, setPrivateEmail] = useState('')
  const [address, setAddress] = useState('')
  const [emergencyName, setEmergencyName] = useState('')
  const [emergencyPhone, setEmergencyPhone] = useState('')

  useEffect(() => {
    if (!loading) {
      if (!user) { router.push('/login'); return }
      // If profile is already complete, skip
      if ((profile as any)?.profile_complete) { router.push('/dashboard'); return }
      // Pre-fill any existing values
      if (profile) {
        setFirstNameHe((profile as any).first_name_he || '')
        setLastNameHe((profile as any).last_name_he || '')
        setFirstNameEn((profile as any).first_name_en || '')
        setLastNameEn((profile as any).last_name_en || '')
        setBirthday((profile as any).birthday || '')
        setPhone(profile.phone || '')
        setPrivateEmail((profile as any).private_email || '')
        setAddress(profile.address || '')
        setEmergencyName(profile.emergency_contact_name || '')
        setEmergencyPhone(profile.emergency_contact_phone || '')
      }
    }
  }, [loading, user, profile, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Client-side validation of all required fields
    const required: [string, string][] = [
      [firstNameHe, 'שם פרטי בעברית'],
      [lastNameHe, 'שם משפחה בעברית'],
      [firstNameEn, 'First name in English'],
      [lastNameEn, 'Last name in English'],
      [birthday, 'Birthday'],
      [phone, 'Phone number'],
      [emergencyName, 'Emergency contact name'],
      [emergencyPhone, 'Emergency contact phone'],
    ]
    for (const [val, label] of required) {
      if (!val.trim()) {
        toast.error(`${label} is required`)
        return
      }
    }

    setSaving(true)
    const fullName = `${firstNameHe} ${lastNameHe}`.trim()
    const initials = firstNameHe.charAt(0).toUpperCase() + lastNameHe.charAt(0).toUpperCase()

    const { error } = await supabase.from('profiles').update({
      full_name: fullName,
      first_name_he: firstNameHe,
      last_name_he: lastNameHe,
      first_name_en: firstNameEn,
      last_name_en: lastNameEn,
      birthday,
      phone,
      private_email: privateEmail,
      address,
      emergency_contact_name: emergencyName,
      emergency_contact_phone: emergencyPhone,
      avatar_initials: initials,
      profile_complete: true,
    }).eq('id', user!.id)

    if (error) {
      toast.error('Failed to save: ' + error.message)
      setSaving(false)
      return
    }

    // Sync birthday events for current + next year
    if (birthday) {
      const [, month, day] = birthday.split('-')
      const currentYear = new Date().getFullYear()
      for (const yr of [currentYear, currentYear + 1]) {
        const dateStr = `${yr}-${month}-${day}`
        const { data: existing } = await supabase
          .from('calendar_events').select('id')
          .eq('created_by', user!.id).eq('event_type', 'birthday').eq('date', dateStr)
          .maybeSingle()
        if (!existing) {
          await supabase.from('calendar_events').insert({
            title: `יום הולדת ${firstNameHe} 🎂`,
            date: dateStr, created_by: user!.id, event_type: 'birthday',
          })
        }
      }
    }

    await refreshProfile()
    toast.success('Profile complete! Welcome 🎉')
    router.push('/dashboard')
    setSaving(false)
  }

  if (loading) return null

  const Field = ({ label, children, required: req = false }: { label: string; children: React.ReactNode; required?: boolean }) => (
    <div>
      <label>{label} {req && <span style={{ color: 'var(--status-rejected)', fontWeight: '700' }}>*</span>}</label>
      {children}
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2rem 1rem', overflowY: 'auto' }}>
      <div style={{ width: '100%', maxWidth: '560px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ background: '#1a1a1a', borderRadius: '16px', padding: '1.25rem 2rem', border: '1px solid var(--border-accent)', display: 'inline-block', width: '100%' }}>
            <Image src="/logo.png" alt="Buchman Brudner Engineering" width={280} height={80} style={{ width: '100%', height: 'auto', objectFit: 'contain' }} priority />
          </div>
        </div>

        <div className="card" style={{ padding: '2rem' }}>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '20px', fontWeight: '700', marginBottom: '0.5rem' }}>Complete Your Profile</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '1.5rem' }}>
            Please fill in all required fields before accessing the portal. Fields marked with <span style={{ color: 'var(--status-rejected)' }}>*</span> are mandatory.
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Hebrew name */}
            <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--accent-light)', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem' }}>שם בעברית</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <Field label="שם פרטי" required><input className="input" value={firstNameHe} onChange={e => setFirstNameHe(e.target.value)} placeholder="דני" required /></Field>
              <Field label="שם משפחה" required><input className="input" value={lastNameHe} onChange={e => setLastNameHe(e.target.value)} placeholder="כהן" required /></Field>
            </div>

            {/* English name */}
            <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--accent-light)', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem' }}>Name in English</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <Field label="First Name" required><input className="input" value={firstNameEn} onChange={e => setFirstNameEn(e.target.value)} placeholder="Danny" required /></Field>
              <Field label="Last Name" required><input className="input" value={lastNameEn} onChange={e => setLastNameEn(e.target.value)} placeholder="Cohen" required /></Field>
            </div>

            {/* Birthday */}
            <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--accent-light)', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem' }}>Personal Details</div>
            <Field label="Birthday" required>
              <input className="input" type="date" value={birthday} onChange={e => setBirthday(e.target.value)} required />
            </Field>

            {/* Contact */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <Field label="Phone" required><input className="input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="050-000-0000" required /></Field>
              <Field label="Private Email"><input className="input" type="email" value={privateEmail} onChange={e => setPrivateEmail(e.target.value)} placeholder="personal@gmail.com" /></Field>
            </div>
            <Field label="Address"><input className="input" value={address} onChange={e => setAddress(e.target.value)} placeholder="Street, City" /></Field>

            {/* Emergency */}
            <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--accent-light)', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem' }}>Emergency Contact</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <Field label="Name" required><input className="input" value={emergencyName} onChange={e => setEmergencyName(e.target.value)} placeholder="Contact name" required /></Field>
              <Field label="Phone" required><input className="input" value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} placeholder="050-000-0000" required /></Field>
            </div>

            <button type="submit" className="btn-primary" disabled={saving} style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem', padding: '0.9rem' }}>
              {saving ? 'Saving...' : '→ Enter the Portal'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function CompleteProfilePage() {
  return (
    <AuthProvider>
      <CompleteProfileForm />
    </AuthProvider>
  )
}
