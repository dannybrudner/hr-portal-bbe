'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase, Profile, Payslip } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Upload, Search, Send, ChevronDown, ChevronUp, Mail, Settings, Save, X, AlertCircle, CheckCircle } from 'lucide-react'
import { format } from 'date-fns'
import Modal from '@/components/Modal'
import DropZone, { DropZoneFile } from '@/components/DropZone'
import { DocViewButton } from '@/components/DocViewer'
import { registerDocument } from '@/lib/documentService'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTHS_HE: Record<number, string> = {
  1:'ינואר',2:'פברואר',3:'מרץ',4:'אפריל',5:'מאי',6:'יוני',
  7:'יולי',8:'אוגוסט',9:'ספטמבר',10:'אוקטובר',11:'נובמבר',12:'דצמבר',
}

type PayslipRow = Payslip & { profiles?: { full_name: string; email: string } }

type EmailTemplate = { subject: string; body_html: string }

const DEFAULT_TEMPLATE: EmailTemplate = {
  subject: 'תלוש שכר לחודש {{monthName}} {{year}}',
  body_html: `שלום {{employeeName}},

מצ"ב תלוש שכר לחודש {{monthName}} {{year}}.

בברכה,
בוכמן - ברודנר תכנון ויעוץ הנדסי בע"מ`,
}

