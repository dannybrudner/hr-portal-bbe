'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { uploadAndRegister, getSignedUrl, DocumentType } from '@/lib/documentService'
import toast from 'react-hot-toast'
import { FolderOpen, Folder, Upload, FileText, X, Plus, Trash2, Search, ChevronRight, ExternalLink, Download } from 'lucide-react'
import { format } from 'date-fns'

type EmpDoc = {
  id: string
  employee_id: string
  document_type: string
  file_name: string
  storage_path: string
  upload_date: string
  year: number
  quarter: number
  tags: string[]
  related_entity_id: string | null
}

const DOC_TYPE_LABELS: Record<string, string> = {
  leave_attachment: 'Leave Attachment',
  sick_note: 'Sick Note',
  certificate: 'Certificate',
  payslip: 'Payslip',
  tax_form: 'Tax Form',
  general: 'General',
  hr_document: 'HR Document',
}

const DOC_TYPE_ICONS: Record<string, string> = {
  leave_attachment: '📎', sick_note: '🏥', certificate: '🏆',
  payslip: '💰', tax_form: '🧾', general: '📄', hr_document: '📋',
}

export default function DocumentsPage() {
  const { user } = useAuth()
  const [docs, setDocs] = useState<EmpDoc[]>([])
  const [fetching, setFetching] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [docType, setDocType] = useState<DocumentType>('general')
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [selectedQuarter, setSelectedQuarter] = useState<number | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)

  const loadDocs = useCallback(async () => {
    if (!user) return
    setFetching(true)
    const { data, error } = await supabase
      .from('employee_documents')
      .select('*')
      .eq('employee_id', user.id)
      .order('upload_date', { ascending: false })
    if (error) toast.error('Failed to load documents')
    else setDocs(data || [])
    setFetching(false)
  }, [user])

  useEffect(() => { loadDocs() }, [loadDocs])

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setUploading(true)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `docs/${user!.id}/${Date.now()}_${safeName}`
    const result = await uploadAndRegister(file, path, {
      employeeId: user!.id,
      uploadedBy: user!.id,
      documentType: docType,
      fileName: file.name,
      storagePath: path,
    })
    if (!result) { toast.error('Upload failed'); setUploading(false); return }
    toast.success('Document uploaded!')
    setShowUpload(false); setFile(null); setDocType('general')
    await loadDocs()
    setUploading(false)
  }

  async function openDoc(doc: EmpDoc) {
    setOpeningId(doc.id)
    const url = await getSignedUrl(doc.storage_path)
    setOpeningId(null)
    if (!url) { toast.error('Could not open file'); return }
    window.open(url, '_blank')
  }

  async function deleteDoc(id: string, storagePath: string) {
    if (!confirm('Delete this document?')) return
    await supabase.from('employee_documents').delete().eq('id', id)
    await supabase.storage.from('documents').remove([storagePath])
    toast.success('Deleted')
    loadDocs()
  }

  // Build year/quarter tree from docs
  const years = [...new Set(docs.map(d => d.year))].sort((a, b) => b - a)

  // Filter docs
  const filtered = docs.filter(d => {
    if (search && !d.file_name.toLowerCase().includes(search.toLowerCase()) &&
        !DOC_TYPE_LABELS[d.document_type]?.toLowerCase().includes(search.toLowerCase())) return false
    if (filterType !== 'all' && d.document_type !== filterType) return false
    if (selectedYear !== null && d.year !== selectedYear) return false
    if (selectedQuarter !== null && d.quarter !== selectedQuarter) return false
    return true
  })

  const allTypes = [...new Set(docs.map(d => d.document_type))]

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <div className="section-title">Documents · מסמכים</div>
          <div className="section-subtitle">All your uploaded files — leave attachments, certificates, HR documents</div>
        </div>
        <button className="btn-primary" onClick={() => setShowUpload(true)}>
          <Plus size={16} /> Upload Document
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left: Year/Quarter tree */}
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>BROWSE BY DATE</div>
          <button
            onClick={() => { setSelectedYear(null); setSelectedQuarter(null) }}
            style={{
              width: '100%', textAlign: 'left', padding: '0.4rem 0.5rem', borderRadius: '8px',
              background: !selectedYear ? 'var(--accent-muted)' : 'transparent',
              border: 'none', cursor: 'pointer', color: !selectedYear ? 'var(--accent-light)' : 'var(--text-secondary)',
              fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '13px', fontWeight: !selectedYear ? '600' : '400',
              display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem',
            }}>
            <FolderOpen size={15} /> All Documents ({docs.length})
          </button>

          {years.map(year => {
            const yearDocs = docs.filter(d => d.year === year)
            const quarters = [...new Set(yearDocs.map(d => d.quarter))].sort()
            const isYearOpen = selectedYear === year
            return (
              <div key={year}>
                <button
                  onClick={() => { setSelectedYear(isYearOpen && !selectedQuarter ? null : year); setSelectedQuarter(null) }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '0.4rem 0.5rem', borderRadius: '8px',
                    background: isYearOpen && !selectedQuarter ? 'var(--accent-muted)' : 'transparent',
                    border: 'none', cursor: 'pointer',
                    color: isYearOpen ? 'var(--accent-light)' : 'var(--text-secondary)',
                    fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '13px', fontWeight: '500',
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                  }}>
                  <ChevronRight size={13} style={{ transform: isYearOpen ? 'rotate(90deg)' : 'none', transition: '0.2s' }} />
                  <Folder size={14} /> {year} ({yearDocs.length})
                </button>
                {isYearOpen && quarters.map(q => {
                  const qDocs = yearDocs.filter(d => d.quarter === q)
                  const isQSelected = selectedYear === year && selectedQuarter === q
                  return (
                    <button key={q}
                      onClick={() => setSelectedQuarter(isQSelected ? null : q)}
                      style={{
                        width: '100%', textAlign: 'left', padding: '0.35rem 0.5rem 0.35rem 1.75rem',
                        borderRadius: '8px',
                        background: isQSelected ? 'var(--accent-muted)' : 'transparent',
                        border: 'none', cursor: 'pointer',
                        color: isQSelected ? 'var(--accent-light)' : 'var(--text-muted)',
                        fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '12px',
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                      }}>
                      <FolderOpen size={13} /> Q{q} ({qDocs.length})
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Right: Document list */}
        <div>
          {/* Search + filter bar */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="input"
                placeholder="Search documents..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: '34px' }}
              />
            </div>
            <select className="input" style={{ width: 'auto' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="all">All types</option>
              {allTypes.map(t => <option key={t} value={t}>{DOC_TYPE_LABELS[t] || t}</option>)}
            </select>
          </div>

          {fetching ? (
            <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <FileText size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
              <div style={{ color: 'var(--text-secondary)' }}>
                {docs.length === 0 ? 'No documents yet — upload your first document' : 'No documents match your filters'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {filtered.map(doc => (
                <div key={doc.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.875rem 1.25rem' }}>
                  <div style={{ fontSize: '22px', flexShrink: 0 }}>{DOC_TYPE_ICONS[doc.document_type] || '📄'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '600', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {doc.file_name}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ background: 'var(--bg-input)', borderRadius: '6px', padding: '1px 6px' }}>
                        {DOC_TYPE_LABELS[doc.document_type] || doc.document_type}
                      </span>
                      <span>{doc.year} · Q{doc.quarter}</span>
                      <span>{format(new Date(doc.upload_date), 'dd/MM/yyyy')}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    <button
                      onClick={() => openDoc(doc)}
                      disabled={openingId === doc.id}
                      className="btn-secondary"
                      style={{ padding: '0.35rem 0.75rem', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <ExternalLink size={13} /> {openingId === doc.id ? 'Opening...' : 'View'}
                    </button>
                    <button
                      onClick={() => deleteDoc(doc.id, doc.storage_path)}
                      className="btn-secondary"
                      style={{ padding: '0.35rem 0.6rem', fontSize: '12px', color: 'var(--status-rejected)' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '440px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '18px', fontWeight: '700' }}>Upload Document</h2>
              <button onClick={() => setShowUpload(false)} className="btn-secondary" style={{ padding: '0.4rem' }}><X size={16} /></button>
            </div>
            <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label>Document Type</label>
                <select className="input" value={docType} onChange={e => setDocType(e.target.value as DocumentType)}>
                  {Object.entries(DOC_TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>File</label>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  background: 'var(--bg-input)', border: `1px dashed ${file ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: '12px', padding: '1rem', cursor: 'pointer',
                  color: file ? 'var(--accent-light)' : 'var(--text-muted)',
                }}>
                  <Upload size={16} />
                  <span style={{ fontSize: '14px' }}>{file ? file.name : 'Click to select file (PDF, image, doc)'}</span>
                  <input type="file" style={{ display: 'none' }} accept="image/*,.pdf,.doc,.docx,.xlsx,.xls"
                    onChange={e => setFile(e.target.files?.[0] || null)} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="submit" className="btn-primary" disabled={uploading || !file}>
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => { setShowUpload(false); setFile(null) }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
