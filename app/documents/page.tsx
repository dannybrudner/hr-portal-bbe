'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase, Document } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import toast from 'react-hot-toast'
import { FolderOpen, Upload, FileText, X, Plus, Trash2 } from 'lucide-react'
import { format } from 'date-fns'

const FOLDERS = ['General', '2024', '2025', '2026']

export default function DocumentsPage() {
  const { user } = useAuth()
  const [docs, setDocs] = useState<Document[]>([])
  const [activeFolder, setActiveFolder] = useState('General')
  const [showUpload, setShowUpload] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState('')
  const [uploading, setUploading] = useState(false)

  const fetch = useCallback(async () => {
    const { data } = await supabase.from('documents').select('*').eq('user_id', user!.id).order('created_at', { ascending: false })
    setDocs(data || [])
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  async function uploadDoc(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setUploading(true)
    const path = `docs/${user!.id}/${activeFolder}/${Date.now()}_${file.name}`
    const { error: uploadError } = await supabase.storage.from('documents').upload(path, file)
    if (uploadError) { toast.error(uploadError.message); setUploading(false); return }
    const { data: url } = supabase.storage.from('documents').getPublicUrl(path)
    const { error } = await supabase.from('documents').insert({
      user_id: user!.id, file_url: url.publicUrl,
      file_name: fileName || file.name, folder: activeFolder,
    })
    if (error) { toast.error(error.message); setUploading(false); return }
    toast.success('Document uploaded!')
    setShowUpload(false); setFile(null); setFileName('')
    fetch()
    setUploading(false)
  }

  async function deleteDoc(id: string) {
    if (!confirm('Delete this document?')) return
    await supabase.from('documents').delete().eq('id', id)
    toast.success('Deleted')
    fetch()
  }

  const folderDocs = docs.filter(d => d.folder === activeFolder)

  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase()
    if (ext === 'pdf') return '📄'
    if (['jpg','jpeg','png','gif','webp'].includes(ext || '')) return '🖼️'
    if (['doc','docx'].includes(ext || '')) return '📝'
    if (['xls','xlsx'].includes(ext || '')) return '📊'
    return '📎'
  }

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <div className="section-title">Documents · מסמכים</div>
          <div className="section-subtitle">Manage certificates, diplomas, tax forms and more</div>
        </div>
        <button className="btn-primary" onClick={() => setShowUpload(true)}><Upload size={16} /> Upload Document</button>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem' }}>
        {/* Folder sidebar */}
        <div style={{ width: '160px', flexShrink: 0 }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Folders</div>
          {FOLDERS.map(f => (
            <button key={f} onClick={() => setActiveFolder(f)} className="nav-link" style={{
              background: activeFolder === f ? 'var(--accent-muted)' : undefined,
              color: activeFolder === f ? 'var(--accent-light)' : undefined,
              border: activeFolder === f ? '1px solid var(--border-accent)' : '1px solid transparent',
              marginBottom: '4px',
            }}>
              <FolderOpen size={16} /> {f}
              <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)' }}>
                {docs.filter(d => d.folder === f).length}
              </span>
            </button>
          ))}
        </div>

        {/* File list */}
        <div style={{ flex: 1 }}>
          {folderDocs.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <FolderOpen size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
              <div style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>Folder is empty</div>
              <button className="btn-primary" onClick={() => setShowUpload(true)}><Upload size={16} /> Upload Document</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {folderDocs.map(doc => (
                <div key={doc.id} className="card card-hover" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ fontSize: '28px', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input)', borderRadius: '12px' }}>
                    {getFileIcon(doc.file_name)}
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontWeight: '600', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.file_name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Uploaded {format(new Date(doc.created_at), 'dd/MM/yyyy')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <a href={doc.file_url} target="_blank" rel="noreferrer" className="btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '12px', textDecoration: 'none' }}>
                      View
                    </a>
                    <button onClick={() => deleteDoc(doc.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--status-rejected)', padding: '0.4rem' }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showUpload && (
        <div className="modal-overlay">
          <div className="modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '20px', fontWeight: '700' }}>Upload Document</h2>
              <button onClick={() => setShowUpload(false)} className="btn-secondary" style={{ padding: '0.4rem' }}><X size={16} /></button>
            </div>
            <form onSubmit={uploadDoc} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label>Folder</label>
                <select className="input" value={activeFolder} onChange={e => setActiveFolder(e.target.value)}>
                  {FOLDERS.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label>File</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-input)', border: '1px dashed var(--border)', borderRadius: '12px', padding: '1.25rem', cursor: 'pointer', color: file ? 'var(--accent-light)' : 'var(--text-muted)' }}>
                  <Upload size={20} />
                  {file ? file.name : 'Click to select file'}
                  <input type="file" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; setFile(f || null); if (f) setFileName(f.name) }} required />
                </label>
              </div>
              <div>
                <label>Display Name (optional)</label>
                <input className="input" placeholder="Custom file name" value={fileName} onChange={e => setFileName(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="submit" className="btn-primary" disabled={uploading}>{uploading ? 'Uploading...' : 'Upload'}</button>
                <button type="button" className="btn-secondary" onClick={() => setShowUpload(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
