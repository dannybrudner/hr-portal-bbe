'use client'
import { useState, useEffect } from 'react'
import { supabase, Certificate } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import toast from 'react-hot-toast'
import { Save, Plus, X, Award, Trash2, Upload } from 'lucide-react'

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [emergencyName, setEmergencyName] = useState('')
  const [emergencyPhone, setEmergencyPhone] = useState('')
  const [bio, setBio] = useState('')
  const [saving, setSaving] = useState(false)
  const [certs, setCerts] = useState<Certificate[]>([])
  const [showCertModal, setShowCertModal] = useState(false)
  const [certName, setCertName] = useState('')
  const [certIssuedBy, setCertIssuedBy] = useState('')
  const [certDate, setCertDate] = useState('')
  const [certFile, setCertFile] = useState<File | null>(null)
  const [certLoading, setCertLoading] = useState(false)

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '')
      setPhone(profile.phone || '')
      setAddress(profile.address || '')
      setEmergencyName(profile.emergency_contact_name || '')
      setEmergencyPhone(profile.emergency_contact_phone || '')
      setBio(profile.bio || '')
    }
  }, [profile])

  useEffect(() => {
    if (user) supabase.from('certificates').select('*').eq('user_id', user.id).order('issue_date', { ascending: false }).then(({ data }) => setCerts(data || []))
  }, [user])

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2)
    const { error } = await supabase.from('profiles').update({
      full_name: fullName, phone, address,
      emergency_contact_name: emergencyName,
      emergency_contact_phone: emergencyPhone,
      bio, avatar_initials: initials,
    }).eq('id', user!.id)
    if (error) toast.error(error.message)
    else { toast.success('Profile saved!'); refreshProfile() }
    setSaving(false)
  }

  async function addCert(e: React.FormEvent) {
    e.preventDefault()
    setCertLoading(true)
    let fileUrl = ''
    if (certFile) {
      const path = `certs/${user!.id}/${Date.now()}_${certFile.name}`
      await supabase.storage.from('documents').upload(path, certFile)
      const { data: url } = supabase.storage.from('documents').getPublicUrl(path)
      fileUrl = url.publicUrl
    }
    const { error } = await supabase.from('certificates').insert({
      user_id: user!.id, name: certName,
      issued_by: certIssuedBy, issue_date: certDate, file_url: fileUrl,
    })
    if (error) toast.error(error.message)
    else {
      toast.success('Certificate added!')
      setShowCertModal(false); setCertName(''); setCertIssuedBy(''); setCertDate(''); setCertFile(null)
      const { data } = await supabase.from('certificates').select('*').eq('user_id', user!.id).order('issue_date', { ascending: false })
      setCerts(data || [])
    }
    setCertLoading(false)
  }

  async function deleteCert(id: string) {
    if (!confirm('Delete this certificate?')) return
    await supabase.from('certificates').delete().eq('id', id)
    setCerts(c => c.filter(x => x.id !== id))
    toast.success('Deleted')
  }

  const initials = profile?.full_name ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2) : profile?.email?.slice(0,2).toUpperCase() ?? 'HR'

  return (
    <div className="fade-in">
      <div className="section-title">My Profile · הפרופיל שלי</div>
      <div className="section-subtitle">Manage your personal information and credentials</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Form */}
        <form onSubmit={saveProfile}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '-0.5rem' }}>Personal Information</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label>Full Name</label>
                <input className="input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" />
              </div>
              <div>
                <label>Phone Number</label>
                <input className="input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="050-000-0000" />
              </div>
            </div>
            <div>
              <label>Address</label>
              <input className="input" value={address} onChange={e => setAddress(e.target.value)} placeholder="Street, City" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label>Emergency Contact Name</label>
                <input className="input" value={emergencyName} onChange={e => setEmergencyName(e.target.value)} placeholder="Contact name" />
              </div>
              <div>
                <label>Emergency Contact Phone</label>
                <input className="input" value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} placeholder="050-000-0000" />
              </div>
            </div>
            <div>
              <label>Bio (optional)</label>
              <textarea className="input" rows={3} value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell us about yourself..." style={{ resize: 'vertical' }} />
            </div>
            <button type="submit" className="btn-primary" disabled={saving} style={{ width: 'fit-content' }}>
              <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>

        {/* Avatar card */}
        <div className="card" style={{ textAlign: 'center', alignSelf: 'flex-start' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '20px', background: 'var(--accent-muted)', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne, sans-serif', fontWeight: '700', fontSize: '28px', color: 'var(--accent-light)', margin: '0 auto 1rem' }}>
            {initials}
          </div>
          <div style={{ fontWeight: '600', fontSize: '16px' }}>{profile?.full_name || 'Employee'}</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '0.25rem', wordBreak: 'break-all' }}>{profile?.email}</div>
          <div style={{ marginTop: '0.75rem' }}>
            <span className={`badge ${profile?.role === 'manager' ? 'badge-approved' : 'badge-pending'}`}>
              {profile?.role === 'manager' ? '⭐ Manager' : '👤 Employee'}
            </span>
          </div>
        </div>
      </div>

      {/* Certificates */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: '16px', fontWeight: '700' }}>Certificates & Training · תעודות והכשרות</h3>
          <button className="btn-primary" onClick={() => setShowCertModal(true)} style={{ padding: '0.5rem 1rem' }}>
            <Plus size={16} /> Add Certificate
          </button>
        </div>
        {certs.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
            <Award size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 0.75rem' }} />
            <div style={{ color: 'var(--text-secondary)' }}>No certificates added yet</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem' }}>
            {certs.map(c => (
              <div key={c.id} className="card card-hover" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(201,146,74,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Award size={20} style={{ color: 'var(--accent-light)' }} />
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontWeight: '600', fontSize: '14px' }}>{c.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{c.issued_by}</div>
                  {c.issue_date && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.issue_date}</div>}
                  {c.file_url && (
                    <a href={c.file_url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: 'var(--accent-light)', textDecoration: 'none' }}>📎 View file</a>
                  )}
                </div>
                <button onClick={() => deleteCert(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.2rem' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCertModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '20px', fontWeight: '700' }}>Add Certificate</h2>
              <button onClick={() => setShowCertModal(false)} className="btn-secondary" style={{ padding: '0.4rem' }}><X size={16} /></button>
            </div>
            <form onSubmit={addCert} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label>Certificate Name</label>
                <input className="input" placeholder="e.g. B.Sc Computer Science" value={certName} onChange={e => setCertName(e.target.value)} required />
              </div>
              <div>
                <label>Issued By</label>
                <input className="input" placeholder="Institution name" value={certIssuedBy} onChange={e => setCertIssuedBy(e.target.value)} />
              </div>
              <div>
                <label>Issue Date</label>
                <input className="input" type="date" value={certDate} onChange={e => setCertDate(e.target.value)} />
              </div>
              <div>
                <label>File (optional)</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-input)', border: '1px dashed var(--border)', borderRadius: '12px', padding: '1rem', cursor: 'pointer', color: certFile ? 'var(--accent-light)' : 'var(--text-muted)' }}>
                  <Upload size={18} />
                  {certFile ? certFile.name : 'Upload certificate file'}
                  <input type="file" style={{ display: 'none' }} accept="image/*,.pdf" onChange={e => setCertFile(e.target.files?.[0] || null)} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="submit" className="btn-primary" disabled={certLoading}>{certLoading ? 'Adding...' : 'Add Certificate'}</button>
                <button type="button" className="btn-secondary" onClick={() => setShowCertModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
