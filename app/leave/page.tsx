'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase, LeaveRequest } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import toast from 'react-hot-toast'
import { Upload, X as XIcon, Paperclip, Plus, Calendar, Clock, Archive, RotateCcw } from 'lucide-react'
import Modal from '@/components/Modal'
import { format, differenceInCalendarDays } from 'date-fns'

const LEAVE_TYPES = ['חופשה', 'מחלה', 'מילואים']
const LEAVE_LABELS: Record<string, string> = { 'חופשה': 'Vacation', 'מחלה': 'Sick Day', 'מילואים': 'Military Reserve' }
const LEAVE_COLORS: Record<string, string> = { 'חופשה': '#4caf80', 'מחלה': '#e4a94a', 'מילואים': '#6b9fff' }

export default function LeavePage() {
  const { user } = useAuth()
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [showModal, setShowModal] = useState(false)
  const [leaveType, setLeaveType] = useState('חופשה')
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [archivingId, setArchivingId] = useState<string | null>(null)

  const loadRequests = useCallback(async () => {
    if (!user) return
    setFetching(true)
    const { data, error } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('user_id', user.id)
      .eq('archived', showArchived)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('[leave] fetch error:', error)
      toast.error('Failed to load requests')
    } else {
      setRequests(data || [])
    }
    setFetching(false)
  }, [user, showArchived])

  useEffect(() => { loadRequests() }, [loadRequests])

  async function uploadAttachment(file: File, leaveId: string): Promise<string> {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `leave-attachments/${leaveId}/${safeName}`
    const { error } = await supabase.storage.from('documents').upload(path, file, { upsert: false })
    if (error) throw error
    return path
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { data: inserted, error } = await supabase.from('leave_requests').insert({
      user_id: user!.id, leave_type: leaveType,
      start_date: startDate, end_date: endDate,
      reason, status: 'pending', archived: false,
    }).select().single()
    if (error) { toast.error(error.message); setLoading(false); return }

    // Upload attachment if provided
    if (attachmentFile && inserted) {
      try {
        const path = await uploadAttachment(attachmentFile, inserted.id)
        await supabase.from('leave_requests').update({ attachment_path: path }).eq('id', inserted.id)
      } catch (err) { console.error('Attachment upload failed:', err) }
    }

    const { data: prof } = await supabase.from('profiles').select('full_name, email').eq('id', user!.id).single()
    window.fetch('/api/notify-leave-request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leaveRequestId: inserted.id,
        employeeName: (prof as any)?.full_name || user!.email,
        employeeEmail: (prof as any)?.email || user!.email,
        leaveType, startDate, endDate, reason,
      }),
    }).catch(() => {})

    toast.success('Request submitted!')
    setShowModal(false)
    setStartDate(''); setEndDate(''); setReason(''); setLeaveType('חופשה'); setAttachmentFile(null)
    await loadRequests()
    setLoading(false)
  }

  async function archiveRequest(id: string) {
    setArchivingId(id)
    // Optimistic: remove from list immediately
    setRequests(prev => prev.filter(r => r.id !== id))

    const { data, error } = await supabase
      .from('leave_requests')
      .update({ archived: true })
      .eq('id', id)
      .eq('user_id', user!.id)
      .select('id')

    if (error) {
      console.error('[leave] archive error:', error)
      toast.error('Archive failed: ' + error.message)
      await loadRequests() // revert optimistic
    } else if (!data || data.length === 0) {
      console.error('[leave] archive: 0 rows updated — possible RLS issue')
      toast.error('Archive failed — permission denied')
      await loadRequests()
    } else {
      toast.success('Archived')
    }
    setArchivingId(null)
  }

  async function unarchiveRequest(id: string) {
    setArchivingId(id)
    setRequests(prev => prev.filter(r => r.id !== id))

    const { data, error } = await supabase
      .from('leave_requests')
      .update({ archived: false })
      .eq('id', id)
      .eq('user_id', user!.id)
      .select('id')

    if (error) {
      toast.error('Restore failed: ' + error.message)
      await loadRequests()
    } else if (!data || data.length === 0) {
      toast.error('Restore failed — permission denied')
      await loadRequests()
    } else {
      toast.success('Restored')
    }
    setArchivingId(null)
  }

  const days = (r: LeaveRequest) => differenceInCalendarDays(new Date(r.end_date), new Date(r.start_date)) + 1

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <div className="section-title">Leave Requests</div>
          <div className="section-subtitle">Submit and track your vacation, sick days, and other leave</div>
        </div>
        {!showArchived && (
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> New Request
          </button>
        )}
      </div>

      {/* Active / Archived toggle — always above the list */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <button
          onClick={() => setShowArchived(false)}
          className={!showArchived ? 'btn-primary' : 'btn-secondary'}
          style={{ padding: '0.4rem 1rem', fontSize: '13px' }}>
          Active
        </button>
        <button
          onClick={() => setShowArchived(true)}
          className={showArchived ? 'btn-primary' : 'btn-secondary'}
          style={{ padding: '0.4rem 1rem', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Archive size={13} /> Archived
        </button>
      </div>

      {/* List */}
      {fetching ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading...</div>
      ) : requests.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <Calendar size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
          <div style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            {showArchived ? 'No archived requests' : 'No active leave requests'}
          </div>
          {!showArchived && (
            <button className="btn-primary" onClick={() => setShowModal(true)}>
              <Plus size={16} /> Submit First Request
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {requests.map(r => (
            <div key={r.id} className="card card-hover" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: '1rem',
              opacity: archivingId === r.id ? 0.5 : 1, transition: 'opacity 0.2s',
            }}>
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
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
                <span className={`badge badge-${r.status}`}>
                  {r.status === 'pending' ? '⏳' : r.status === 'approved' ? '✓' : '✗'} {r.status}
                </span>
                {!showArchived && (r.status === 'approved' || r.status === 'rejected') && (
                  <button
                    onClick={() => archiveRequest(r.id)}
                    disabled={archivingId === r.id}
                    className="btn-secondary"
                    style={{ padding: '0.3rem 0.7rem', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                    title="Archive this request">
                    <Archive size={12} /> Archive
                  </button>
                )}
                {showArchived && (
                  <button
                    onClick={() => unarchiveRequest(r.id)}
                    disabled={archivingId === r.id}
                    className="btn-secondary"
                    style={{ padding: '0.3rem 0.7rem', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                    title="Restore to active">
                    <RotateCcw size={12} /> Restore
                  </button>
                )}
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  <Clock size={10} style={{ display: 'inline', marginRight: '3px' }} />
                  {format(new Date(r.created_at), 'dd/MM/yy')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Request Modal — renders via portal, never clipped by layout */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="New Leave Request">
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
              <div>
                <label>Attachment (optional)</label>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  background: 'var(--bg-input)', border: `1px dashed ${attachmentFile ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: '12px', padding: '0.9rem 1rem', cursor: 'pointer',
                  color: attachmentFile ? 'var(--accent-light)' : 'var(--text-muted)',
                }}>
                  <Paperclip size={16} />
                  <span style={{ fontSize: '14px' }}>{attachmentFile ? attachmentFile.name : 'Attach sick note, certificate...'}</span>
                  {attachmentFile && (
                    <button type="button" onClick={e => { e.preventDefault(); setAttachmentFile(null) }}
                      style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                      <XIcon size={14} />
                    </button>
                  )}
                  <input type="file" style={{ display: 'none' }} accept="image/*,.pdf,.doc,.docx"
                    onChange={e => setAttachmentFile(e.target.files?.[0] || null)} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Submitting...' : 'Submit Request'}</button>
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              </div>
            </form>
      </Modal>
    </div>
  )
}
