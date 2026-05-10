'use client'
/**
 * DocViewer — Global reusable document viewer
 * One component used everywhere in the platform.
 *
 * Usage:
 *   import { useDocViewer, DocViewerModal } from '@/components/DocViewer'
 *
 *   const viewer = useDocViewer()
 *   <button onClick={() => viewer.open({ url: signedUrl, name: 'Payslip June 2026', type: 'pdf' })}>View</button>
 *   <DocViewerModal viewer={viewer} />
 *
 * OR use the helper that resolves signed URLs automatically:
 *   <button onClick={() => viewer.openPath('payslips/user-id/file.pdf', 'Payslip')}>View</button>
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Download, ZoomIn, ZoomOut, RotateCcw, Maximize2, ExternalLink, FileText, Image, FileSpreadsheet, FileWarning } from 'lucide-react'
import { getSignedUrl } from '@/lib/documentService'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocFileType = 'pdf' | 'image' | 'office' | 'unknown'

export interface DocViewerFile {
  /** Fully resolved URL (signed or public) */
  url: string
  /** Display name shown in the header */
  name: string
  /** Optional explicit type — auto-detected from URL if omitted */
  fileType?: DocFileType
  /** Optional download filename override */
  downloadName?: string
}

export interface DocViewerHandle {
  /** Open viewer with an already-resolved URL */
  open: (file: DocViewerFile) => void
  /** Open viewer by resolving a Supabase storage path to a signed URL first */
  openPath: (storagePath: string, name: string) => Promise<void>
  /** Open viewer from a raw public URL (legacy / non-private files) */
  openUrl: (url: string, name: string) => void
  close: () => void
  isOpen: boolean
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDocViewer(): DocViewerHandle {
  const [file, setFile] = useState<DocViewerFile | null>(null)
  const [loading, setLoading] = useState(false)

  const open = useCallback((f: DocViewerFile) => {
    setFile({ ...f, fileType: f.fileType ?? detectFileType(f.url) })
  }, [])

  const openPath = useCallback(async (storagePath: string, name: string) => {
    setLoading(true)
    // Temporarily open loading state
    setFile({ url: '', name, fileType: 'pdf' })
    const url = await getSignedUrl(storagePath)
    setLoading(false)
    if (!url) { setFile(null); return }
    setFile({ url, name, fileType: detectFileType(storagePath), downloadName: name })
  }, [])

  const openUrl = useCallback((url: string, name: string) => {
    open({ url, name, fileType: detectFileType(url), downloadName: name })
  }, [open])

  const close = useCallback(() => { setFile(null) }, [])

  return {
    open, openPath, openUrl, close,
    isOpen: file !== null,
    // Expose file for modal — accessed via (viewer as any)._file
    ...(file ? { _file: file, _loading: loading } : { _file: null, _loading: loading }),
  } as DocViewerHandle & { _file: DocViewerFile | null; _loading: boolean }
}

// ─── File type detection ───────────────────────────────────────────────────────

export function detectFileType(url: string): DocFileType {
  const lower = url.toLowerCase().split('?')[0] // strip query params
  if (lower.endsWith('.pdf')) return 'pdf'
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/.test(lower)) return 'image'
  if (/\.(doc|docx|xls|xlsx|ppt|pptx)$/.test(lower)) return 'office'
  return 'unknown'
}

// ─── Modal component ──────────────────────────────────────────────────────────

interface DocViewerModalProps {
  viewer: DocViewerHandle & { _file?: DocViewerFile | null; _loading?: boolean }
}

