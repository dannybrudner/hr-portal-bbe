'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase, Profile, Payslip } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Upload, Search, Send, Calendar, ChevronDown, ChevronUp, AlertCircle, CheckCircle } from 'lucide-react'
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

export default function ManagerPayslipsPage() {
  const { user, profile } = useAuth()
  const router = useRouter()

  // All payslips across all employees
  const [allPayslips, setAllPayslips] = useState<PayslipRow[]>([])
  const [employees, setEmployees] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  // Upload modal state
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [targetEmployee, setTargetEmployee] = useState<Profile | null>(null)
  const [uploadMonth, setUploadMonth] = useState(new Date().getMonth() + 1)
  const [uploadYear, setUploadYear] = useState(new Date().getFullYear())
  const [sendEmail, setSendEmail] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [filterEmp, setFilterEmp] = useState('all')
  const [filterYear, setFilterYear] = useState('all')
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null)

  // Resend email state
  const [resendingId, setResendingId] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    if (profile.role !== 'manager') { router.push('/dashboard'); return }
    loadData()
  }, [profile])

  const loadData = useCallback(async () => {
    setLoading(true)
    const [{ data: ps }, { data: emps }] = await Promise.all([
      supabase.from('payslips')
        .select('*, profiles(full_name, email)')
        .order('year', { ascending: false })
        .order('month', { ascending: false }),
      supabase.from('profiles')
        .select('id, full_name, email, role')
        .neq('role', 'deleted')
        .order('full_name'),
    ])
    setAllPayslips(ps || [])
    setEmployees((emps || []).filter(e => e.id !== user?.id) as Profile[])
    setLoading(false)
  }, [user])

  // Group payslips by employee
  const byEmployee: Record<string, PayslipRow[]> = {}
  allPayslips.forEach(p => {
    const key = p.user_id
    if (!byEmployee[key]) byEmployee[key] = []
    byEmployee[key].push(p)
  })

  // Filter
  const years = [...new Set(allPayslips.map(p => p.year))].sort((a, b) => b - a)
  const filteredEmps = employees.filter(e => {
    if (filterEmp !== 'all' && e.id !== filterEmp) return false
    const name = e.full_name?.toLowerCase() || ''
    const email = e.email?.toLowerCase() || ''
    if (search && !name.includes(search.toLowerCase()) && !email.includes(search.toLowerCase())) return false
    return true
  })

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!uploadFile || !targetEmployee) return
    setUploading(true)
    try {
      const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `payslips/${targetEmployee.id}/${uploadYear}_${String(uploadMonth).padStart(2,'0')}_${Date.now()}_${safeName}`

      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(path, uploadFile, { upsert: false })
      if (upErr) { toast.error('Upload failed: ' + upErr.message); return }

      const { error: dbErr } = await supabase.from('payslips').insert({
        user_id: targetEmployee.id,
        file_url: path,
        file_name: uploadFile.name,
        month: uploadMonth,
        year: uploadYear,
        uploaded_by: user!.id,
      })
      if (dbErr) { toast.error('DB error: ' + dbErr.message); return }

      await registerDocument({
        employeeId: targetEmployee.id,
        uploadedBy: user!.id,
        documentType: 'payslip',
        fileName: uploadFile.name,
        storagePath: path,
        tags: [`${MONTHS[uploadMonth - 1]} ${uploadYear}`, 'payslip'],
      })

      if (sendEmail) {
        const session = await supabase.auth.getSession()
        const res = await fetch('/api/notify-payslip', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.data.session?.access_token || ''}`,
          },
          body: JSON.stringify({
            to: targetEmployee.email,
            employeeName: targetEmployee.full_name,
            month: uploadMonth,
            year: uploadYear,
          }),
        })
        if (res.ok) toast.success('Payslip uploaded and email sent!')
        else toast.success('Payslip uploaded (email failed — check RESEND_API_KEY)')
      } else {
        toast.success('Payslip uploaded!')
      }

      setShowUpload(false)
      setUploadFile(null)
      setTargetEmployee(null)
      await loadData()
    } finally {
      setUploading(false)
    }
  }

  async function handleResend(ps: PayslipRow) {
    setResendingId(ps.id)
    try {
      const emp = employees.find(e => e.id === ps.user_id)
        || { email: (ps.profiles as any)?.email, full_name: (ps.profiles as any)?.full_name }
      const session = await supabase.auth.getSession()
      await fetch('/api/notify-payslip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.data.session?.access_token || ''}`,
        },
        body: JSON.stringify({
          to: emp.email,
          employeeName: emp.full_name,
          month: ps.month,
          year: ps.year,
        }),
      })
      toast.success('Email resent!')
    } finally {
      setResendingId(null)
    }
  }

  const totalCount = allPayslips.length
  const thisMonthCount = allPayslips.filter(p => {
    const now = new Date()
    return p.month === now.getMonth() + 1 && p.year === now.getFullYear()
  }).length

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <div className="section-title">Payslip Management · תלושי שכר</div>
          <div className="section-subtitle">Upload, manage, and deliver employee payslips</div>
        </div>
        <button className="btn-primary" onClick={() => setShowUpload(true)}>
          <Upload size={16} /> Upload Payslip
        </button>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[
          { label: 'Total Payslips', value: totalCount, color: 'var(--accent-light)' },
          { label: 'This Month', value: thisMonthCount, color: '#4caf80' },
          { label: 'Employees', value: employees.length, color: '#6b9fff' },
        ].map(s => (
          <div key={s.label} className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1.25rem' }}>
            <span style={{ fontSize: '22px', fontWeight: '700', color: s.color }}>{s.value}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
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

      {/* Employee payslip rows */}
      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Loading...</div>
      ) : filteredEmps.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          {search ? `No employees match "${search}"` : 'No employees found'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filteredEmps.map(emp => {
            const empPayslips = (byEmployee[emp.id] || [])
              .filter(p => filterYear === 'all' || p.year === +filterYear)
              .sort((a, b) => b.year - a.year || b.month - a.month)
            const isExpanded = expandedEmp === emp.id
            const initials = emp.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'

            return (
              <div key={emp.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Employee header row */}
                <div
                  onClick={() => setExpandedEmp(isExpanded ? null : emp.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem', cursor: 'pointer' }}>
                  <div className="avatar" style={{ width: '40px', height: '40px', fontSize: '15px', borderRadius: '12px', flexShrink: 0 }}>
                    {initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '600', fontSize: '15px' }}>{emp.full_name || 'Unknown'}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.email}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                    <span style={{
                      fontSize: '12px', fontWeight: '600', color: 'var(--accent-light)',
                      background: 'var(--accent-muted)', padding: '3px 10px', borderRadius: '20px',
                      border: '1px solid var(--border-accent)',
                    }}>
                      {empPayslips.length} payslip{empPayslips.length !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); setTargetEmployee(emp); setShowUpload(true) }}
                      className="btn-primary"
                      style={{ padding: '0.35rem 0.85rem', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Upload size={13} /> Upload
                    </button>
                    {isExpanded ? <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} />
                                : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
                  </div>
                </div>

                {/* Payslip list */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                    {empPayslips.length === 0 ? (
                      <div style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                        No payslips uploaded yet
                      </div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-input)' }}>
                            {['Month', 'Year', 'File', 'Uploaded', 'Actions'].map(h => (
                              <th key={h} style={{ padding: '0.6rem 1.25rem', textAlign: 'left', fontWeight: '600', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {empPayslips.map((ps, i) => (
                            <tr key={ps.id} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                              <td style={{ padding: '0.75rem 1.25rem', fontWeight: '600' }}>
                                {MONTHS[ps.month - 1]}
                                <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--accent-light)' }}>
                                  {MONTHS_HE[ps.month]}
                                </span>
                              </td>
                              <td style={{ padding: '0.75rem 1.25rem', color: 'var(--text-secondary)' }}>{ps.year}</td>
                              <td style={{ padding: '0.75rem 1.25rem', color: 'var(--text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {ps.file_name || 'payslip.pdf'}
                              </td>
                              <td style={{ padding: '0.75rem 1.25rem', color: 'var(--text-muted)' }}>
                                {ps.created_at ? format(new Date(ps.created_at), 'dd/MM/yyyy HH:mm') : '—'}
                              </td>
                              <td style={{ padding: '0.75rem 1.25rem' }}>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                  <DocViewButton
                                    {...(ps.file_url.startsWith('http') ? { url: ps.file_url } : { storagePath: ps.file_url })}
                                    name={`${emp.full_name} — Payslip ${MONTHS[ps.month - 1]} ${ps.year}`}
                                    style={{ padding: '0.3rem 0.7rem', fontSize: '12px' }}>
                                    View
                                  </DocViewButton>
                                  <button
                                    onClick={() => handleResend(ps)}
                                    disabled={resendingId === ps.id}
                                    className="btn-secondary"
                                    style={{ padding: '0.3rem 0.7rem', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                    title="Re-send payroll email">
                                    <Send size={12} /> {resendingId === ps.id ? '...' : 'Resend'}
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

      {/* Upload Modal */}
      <Modal open={showUpload} onClose={() => { setShowUpload(false); setUploadFile(null); setTargetEmployee(null) }} title="Upload Payslip" maxWidth={520}>
        <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Employee selector */}
          <div>
            <label>Employee <span style={{ color: 'var(--status-rejected)' }}>*</span></label>
            <select
              className="input"
              value={targetEmployee?.id || ''}
              onChange={e => setTargetEmployee(employees.find(emp => emp.id === e.target.value) || null)}
              required>
              <option value="">— Select employee —</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.full_name || e.email}</option>
              ))}
            </select>
          </div>

          {/* Month / Year */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
            <div>
              <label>Month <span style={{ color: 'var(--status-rejected)' }}>*</span></label>
              <select className="input" value={uploadMonth} onChange={e => setUploadMonth(+e.target.value)}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m} — {MONTHS_HE[i + 1]}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Year</label>
              <input className="input" type="number" value={uploadYear}
                onChange={e => setUploadYear(+e.target.value)} min={2020} max={2100} />
            </div>
          </div>

          {/* File drop zone */}
          <div>
            <label>Payslip PDF <span style={{ color: 'var(--status-rejected)' }}>*</span></label>
            <DropZone
              accept=".pdf,image/*"
              maxSizeMB={20}
              multiple={false}
              label="Drag payslip PDF here"
              sublabel="or click to browse · PDF, image"
              onFiles={(files: DropZoneFile[]) => setUploadFile(files[0]?.file || null)}
            />
          </div>

          {/* Email toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', userSelect: 'none' }}>
            <div
              onClick={() => setSendEmail(s => !s)}
              style={{
                width: '42px', height: '24px', borderRadius: '12px',
                background: sendEmail ? 'var(--accent)' : 'var(--border)',
                position: 'relative', transition: 'background 0.2s', flexShrink: 0, cursor: 'pointer',
              }}>
              <div style={{
                position: 'absolute', top: '3px',
                left: sendEmail ? '21px' : '3px',
                width: '18px', height: '18px', borderRadius: '50%',
                background: sendEmail ? '#1a1000' : 'var(--text-muted)',
                transition: 'left 0.2s',
              }} />
            </div>
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              Send email notification to employee
            </span>
          </label>

          {/* Preview of email that will be sent */}
          {sendEmail && targetEmployee && (
            <div style={{
              background: 'var(--bg-input)', borderRadius: '10px',
              padding: '0.875rem 1rem', border: '1px solid var(--border)',
              fontSize: '12px', color: 'var(--text-muted)',
            }}>
              <div style={{ marginBottom: '4px', color: 'var(--text-secondary)', fontWeight: '600' }}>Email preview:</div>
              <div style={{ direction: 'rtl', textAlign: 'right', lineHeight: 1.6 }}>
                שלום <strong style={{ color: 'var(--accent-light)' }}>{targetEmployee.full_name}</strong>,<br />
                מצ"ב תלוש שכר לחודש <strong style={{ color: 'var(--accent-light)' }}>{MONTHS_HE[uploadMonth]} {uploadYear}</strong>.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="submit" className="btn-primary" disabled={uploading || !uploadFile || !targetEmployee}
              style={{ flex: 1, justifyContent: 'center' }}>
              <Upload size={16} /> {uploading ? 'Uploading...' : 'Upload Payslip'}
            </button>
            <button type="button" className="btn-secondary"
              onClick={() => { setShowUpload(false); setUploadFile(null); setTargetEmployee(null) }}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
