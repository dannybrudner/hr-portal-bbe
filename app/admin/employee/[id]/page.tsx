'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase, Profile, Certificate, Payslip, TaxForm, LeaveRequest } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { getSignedUrl } from '@/lib/documentService'
import toast from 'react-hot-toast'
import { ArrowLeft, Award, FileText, Calendar, Mail, Phone, MapPin, AlertCircle, ExternalLink } from 'lucide-react'
import { format, differenceInCalendarDays } from 'date-fns'

type EmpDoc = {
  id: string; document_type: string; file_name: string
  storage_path: string; upload_date: string; year: number; quarter: number
}

const DOC_TYPE_LABELS: Record<string, string> = {
  leave_attachment: 'Leave Attachment', sick_note: 'Sick Note', certificate: 'Certificate',
  payslip: 'Payslip', tax_form: 'Tax Form', general: 'General', hr_document: 'HR Document',
}

export default function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { profile: myProfile, loading: authLoading } = useAuth()
  const router = useRouter()
  const [emp, setEmp] = useState<Profile | null>(null)
  const [certs, setCerts] = useState<Certificate[]>([])
  const [empDocs, setEmpDocs] = useState<EmpDoc[]>([])
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [leaveHistory, setLeaveHistory] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'documents' | 'leave'>('overview')

  useEffect(() => {
    if (authLoading) return                          // wait for auth
    if (!myProfile) return                           // still loading profile
    if (myProfile.role !== 'manager') { router.push('/dashboard'); return }
    loadData()
  }, [id, myProfile, authLoading])

  async function loadData() {
    setLoading(true)
    const [{ data: profile }, { data: certData }, { data: docs }, { data: ps }, { data: lr }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).single(),
      supabase.from('certificates').select('*').eq('user_id', id).order('issue_date', { ascending: false }),
      supabase.from('employee_documents').select('*').eq('employee_id', id).order('upload_date', { ascending: false }),
      supabase.from('payslips').select('*').eq('user_id', id).order('year', { ascending: false }).order('month', { ascending: false }),
      supabase.from('leave_requests').select('*').eq('user_id', id).eq('archived', false).order('created_at', { ascending: false }),
    ])
    setEmp(profile)
    setCerts(certData || [])
    setEmpDocs(docs || [])
    setPayslips(ps || [])
    setLeaveHistory(lr || [])
    setLoading(false)
  }

  async function openDoc(storagePath: string, id: string) {
    setOpeningId(id)
    const url = await getSignedUrl(storagePath)
    setOpeningId(null)
    if (url) window.open(url, '_blank')
    else toast.error('Could not open file')
  }

  async function openCert(fileUrl: string) {
    if (!fileUrl) return
    // Certs may use old public URL or new path — handle both
    if (fileUrl.startsWith('http')) window.open(fileUrl, '_blank')
    else {
      const url = await getSignedUrl(fileUrl)
      if (url) window.open(url, '_blank')
    }
  }

  if (loading) return (
    <div className="fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ color: 'var(--text-muted)' }}>Loading profile...</div>
    </div>
  )

  if (!emp) return (
    <div className="fade-in card" style={{ textAlign: 'center', padding: '3rem' }}>
      <AlertCircle size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
      <div>Employee not found</div>
      <button className="btn-secondary" onClick={() => router.back()} style={{ marginTop: '1rem' }}>← Go Back</button>
    </div>
  )

  const initials = emp.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  // Group emp docs by year/quarter
  const docsByYear: Record<number, Record<number, EmpDoc[]>> = {}
  empDocs.forEach(d => {
    if (!docsByYear[d.year]) docsByYear[d.year] = {}
    if (!docsByYear[d.year][d.quarter]) docsByYear[d.year][d.quarter] = []
    docsByYear[d.year][d.quarter].push(d)
  })

  return (
    <div className="fade-in">
      {/* Back button */}
      <button onClick={() => router.push('/admin')} className="btn-secondary" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <ArrowLeft size={15} /> Back to Team
      </button>

      {/* Profile header */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div className="avatar" style={{ width: '64px', height: '64px', fontSize: '22px', borderRadius: '20px', flexShrink: 0 }}>{initials}</div>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '20px', fontWeight: '700', margin: 0 }}>{emp.full_name}</h2>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            <span className={`badge ${emp.role === 'manager' ? 'badge-approved' : 'badge-pending'}`}>
              {emp.role === 'manager' ? '⭐ Manager' : '👤 Employee'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Mail size={13} /> {emp.email}
            </span>
            {emp.phone && (
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Phone size={13} /> {emp.phone}
              </span>
            )}
            {emp.address && (
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <MapPin size={13} /> {emp.address}
              </span>
            )}
          </div>
        </div>
        {/* Quick stats */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {[
            { label: 'Documents', value: empDocs.length },
            { label: 'Certificates', value: certs.length },
            { label: 'Leave Requests', value: leaveHistory.length },
          ].map(stat => (
            <div key={stat.label} style={{ textAlign: 'center', background: 'var(--bg-input)', borderRadius: '12px', padding: '0.75rem 1.25rem' }}>
              <div style={{ fontWeight: '700', fontSize: '22px', color: 'var(--accent-light)' }}>{stat.value}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {([['overview', 'Overview'], ['documents', 'Documents'], ['leave', 'Leave History']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{
            padding: '0.6rem 1.1rem', borderRadius: '10px 10px 0 0',
            border: `1px solid ${activeTab === id ? 'var(--border-accent)' : 'var(--border)'}`,
            borderBottom: activeTab === id ? '1px solid var(--bg-card)' : '1px solid var(--border)',
            background: activeTab === id ? 'var(--bg-card)' : 'transparent',
            color: activeTab === id ? 'var(--accent-light)' : 'var(--text-secondary)',
            cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif',
            fontSize: '13px', fontWeight: activeTab === id ? '600' : '400',
            marginBottom: '-1px',
          }}>{label}</button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
          {/* Certificates */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
              CERTIFICATES ({certs.length})
            </div>
            {certs.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '13px' }}>No certificates</div>
            ) : certs.map(c => (
              <div key={c.id} className="card" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <Award size={20} style={{ color: 'var(--accent-light)', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '600', fontSize: '14px' }}>{c.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{c.issued_by}</div>
                  {c.issue_date && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.issue_date}</div>}
                  {c.file_url && (
                    <button onClick={() => openCert(c.file_url)} className="btn-secondary"
                      style={{ marginTop: '6px', padding: '0.25rem 0.6rem', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <ExternalLink size={11} /> View
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Payslips */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
              PAYSLIPS ({payslips.length})
            </div>
            {payslips.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '13px' }}>No payslips</div>
            ) : payslips.slice(0, 6).map(ps => (
              <div key={ps.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: '600', fontSize: '14px' }}>{MONTHS[ps.month - 1]} {ps.year}</span>
                <a href={ps.file_url} target="_blank" rel="noreferrer" className="btn-secondary"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '11px', textDecoration: 'none' }}>View</a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DOCUMENTS TAB */}
      {activeTab === 'documents' && (
        <div>
          {empDocs.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <FileText size={40} style={{ margin: '0 auto 1rem' }} />
              No documents uploaded
            </div>
          ) : Object.entries(docsByYear).sort(([a], [b]) => +b - +a).map(([year, quarters]) => (
            <div key={year} style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--accent-light)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                📁 {year}
              </div>
              {Object.entries(quarters).sort(([a], [b]) => +a - +b).map(([q, qDocs]) => (
                <div key={q} style={{ marginBottom: '1rem', marginLeft: '1rem' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Q{q}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginLeft: '0.75rem' }}>
                    {qDocs.map(doc => (
                      <div key={doc.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem' }}>
                        <span style={{ fontSize: '18px' }}>📄</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '14px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.file_name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {DOC_TYPE_LABELS[doc.document_type] || doc.document_type} · {format(new Date(doc.upload_date), 'dd/MM/yyyy')}
                          </div>
                        </div>
                        <button onClick={() => openDoc(doc.storage_path, doc.id)} disabled={openingId === doc.id}
                          className="btn-secondary" style={{ padding: '0.3rem 0.65rem', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
                          <ExternalLink size={12} /> {openingId === doc.id ? '...' : 'View'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* LEAVE HISTORY TAB */}
      {activeTab === 'leave' && (
        <div>
          {leaveHistory.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <Calendar size={40} style={{ margin: '0 auto 1rem' }} />
              No leave requests
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {leaveHistory.map(r => {
                const d = differenceInCalendarDays(new Date(r.end_date), new Date(r.start_date)) + 1
                return (
                  <div key={r.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '14px' }}>{r.leave_type}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {format(new Date(r.start_date), 'dd/MM/yyyy')} — {format(new Date(r.end_date), 'dd/MM/yyyy')} · {d} day{d > 1 ? 's' : ''}
                      </div>
                      {r.reason && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{r.reason}</div>}
                    </div>
                    <span className={`badge badge-${r.status}`} style={{ marginLeft: 'auto' }}>
                      {r.status}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
