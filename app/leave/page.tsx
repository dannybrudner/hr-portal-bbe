'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase, LeaveRequest } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import toast from 'react-hot-toast'
import { Plus, X, Calendar, Clock } from 'lucide-react'
import { format, differenceInCalendarDays } from 'date-fns'

const LEAVE_TYPES = ['חופשה', 'מחלה', 'מילואים']
const LEAVE_LABELS: Record<string, string> = { 'חופשה': 'Vacation', 'מחלה': 'Sick Day', 'מילואים': 'Military Reserve' }
const LEAVE_COLORS: Record<string, string> = { 'חופשה': '#4caf80', 'מחלה': '#e4a94a', 'מילואים': '#6b9fff' }

export default function LeavePage() {
  const { user } = useAuth()
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [showModal, setShowModal] = useState(false)
  const [leaveType, setLeaveType] = useState('חופשה')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
    setRequests(data || [])
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.from('leave_requests').insert({
      user_id: user!.id, leave_type: leaveType,
      start_date: startDate, end_date: endDate,
      reason, status: 'pending',
    })
    if (error) { toast.error(error.message); setLoading(false); return }
    toast.success('Request submitted!')
    setShowModal(false)
    setStartDate(''); setEndDate(''); setReason(''); setLeaveType('חופשה')
    fetch()
    setLoading(false)
  }

  const days = (r: LeaveRequest) => differenceInCalendarDays(new Date(r.end_date), new Date(r.start_date)) + 1

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <div className="section-title">Leave Requests</div>
          <div className="section-subtitle">Submit and track your vacation, sick days, and other leave</div>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> New Request
        </button>
      </div>

      {requests.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <Calendar size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
          <div style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>No leave requests yet</div>
          <button className="btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Submit First Request</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {requests.map(r => (
            <div key={r.id} className="card card-hover" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '14px',
                  background: `${LEAVE_COLORS[r.leave_type]}22`,
                  border: `1px solid ${LEAVE_COLORS[r.leave_type]}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: LEAVE_COLORS[r.leave_type], fontSize: '11px', fontWeight: '700', textAlign: 'center', lineHeight: 1.2,
                }}>{r.leave_type}</div>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '15px' }}>{LEAVE_LABELS[r.leave_type]}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Calendar size={12} />
                    {format(new Date(r.start_date), 'dd/MM/yyyy')} — {format(new Date(r.end_date), 'dd/MM/yyyy')}
                    <span style={{ color: 'var(--text-muted)' }}>· {days(r)} day{days(r) > 1 ? 's' : ''}</span>
                  </div>
                  {r.reason && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{r.reason}</div>}
                  {r.manager_note && (
                    <div style={{ fontSize: '12px', color: 'var(--accent-light)', marginTop: '4px', padding: '4px 8px', background: 'var(--accent-muted)', borderRadius: '6px' }}>
                      Manager note: {r.manager_note}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                <span className={`badge badge-${r.status}`}>
                  {r.status === 'pending' ? '⏳' : r.status === 'approved' ? '✓' : '✗'} {r.status}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  <Clock size={10} style={{ display: 'inline', marginRight: '3px' }} />
                  {format(new Date(r.created_at), 'dd/MM/yy')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '20px', fontWeight: '700' }}>New Leave Request</h2>
              <button onClick={() => setShowModal(false)} className="btn-secondary" style={{ padding: '0.4rem' }}><X size={16} /></button>
            </div>
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label>Leave Type</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {LEAVE_TYPES.map(t => (
                    <button key={t} type="button" onClick={() => setLeaveType(t)} style={{
                      padding: '0.6rem 1.2rem', borderRadius: '10px', border: '1px solid',
                      borderColor: leaveType === t ? LEAVE_COLORS[t] : 'var(--border)',
                      background: leaveType === t ? `${LEAVE_COLORS[t]}22` : 'transparent',
                      color: leaveType === t ? LEAVE_COLORS[t] : 'var(--text-secondary)',
                      cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif',
                      fontSize: '14px', fontWeight: '600', transition: 'all 0.2s',
                    }}>{t} <span style={{ opacity: 0.7, fontSize: '12px' }}>({LEAVE_LABELS[t]})</span></button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label>Start Date</label>
                  <input className="input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
                </div>
                <div>
                  <label>End Date</label>
                  <input className="input" type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} required />
                </div>
              </div>
              <div>
                <label>Reason (optional)</label>
                <textarea className="input" rows={3} placeholder="Brief reason for your leave..." value={reason} onChange={e => setReason(e.target.value)} style={{ resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Submitting...' : 'Submit Request'}</button>
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
