'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase, LeaveRequest, Profile } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { DocViewButton } from '@/components/DocViewer'
import { registerDocument } from '@/lib/documentService'
import { ArrowLeft, CheckCircle, XCircle, Upload, Mail, Users, FileText, ChevronDown, ChevronUp, UserCheck, UserX } from 'lucide-react'
import { format, differenceInCalendarDays } from 'date-fns'

const TABS = [
  { id: 'leave', label: 'Leave Requests', icon: '🗓️' },
  { id: 'refunds', label: 'Refunds', icon: '💳' },
  { id: 'docs', label: 'Documents', icon: '📁' },
  { id: 'email', label: 'Send Email', icon: '📧' },
  { id: 'users', label: 'Team', icon: '👥' },
]

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function AdminPage() {
  const { user, profile } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState('leave')
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [filter, setFilter] = useState<'all'|'pending'|'approved'|'rejected'>('pending')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [managerNote, setManagerNote] = useState('')
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState<Profile | null>(null)
  const [refunds, setRefunds] = useState<any[]>([])
  const [refundFilter, setRefundFilter] = useState<string>('all')
  const [leaveArchived, setLeaveArchived] = useState(false)
  const [refundArchived, setRefundArchived] = useState(false)
  const [emailRecipient, setEmailRecipient] = useState('all')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [processingId, setProcessingId] = useState<string|null>(null)

  // Redirect non-managers
  useEffect(() => {
    if (profile && profile.role !== 'manager') router.push('/dashboard')
  }, [profile, router])

  const fetchRequests = useCallback(async () => {
    const query = supabase.from('leave_requests').select('*, profiles(*)').eq('archived', leaveArchived).order('created_at', { ascending: false })
    if (filter !== 'all') query.eq('status', filter)
    const { data } = await query
    setRequests(data || [])
  }, [filter, leaveArchived])

  const fetchProfiles = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setAllProfiles(data || [])
  }, [])

  useEffect(() => { fetchRequests() }, [fetchRequests])
  useEffect(() => { fetchProfiles() }, [fetchProfiles])

  async function handleLeave(id: string, status: 'approved' | 'rejected') {
    setProcessingId(id)
    const { error } = await supabase.from('leave_requests').update({ status, manager_note: managerNote }).eq('id', id)
    if (error) { toast.error(error.message); setProcessingId(null); return }

    // Find the request and send notifications
    const leaveReq = requests.find(r => r.id === id)
    if (leaveReq?.profiles?.email) {
      await fetch('/api/notify-leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: leaveReq.profiles.email,
          name: leaveReq.profiles.full_name,
          status, leaveType: leaveReq.leave_type,
          startDate: leaveReq.start_date, endDate: leaveReq.end_date,
          note: managerNote,
        }),
      })
    }

    // Create in-app notification for the employee
    if (leaveReq) {
      const emoji = status === 'approved' ? '✅' : '❌'
      const msg = status === 'approved'
        ? `Your ${leaveReq.leave_type} request (${leaveReq.start_date} - ${leaveReq.end_date}) was approved.${managerNote ? ' Note: ' + managerNote : ''}`
        : `Your ${leaveReq.leave_type} request (${leaveReq.start_date} - ${leaveReq.end_date}) was rejected.${managerNote ? ' Reason: ' + managerNote : ''}`
      await supabase.from('notifications').insert({
        user_id: leaveReq.user_id,
        title: `${emoji} Leave Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        message: msg,
        type: status === 'approved' ? 'leave_approved' : 'leave_rejected',
        link: '/leave',
        read: false,
      })
    }
    toast.success(`Request ${status}!`)
    setExpanded(null); setManagerNote('')
    fetchRequests()
    fetchRefunds()
    setProcessingId(null)
  }

  async function fetchRefunds() {
    const { data } = await supabase.from('refund_requests')
      .select('*, profiles(full_name, email)')
      .order('created_at', { ascending: false })
    setRefunds(data || [])
  }

  async function updateRefundStatus(id: string, status: string) {
    const { error } = await supabase.from('refund_requests').update({ status }).eq('id', id)
    if (error) toast.error(error.message)
    else { toast.success(`Marked as ${status}`); fetchRefunds() }
  }

  async function selectEmployee(p: Profile) {
    setSelectedEmployee(p)

  }





  async function sendEmail(e: React.FormEvent) {
    e.preventDefault()
    setSendingEmail(true)
    const recipients = emailRecipient === 'all'
      ? allProfiles.filter(p => p.id !== user!.id).map(p => ({ email: p.email, name: p.full_name }))
      : [allProfiles.find(p => p.id === emailRecipient)].filter(Boolean).map(p => ({ email: p!.email, name: p!.full_name }))

    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipients, subject: emailSubject, body: emailBody }),
    })
    if (res.ok) { toast.success('Email sent!'); setEmailSubject(''); setEmailBody('') }
    else toast.error('Failed to send email')
    setSendingEmail(false)
  }

  async function toggleRole(_p: Profile) {
    toast.error('Role assignment is done via backend only')
  }

  const approvedSummary = allProfiles.map(p => {
    const approved = requests.filter(r => r.user_id === p.id && r.status === 'approved')
    const total = approved.reduce((sum, r) => sum + differenceInCalendarDays(new Date(r.end_date), new Date(r.start_date)) + 1, 0)
    return { profile: p, days: total }
  }).filter(s => s.days > 0)

  async function archiveLeave(id: string, archive: boolean) {
    const { error } = await supabase.from('leave_requests').update({ archived: archive }).eq('id', id)
    if (error) toast.error(error.message)
    else { toast.success(archive ? 'Archived' : 'Restored'); fetchRequests() }
  }

  async function archiveRefundItem(id: string, archive: boolean) {
    const { error } = await supabase.from('refund_requests').update({ archived: archive }).eq('id', id)
    if (error) toast.error(error.message)
    else { toast.success(archive ? 'Archived' : 'Restored'); fetchRefunds() }
  }

  const pendingLeaveCount = requests.filter(r => r.status === 'pending').length
  const pendingRefundCount = refunds.filter(r => r.status === 'pending').length

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button className="btn-secondary" onClick={() => router.push('/dashboard')} style={{ padding: '0.5rem 0.75rem' }}>
          <ArrowLeft size={16} /> Back
        </button>
        <div>
          <div className="section-title">Manager Portal · פורטל מנהל</div>
          <div className="section-subtitle">Manage employees, requests, documents and communications</div>
        </div>
      </div>

      {/* Summary bar */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {pendingLeaveCount > 0 && (
          <div onClick={() => setTab('leave')} style={{ cursor: 'pointer', background: 'var(--status-pending-bg)', border: '1px solid var(--status-pending)', borderRadius: '10px', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '13px', color: 'var(--status-pending)' }}>
            🗓️ <strong>{pendingLeaveCount}</strong> leave request{pendingLeaveCount > 1 ? 's' : ''} pending
          </div>
        )}
        {pendingRefundCount > 0 && (
          <div onClick={() => setTab('refunds')} style={{ cursor: 'pointer', background: 'var(--status-pending-bg)', border: '1px solid var(--status-pending)', borderRadius: '10px', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '13px', color: 'var(--status-pending)' }}>
            💳 <strong>{pendingRefundCount}</strong> refund{pendingRefundCount > 1 ? 's' : ''} pending
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
        {TABS.map(t => {
          const badge = t.id === 'leave' ? pendingLeaveCount : t.id === 'refunds' ? pendingRefundCount : 0
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '0.6rem 1.1rem', borderRadius: '10px 10px 0 0', border: '1px solid',
              borderBottom: tab === t.id ? '1px solid var(--bg-card)' : '1px solid var(--border)',
              borderColor: tab === t.id ? 'var(--border-accent)' : 'var(--border)',
              background: tab === t.id ? 'var(--bg-card)' : 'transparent',
              color: tab === t.id ? 'var(--accent-light)' : 'var(--text-secondary)',
              cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontSize: '13px', fontWeight: tab === t.id ? '600' : '400',
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              transition: 'all 0.15s', marginBottom: '-1px',
            }}>
              {t.icon} {t.label}
              {badge > 0 && (
                <span style={{ background: '#e06060', color: '#fff', borderRadius: '10px', fontSize: '10px', fontWeight: '700', padding: '1px 6px', lineHeight: 1.4 }}>
                  {badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* LEAVE REQUESTS TAB */}
      {tab === 'leave' && (
        <div>
          {approvedSummary.length > 0 && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '1rem' }}>APPROVED DAYS SUMMARY</div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {approvedSummary.map(({ profile: p, days }) => (
                  <div key={p.id} style={{ background: 'var(--bg-input)', borderRadius: '10px', padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div className="avatar" style={{ width: '28px', height: '28px', fontSize: '10px' }}>
                      {p.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: '600' }}>{p.full_name}</span>
                    <span style={{ background: 'var(--accent-muted)', color: 'var(--accent-light)', borderRadius: '6px', padding: '2px 8px', fontSize: '12px', fontWeight: '700' }}>{days}d</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(['all','pending','approved','rejected'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding: '0.4rem 1rem', borderRadius: '8px', border: '1px solid',
                  borderColor: filter === f ? 'var(--accent)' : 'var(--border)',
                  background: filter === f ? 'var(--accent-muted)' : 'transparent',
                  color: filter === f ? 'var(--accent-light)' : 'var(--text-secondary)',
                  cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '13px', fontWeight: '500',
                  textTransform: 'capitalize',
                }}>{f}</button>
              ))}
            </div>
            <button onClick={() => setLeaveArchived(a => !a)} style={{
              padding: '0.4rem 0.9rem', borderRadius: '8px', border: '1px solid var(--border)',
              background: leaveArchived ? 'var(--accent-muted)' : 'transparent',
              color: leaveArchived ? 'var(--accent-light)' : 'var(--text-muted)',
              cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '12px',
            }}>🗂 {leaveArchived ? 'Viewing archived' : 'Show archived'}</button>
          </div>

          {requests.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)' }}>No {filter} requests</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {requests.map(r => {
                const days = differenceInCalendarDays(new Date(r.end_date), new Date(r.start_date)) + 1
                const isExpanded = expanded === r.id
                return (
                  <div key={r.id} className="card" style={{ padding: isExpanded ? '1.5rem' : '1rem 1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div className="avatar">
                          {(r as any).profiles?.full_name?.split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase() || '?'}
                        </div>
                        <div>
                          <div style={{ fontWeight: '600', fontSize: '15px' }}>{(r as any).profiles?.full_name || r.user_id}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{(r as any).profiles?.email}</div>
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {r.leave_type} · {format(new Date(r.start_date), 'dd/MM/yy')} — {format(new Date(r.end_date), 'dd/MM/yy')} · <strong>{days} days</strong>
                          </div>
                          {r.reason && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>"{r.reason}"</div>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span className={`badge badge-${r.status}`}>{r.status}</span>
                        {!leaveArchived && r.status !== 'pending' && (
                          <button onClick={() => archiveLeave(r.id, true)} title="Archive" className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '11px', opacity: 0.6 }}>🗂</button>
                        )}
                        {leaveArchived && (
                          <button onClick={() => archiveLeave(r.id, false)} title="Restore" className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '11px' }}>↩</button>
                        )}
                        {r.status === 'pending' && (
                          <button onClick={() => { setExpanded(isExpanded ? null : r.id); setManagerNote('') }} className="btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '13px' }}>
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            {isExpanded ? 'Close' : 'Handle'}
                          </button>
                        )}
                      </div>
                    </div>
                    {isExpanded && (
                      <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)' }}>
                        <label>Note to employee (optional)</label>
                        <textarea className="input" rows={2} placeholder="Add a note..." value={managerNote} onChange={e => setManagerNote(e.target.value)} style={{ resize: 'vertical', marginBottom: '1rem' }} />
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                          <button className="btn-primary" disabled={processingId === r.id} onClick={() => handleLeave(r.id, 'approved')} style={{ background: 'var(--status-approved)', color: '#fff' }}>
                            <CheckCircle size={16} /> Approve
                          </button>
                          <button className="btn-danger" disabled={processingId === r.id} onClick={() => handleLeave(r.id, 'rejected')}>
                            <XCircle size={16} /> Reject
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* EMPLOYEE DOCUMENTS TAB */}
      {tab === 'docs' && (
        <div>
          {!selectedEmployee ? (
            <div>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Select an employee to manage their documents:</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
                {allProfiles.filter(p => p.id !== user!.id).map(p => (
                  <div key={p.id} className="card card-hover" onClick={() => selectEmployee(p)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div className="avatar">{p.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase() || '?'}</div>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '14px' }}>{p.full_name || 'Unknown'}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{p.email}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <button className="btn-secondary" onClick={() => setSelectedEmployee(null)} style={{ padding: '0.4rem 0.75rem' }}>
                  <ArrowLeft size={14} /> Back
                </button>
                <div className="avatar">{selectedEmployee.full_name?.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}</div>
                <div>
                  <div style={{ fontWeight: '600' }}>{selectedEmployee.full_name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{selectedEmployee.email}</div>
                </div>
              </div>

              <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-input)', border: '1px solid var(--border-accent)' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  💳 <span>Payslips and tax forms are managed in the dedicated <button onClick={() => router.push('/admin/payslips')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-light)', fontWeight: '600', padding: 0, textDecoration: 'underline', fontFamily: 'inherit', fontSize: 'inherit' }}>Payslips section</button>.</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SEND EMAIL TAB */}
      {tab === 'email' && (
        <div className="card" style={{ maxWidth: '600px' }}>
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: '16px', fontWeight: '700', marginBottom: '1.5rem' }}>Send Email to Employees</div>
          <form onSubmit={sendEmail} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label>Recipient</label>
              <select className="input" value={emailRecipient} onChange={e => setEmailRecipient(e.target.value)}>
                <option value="all">All Employees</option>
                {allProfiles.filter(p => p.id !== user!.id).map(p => (
                  <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Subject</label>
              <input className="input" placeholder="Email subject" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} required />
            </div>
            <div>
              <label>Message</label>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Use {'{name}'} as placeholder for recipient's name</div>
              <textarea className="input" rows={6} placeholder="Your message..." value={emailBody} onChange={e => setEmailBody(e.target.value)} style={{ resize: 'vertical' }} required />
            </div>
            <button type="submit" className="btn-primary" disabled={sendingEmail} style={{ width: 'fit-content' }}>
              <Mail size={16} /> {sendingEmail ? 'Sending...' : 'Send Email'}
            </button>
          </form>
        </div>
      )}

      {/* USER MANAGEMENT TAB */}
      {tab === 'users' && (
        <div>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            {allProfiles.length} team member{allProfiles.length !== 1 ? 's' : ''} · Click any card to view full profile
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem' }}>
            {allProfiles.map(p => (
              <div
                key={p.id}
                className="card card-hover"
                onClick={() => router.push(`/admin/employee/${p.id}`)}
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0',
                  padding: '1.25rem',
                  minHeight: '120px',
                }}>
                {/* Top row: avatar + name/email */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
                  <div className="avatar" style={{ flexShrink: 0, width: '44px', height: '44px', fontSize: '16px', borderRadius: '14px' }}>
                    {p.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || '?'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '600', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.full_name || 'Unknown'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
                      {p.email}
                    </div>
                  </div>
                </div>
                {/* Bottom row: badge + action */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.875rem' }}>
                  <span className={`badge ${p.role === 'manager' ? 'badge-approved' : 'badge-pending'}`}>
                    {p.role === 'manager' ? '⭐ Manager' : '👤 Employee'}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--accent-light)', fontWeight: '500' }}>
                    View Profile →
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* REFUNDS TAB */}
      {tab === 'refunds' && (
        <div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {['all','pending','approved','refunded','denied'].map(f => (
                <button key={f} onClick={() => setRefundFilter(f)}
                  className={refundFilter === f ? 'btn-primary' : 'btn-secondary'}
                  style={{ padding: '0.4rem 0.9rem', fontSize: '13px', textTransform: 'capitalize' }}>
                  {f}
                </button>
              ))}
            </div>
            <button onClick={() => setRefundArchived(a => !a)} style={{
              padding: '0.4rem 0.9rem', borderRadius: '8px', border: '1px solid var(--border)',
              background: refundArchived ? 'var(--accent-muted)' : 'transparent',
              color: refundArchived ? 'var(--accent-light)' : 'var(--text-muted)',
              cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '12px',
            }}>🗂 {refundArchived ? 'Viewing archived' : 'Show archived'}</button>
          </div>
          {refunds.filter(r => refundFilter === 'all' || r.status === refundFilter).length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              No refund requests{refundFilter !== 'all' ? ` with status "${refundFilter}"` : ''}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {refunds.filter(r => (refundFilter === 'all' || r.status === refundFilter) && (r.archived || false) === refundArchived).map(r => {
                const statusColors: Record<string,string> = { pending: 'badge-pending', approved: 'badge-approved', refunded: 'badge-approved', denied: 'badge-rejected' }
                const nextStatuses: Record<string, string[]> = { pending: ['approved','denied'], approved: ['refunded','denied'], denied: ['approved'], refunded: [] }
                return (
                  <div key={r.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <div style={{ fontWeight: '600', fontSize: '15px' }}>{(r.profiles as any)?.full_name || 'Unknown'}</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{r.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{r.category} · {new Date(r.created_at).toLocaleDateString()}</div>
                    </div>
                    <div style={{ fontWeight: '700', fontSize: '18px', color: 'var(--accent-light)' }}>{r.amount} {r.currency}</div>
                    {r.receipt_url && <DocViewButton url={r.receipt_url} name={`Receipt — ${r.title}`} style={{ fontSize: '12px', padding: '4px 10px' }}>📎 Receipt</DocViewButton>}
                    <span className={`badge ${statusColors[r.status] || 'badge-pending'}`} style={{ textTransform: 'capitalize' }}>{r.status}</span>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      {!refundArchived && r.status !== 'pending' && (
                        <button onClick={() => archiveRefundItem(r.id, true)} title="Archive" className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '11px', opacity: 0.6 }}>🗂</button>
                      )}
                      {refundArchived && (
                        <button onClick={() => archiveRefundItem(r.id, false)} title="Restore" className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '11px' }}>↩</button>
                      )}
                      {(nextStatuses[r.status] || []).map(next => (
                        <button key={next} onClick={() => updateRefundStatus(r.id, next)}
                          className={next === 'denied' ? 'btn-danger' : 'btn-primary'}
                          style={{ padding: '0.35rem 0.9rem', fontSize: '12px', textTransform: 'capitalize' }}>
                          → {next}
                        </button>
                      ))}
                    </div>
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