export default function ManagerPayslipsPage() {
  const { user, profile } = useAuth()
  const router = useRouter()

  const [allPayslips, setAllPayslips] = useState<PayslipRow[]>([])
  const [employees, setEmployees] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  // Upload modal
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [targetEmployee, setTargetEmployee] = useState<Profile | null>(null)
  const [uploadMonth, setUploadMonth] = useState(new Date().getMonth() + 1)
  const [uploadYear, setUploadYear] = useState(new Date().getFullYear())
  const [sendEmail, setSendEmail] = useState(true)
  const [emailStatus, setEmailStatus] = useState<'idle'|'sending'|'ok'|'error'>('idle')
  const [emailError, setEmailError] = useState('')

  // Email template modal
  const [showTemplate, setShowTemplate] = useState(false)
  const [template, setTemplate] = useState<EmailTemplate>(DEFAULT_TEMPLATE)
  const [editTemplate, setEditTemplate] = useState<EmailTemplate>(DEFAULT_TEMPLATE)
  const [savingTemplate, setSavingTemplate] = useState(false)

  // Resend
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [resendStatus, setResendStatus] = useState<Record<string, 'ok'|'error'>>({})

  // Filters
  const [search, setSearch] = useState('')
  const [filterEmp, setFilterEmp] = useState('all')
  const [filterYear, setFilterYear] = useState('all')
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    if (profile.role !== 'manager') { router.push('/dashboard'); return }
    loadData()
    loadTemplate()
  }, [profile])

  const loadData = useCallback(async () => {
    setLoading(true)
    const [{ data: ps }, { data: emps }] = await Promise.all([
      supabase.from('payslips').select('*, profiles(full_name, email)')
        .order('year', { ascending: false }).order('month', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email, role').order('full_name'),
    ])
    setAllPayslips(ps || [])
    setEmployees(((emps || []).filter(e => e.id !== user?.id)) as Profile[])
    setLoading(false)
  }, [user])

  async function loadTemplate() {
    const { data } = await supabase.from('email_templates')
      .select('subject, body_html').eq('id', 'payslip_notification').single()
    if (data) { setTemplate(data); setEditTemplate(data) }
  }

  async function saveTemplate() {
    setSavingTemplate(true)
    const { error } = await supabase.from('email_templates').upsert({
      id: 'payslip_notification',
      subject: editTemplate.subject,
      body_html: editTemplate.body_html,
      updated_by: user!.id,
      updated_at: new Date().toISOString(),
    })
    setSavingTemplate(false)
    if (error) { toast.error('Failed to save template'); return }
    setTemplate(editTemplate)
    setShowTemplate(false)
    toast.success('Email template saved!')
  }

  /** Render {{vars}} in template for preview */
  function renderPreview(text: string, emp?: Profile | null) {
    return text
      .replace(/\{\{employeeName\}\}/g, emp?.full_name || 'Employee Name')
      .replace(/\{\{monthName\}\}/g, MONTHS_HE[uploadMonth] || 'חודש')
      .replace(/\{\{year\}\}/g, String(uploadYear))
  }

  async function callNotifyAPI(to: string, empName: string, month: number, year: number): Promise<{ ok: boolean; error?: string }> {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token
    if (!token) return { ok: false, error: 'No auth token' }

    const res = await fetch('/api/notify-payslip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, employeeName: empName, month, year }),
    })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}` }
    return { ok: true }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!uploadFile || !targetEmployee) return
    setUploading(true)
    setEmailStatus('idle')
    setEmailError('')
    try {
      const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `payslips/${targetEmployee.id}/${uploadYear}_${String(uploadMonth).padStart(2,'0')}_${Date.now()}_${safeName}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, uploadFile, { upsert: false })
      if (upErr) { toast.error('Upload failed: ' + upErr.message); return }

      const { error: dbErr } = await supabase.from('payslips').insert({
        user_id: targetEmployee.id, file_url: path, file_name: uploadFile.name,
        month: uploadMonth, year: uploadYear, uploaded_by: user!.id,
      })
      if (dbErr) { toast.error('DB error: ' + dbErr.message); return }

      await registerDocument({
        employeeId: targetEmployee.id, uploadedBy: user!.id, documentType: 'payslip',
        fileName: uploadFile.name, storagePath: path,
        tags: [`${MONTHS[uploadMonth - 1]} ${uploadYear}`, 'payslip'],
      })

      if (sendEmail) {
        setEmailStatus('sending')
        const result = await callNotifyAPI(targetEmployee.email, targetEmployee.full_name, uploadMonth, uploadYear)
        if (result.ok) {
          setEmailStatus('ok')
          toast.success('Payslip uploaded & email sent!')
        } else {
          setEmailStatus('error')
          setEmailError(result.error || 'Unknown error')
          toast.error(`Payslip uploaded but email failed: ${result.error}`)
        }
      } else {
        toast.success('Payslip uploaded!')
      }

      setShowUpload(false)
      setUploadFile(null)
      setTargetEmployee(null)
      setEmailStatus('idle')
      await loadData()
    } finally {
      setUploading(false)
    }
  }

  async function handleResend(ps: PayslipRow) {
    const empEmail = (ps.profiles as any)?.email
    const empName = (ps.profiles as any)?.full_name
    if (!empEmail) { toast.error('No email on record for this employee'); return }
    setResendingId(ps.id)
    const result = await callNotifyAPI(empEmail, empName, ps.month, ps.year)
    setResendingId(null)
    if (result.ok) {
      setResendStatus(s => ({ ...s, [ps.id]: 'ok' }))
      toast.success('Email resent!')
      setTimeout(() => setResendStatus(s => { const n = {...s}; delete n[ps.id]; return n }), 3000)
    } else {
      setResendStatus(s => ({ ...s, [ps.id]: 'error' }))
      toast.error(`Resend failed: ${result.error}`)
    }
  }

  // Group payslips by employee
  const byEmployee: Record<string, PayslipRow[]> = {}
  allPayslips.forEach(p => {
    if (!byEmployee[p.user_id]) byEmployee[p.user_id] = []
    byEmployee[p.user_id].push(p)
  })
  const years = [...new Set(allPayslips.map(p => p.year))].sort((a, b) => b - a)

  const filteredEmps = employees.filter(e => {
    if (filterEmp !== 'all' && e.id !== filterEmp) return false
    const q = search.toLowerCase()
    if (q && !e.full_name?.toLowerCase().includes(q) && !e.email?.toLowerCase().includes(q)) return false
    return true
  })

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <div className="section-title">Payslip Management · תלושי שכר</div>
          <div className="section-subtitle">Upload, manage, and deliver employee payslips securely</div>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button className="btn-secondary" onClick={() => { setEditTemplate({...template}); setShowTemplate(true) }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '13px' }}>
            <Settings size={15} /> Email Template
          </button>
          <button className="btn-primary" onClick={() => setShowUpload(true)}>
            <Upload size={16} /> Upload Payslip
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input className="input" placeholder="Search employee..." value={search}
            onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '34px' }} />
        </div>
        <select className="input" style={{ width: 'auto' }} value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
          <option value="all">All employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.full_name || e.email}</option>)}
        </select>
        <select className="input" style={{ width: 'auto' }} value={filterYear} onChange={e => setFilterYear(e.target.value)}>
          <option value="all">All years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Employee rows */}
      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Loading...</div>
      ) : filteredEmps.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          {search ? `No employees matching "${search}"` : 'No employees found'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filteredEmps.map(emp => {
            const empPayslips = (byEmployee[emp.id] || [])
              .filter(p => filterYear === 'all' || p.year === +filterYear)
              .sort((a, b) => b.year - a.year || b.month - a.month)
            const isOpen = expandedEmp === emp.id
            const initials = emp.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || '?'

            return (
              <div key={emp.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Row header */}
                <div onClick={() => setExpandedEmp(isOpen ? null : emp.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem', cursor: 'pointer' }}>
                  <div className="avatar" style={{ width: '40px', height: '40px', fontSize: '15px', borderRadius: '12px', flexShrink: 0 }}>{initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '600', fontSize: '15px' }}>{emp.full_name || 'Unknown'}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.email}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--accent-light)', background: 'var(--accent-muted)', padding: '3px 10px', borderRadius: '20px', border: '1px solid var(--border-accent)' }}>
                      {empPayslips.length} payslip{empPayslips.length !== 1 ? 's' : ''}
                    </span>
                    <button onClick={e => { e.stopPropagation(); setTargetEmployee(emp); setShowUpload(true) }}
                      className="btn-primary" style={{ padding: '0.35rem 0.85rem', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Upload size={13} /> Upload
                    </button>
                    {isOpen ? <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} />
                            : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
                  </div>
                </div>

                {/* Payslip table */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                    {empPayslips.length === 0 ? (
                      <div style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                        No payslips uploaded yet
                      </div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-input)' }}>
                            {['Month','Year','File','Uploaded','Actions'].map(h => (
                              <th key={h} style={{ padding: '0.6rem 1.25rem', textAlign: 'left', fontWeight: '600', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {empPayslips.map((ps, i) => (
                            <tr key={ps.id} style={{ borderTop: '1px solid var(--border)', background: i % 2 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                              <td style={{ padding: '0.75rem 1.25rem', fontWeight: '600' }}>
                                {MONTHS[ps.month - 1]}
                                <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--accent-light)' }}>{MONTHS_HE[ps.month]}</span>
                              </td>
                              <td style={{ padding: '0.75rem 1.25rem', color: 'var(--text-secondary)' }}>{ps.year}</td>
                              <td style={{ padding: '0.75rem 1.25rem', color: 'var(--text-muted)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {ps.file_name || 'payslip.pdf'}
                              </td>
                              <td style={{ padding: '0.75rem 1.25rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                {ps.created_at ? format(new Date(ps.created_at), 'dd/MM/yy HH:mm') : '—'}
                              </td>
                              <td style={{ padding: '0.75rem 1.25rem' }}>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                  <DocViewButton
                                    {...(ps.file_url?.startsWith('http') ? { url: ps.file_url } : { storagePath: ps.file_url })}
                                    name={`${emp.full_name} — ${MONTHS[ps.month-1]} ${ps.year}`}
                                    style={{ padding: '0.3rem 0.7rem', fontSize: '12px' }}>
                                    View
                                  </DocViewButton>
                                  <button onClick={() => handleResend(ps)} disabled={resendingId === ps.id}
                                    className="btn-secondary"
                                    style={{ padding: '0.3rem 0.7rem', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '0.3rem',
                                      color: resendStatus[ps.id] === 'ok' ? '#4caf80' : resendStatus[ps.id] === 'error' ? 'var(--status-rejected)' : undefined }}>
                                    {resendStatus[ps.id] === 'ok' ? <CheckCircle size={12} /> : resendStatus[ps.id] === 'error' ? <AlertCircle size={12} /> : <Send size={12} />}
                                    {resendingId === ps.id ? '...' : resendStatus[ps.id] === 'ok' ? 'Sent!' : 'Resend'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Upload Modal ─────────────────────────────────────────────────── */}
      <Modal open={showUpload} onClose={() => { setShowUpload(false); setUploadFile(null); setTargetEmployee(null); setEmailStatus('idle') }}
        title="Upload Payslip" maxWidth={520}>
        <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label>Employee <span style={{ color: 'var(--status-rejected)' }}>*</span></label>
            <select className="input" value={targetEmployee?.id || ''} required
              onChange={e => setTargetEmployee(employees.find(emp => emp.id === e.target.value) || null)}>
              <option value="">— Select employee —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name || e.email}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
            <div>
              <label>Month <span style={{ color: 'var(--status-rejected)' }}>*</span></label>
              <select className="input" value={uploadMonth} onChange={e => setUploadMonth(+e.target.value)}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m} — {MONTHS_HE[i + 1]}</option>)}
              </select>
            </div>
            <div>
              <label>Year</label>
              <input className="input" type="number" value={uploadYear} onChange={e => setUploadYear(+e.target.value)} min={2020} max={2100} />
            </div>
          </div>
          <div>
            <label>Payslip PDF <span style={{ color: 'var(--status-rejected)' }}>*</span></label>
            <DropZone accept=".pdf,image/*" maxSizeMB={20} multiple={false}
              label="Drag payslip PDF here" sublabel="or click to browse"
              onFiles={(files: DropZoneFile[]) => setUploadFile(files[0]?.file || null)} />
          </div>

          {/* Email toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
            onClick={() => setSendEmail(s => !s)}>
            <div style={{ width: '42px', height: '24px', borderRadius: '12px', background: sendEmail ? 'var(--accent)' : 'var(--border)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: '3px', left: sendEmail ? '21px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: sendEmail ? '#1a1000' : 'var(--text-muted)', transition: 'left 0.2s' }} />
            </div>
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)', userSelect: 'none' }}>Send email notification</span>
            {sendEmail && <button type="button" onClick={e => { e.stopPropagation(); setEditTemplate({...template}); setShowTemplate(true) }}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--accent-light)', textDecoration: 'underline', padding: 0 }}>
              Edit template
            </button>}
          </div>

          {/* Live email preview */}
          {sendEmail && (
            <div style={{ background: 'var(--bg-input)', borderRadius: '10px', padding: '1rem', border: '1px solid var(--border)', fontSize: '13px', direction: 'rtl', textAlign: 'right', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
              <div style={{ fontWeight: '600', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', direction: 'ltr', textAlign: 'left' }}>EMAIL PREVIEW</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', direction: 'ltr', textAlign: 'left' }}>
                Subject: {renderPreview(template.subject, targetEmployee)}
              </div>
              {renderPreview(template.body_html, targetEmployee).split('\n').filter(l => l.trim()).map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}

          {/* Email status feedback */}
          {emailStatus === 'error' && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: 'var(--status-rejected)', background: 'var(--status-rejected-bg)', borderRadius: '10px', padding: '0.75rem 1rem', fontSize: '13px' }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontWeight: '600' }}>Email failed</div>
                <div style={{ opacity: 0.85 }}>{emailError}</div>
                {emailError.includes('not configured') && (
                  <div style={{ marginTop: '4px', opacity: 0.7 }}>
                    Set a real RESEND_API_KEY in Vercel → Environment Variables, then redeploy.
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="submit" className="btn-primary" disabled={uploading || !uploadFile || !targetEmployee}
              style={{ flex: 1, justifyContent: 'center' }}>
              <Upload size={16} /> {uploading ? (emailStatus === 'sending' ? 'Sending email...' : 'Uploading...') : 'Upload Payslip'}
            </button>
            <button type="button" className="btn-secondary"
              onClick={() => { setShowUpload(false); setUploadFile(null); setTargetEmployee(null); setEmailStatus('idle') }}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Email Template Editor Modal ──────────────────────────────────── */}
      <Modal open={showTemplate} onClose={() => setShowTemplate(false)} title="Edit Payroll Email Template" maxWidth={600}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ background: 'var(--bg-input)', borderRadius: '10px', padding: '0.875rem 1rem', fontSize: '12px', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            <strong style={{ color: 'var(--text-secondary)' }}>Available variables:</strong>{' '}
            <code style={{ color: 'var(--accent-light)' }}>{'{{employeeName}}'}</code>{' · '}
            <code style={{ color: 'var(--accent-light)' }}>{'{{monthName}}'}</code>{' · '}
            <code style={{ color: 'var(--accent-light)' }}>{'{{year}}'}</code>
          </div>
          <div>
            <label>Email Subject</label>
            <input className="input" value={editTemplate.subject} onChange={e => setEditTemplate(t => ({ ...t, subject: e.target.value }))} style={{ direction: 'rtl' }} />
          </div>
          <div>
            <label>Email Body</label>
            <textarea className="input" rows={8} value={editTemplate.body_html}
              onChange={e => setEditTemplate(t => ({ ...t, body_html: e.target.value }))}
              style={{ direction: 'rtl', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.7 }} />
          </div>
          {/* Preview */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>PREVIEW (sample data)</div>
            <div style={{ background: 'var(--bg-input)', borderRadius: '10px', padding: '1rem', border: '1px solid var(--border)', direction: 'rtl', textAlign: 'right', fontSize: '14px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', direction: 'ltr', textAlign: 'left', marginBottom: '8px' }}>
                Subject: {renderPreview(editTemplate.subject)}
              </div>
              {renderPreview(editTemplate.body_html).split('\n').filter(l => l.trim()).map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={saveTemplate} disabled={savingTemplate} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Save size={15} /> {savingTemplate ? 'Saving...' : 'Save Template'}
            </button>
            <button onClick={() => { setEditTemplate({...template}); setShowTemplate(false) }} className="btn-secondary">
              Cancel
            </button>
            <button onClick={() => setEditTemplate(DEFAULT_TEMPLATE)} className="btn-secondary"
              style={{ marginLeft: 'auto', fontSize: '12px', opacity: 0.7 }}>
              Reset to default
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