export function DocViewerModal({ viewer }: DocViewerModalProps) {
  const file = (viewer as any)._file as DocViewerFile | null
  const loading = (viewer as any)._loading as boolean
  const [zoom, setZoom] = useState(100)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Reset zoom when new file opens
  useEffect(() => { if (file) setZoom(100) }, [file?.url])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') viewer.close() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [viewer])

  if (!file && !loading) return null

  async function handleDownload() {
    if (!file?.url) return
    try {
      const resp = await fetch(file.url)
      const blob = await resp.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = file.downloadName || file.name
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      // Fallback: open in new tab
      window.open(file.url, '_blank')
    }
  }

  const fileType = file?.fileType ?? 'unknown'
  const FileIcon = fileType === 'pdf' ? FileText : fileType === 'image' ? Image : fileType === 'office' ? FileSpreadsheet : FileWarning

  const modal = (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', flexDirection: 'column',
      }}
      onClick={e => { if (e.target === e.currentTarget) viewer.close() }}
    >
      {/* ── Header toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        padding: '0.75rem 1.25rem',
        background: '#1a1a1a', borderBottom: '1px solid #2a2a2a',
        flexShrink: 0,
      }}>
        <FileIcon size={18} style={{ color: 'var(--accent-light)', flexShrink: 0 }} />
        <span style={{
          flex: 1, fontWeight: '600', fontSize: '14px', color: '#f0ede8',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {file?.name || 'Loading…'}
        </span>

        {/* Zoom controls — only for PDF/image */}
        {file && (fileType === 'pdf' || fileType === 'image') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginRight: '0.5rem' }}>
            <button onClick={() => setZoom(z => Math.max(50, z - 25))}
              style={toolbarBtnStyle} title="Zoom out"><ZoomOut size={16} /></button>
            <span style={{ fontSize: '12px', color: '#9aa0b4', minWidth: '38px', textAlign: 'center' }}>{zoom}%</span>
            <button onClick={() => setZoom(z => Math.min(300, z + 25))}
              style={toolbarBtnStyle} title="Zoom in"><ZoomIn size={16} /></button>
            <button onClick={() => setZoom(100)}
              style={toolbarBtnStyle} title="Reset zoom"><RotateCcw size={14} /></button>
          </div>
        )}

        {/* Open in new tab */}
        {file?.url && (
          <a href={file.url} target="_blank" rel="noreferrer"
            style={{ ...toolbarBtnStyle, display: 'flex', alignItems: 'center', textDecoration: 'none', gap: '0.3rem', fontSize: '12px', color: '#9aa0b4' }}
            title="Open in new tab">
            <ExternalLink size={15} />
          </a>
        )}

        {/* Download */}
        {file?.url && (
          <button onClick={handleDownload} style={{ ...toolbarBtnStyle, display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '12px' }} title="Download">
            <Download size={15} />
          </button>
        )}

        {/* Close */}
        <button onClick={viewer.close}
          style={{ ...toolbarBtnStyle, marginLeft: '0.25rem', color: '#e06060' }}
          title="Close (Esc)">
          <X size={18} />
        </button>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1.5rem' }}>
        {loading || !file?.url ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '1rem', color: '#9aa0b4' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'pulse 1.5s ease-in-out infinite' }}>
              <FileText size={24} style={{ color: '#1a1000' }} />
            </div>
            <span style={{ fontSize: '14px' }}>Loading document…</span>
            <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
          </div>
        ) : fileType === 'pdf' ? (
          <iframe
            ref={iframeRef}
            src={file.url + '#toolbar=1&navpanes=0'}
            style={{
              width: `${zoom}%`, minWidth: '320px', maxWidth: '1200px',
              height: '85vh', border: 'none', borderRadius: '8px',
              background: '#fff',
            }}
            title={file.name}
          />
        ) : fileType === 'image' ? (
          <img
            src={file.url}
            alt={file.name}
            style={{
              maxWidth: `${zoom}%`, maxHeight: '85vh',
              borderRadius: '8px', objectFit: 'contain',
              boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            }}
          />
        ) : fileType === 'office' ? (
          <div style={{ textAlign: 'center', maxWidth: '480px' }}>
            <FileSpreadsheet size={64} style={{ color: 'var(--accent-light)', marginBottom: '1rem' }} />
            <div style={{ color: '#f0ede8', fontWeight: '600', fontSize: '16px', marginBottom: '0.5rem' }}>{file.name}</div>
            <div style={{ color: '#9aa0b4', fontSize: '13px', marginBottom: '1.5rem' }}>
              Office documents cannot be previewed inline. Use the buttons above to open or download.
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <a href={file.url} target="_blank" rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', background: 'var(--accent)', color: '#1a1000', borderRadius: '12px', fontWeight: '700', textDecoration: 'none', fontSize: '14px' }}>
                <ExternalLink size={16} /> Open
              </a>
              <button onClick={handleDownload}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', background: '#2a2a2a', color: '#f0ede8', borderRadius: '12px', fontWeight: '600', border: '1px solid #3a3a3a', cursor: 'pointer', fontSize: '14px' }}>
                <Download size={16} /> Download
              </button>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', maxWidth: '400px' }}>
            <FileWarning size={64} style={{ color: '#9aa0b4', marginBottom: '1rem' }} />
            <div style={{ color: '#f0ede8', fontWeight: '600', marginBottom: '0.5rem' }}>{file.name}</div>
            <div style={{ color: '#9aa0b4', fontSize: '13px', marginBottom: '1.5rem' }}>Unknown file type — use the buttons above to open or download.</div>
          </div>
        )}
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(modal, document.body)
}

const toolbarBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: '#9aa0b4', padding: '0.4rem', borderRadius: '8px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background 0.15s, color 0.15s',
}

// ─── Convenience wrapper: DocViewButton ───────────────────────────────────────
// Renders a button + modal in one shot — the simplest usage for inline cards.

interface DocViewButtonProps {
  /** Supabase storage path (will fetch signed URL) */
  storagePath?: string
  /** Already-resolved URL (public or signed) */
  url?: string
  /** Display name */
  name: string
  /** Button label override */
  label?: string
  /** Button className override */
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}

export function DocViewButton({ storagePath, url, name, label = 'View', className = 'btn-secondary', style, children }: DocViewButtonProps) {
  const viewer = useDocViewer()

  async function handleClick() {
    if (storagePath) {
      await viewer.openPath(storagePath, name)
    } else if (url) {
      viewer.openUrl(url, name)
    }
  }

  return (
    <>
      <button onClick={handleClick} className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', ...style }}>
        {children || label}
      </button>
      <DocViewerModal viewer={viewer} />
    </>
  )
}
