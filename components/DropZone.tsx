'use client'
/**
 * DropZone — Reusable enterprise drag-and-drop upload component.
 * Used everywhere in the platform. Zero module-specific logic.
 *
 * Usage:
 *   <DropZone
 *     onFiles={(files) => handleFiles(files)}
 *     accept=".pdf,image/*"
 *     maxSizeMB={20}
 *     multiple={false}
 *   />
 */
import { useState, useRef, useCallback, DragEvent, ChangeEvent } from 'react'
import { Upload, X, FileText, Image, CheckCircle, AlertCircle } from 'lucide-react'

export interface DropZoneFile {
  file: File
  id: string
  preview?: string
}

interface DropZoneProps {
  onFiles: (files: DropZoneFile[]) => void
  accept?: string
  maxSizeMB?: number
  multiple?: boolean
  label?: string
  sublabel?: string
  disabled?: boolean
}

const ALLOWED_MIME: Record<string, boolean> = {
  'application/pdf': true,
  'image/jpeg': true, 'image/png': true, 'image/gif': true,
  'image/webp': true, 'image/heic': true,
  'application/msword': true,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
  'application/vnd.ms-excel': true,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': true,
}

function validateFile(file: File, maxSizeMB: number): string | null {
  if (!ALLOWED_MIME[file.type] && file.size > 0) {
    // also allow by extension for types browsers mis-detect
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['pdf','jpg','jpeg','png','gif','webp','doc','docx','xls','xlsx'].includes(ext || '')) {
      return `File type not allowed: ${file.type || ext}`
    }
  }
  if (file.size > maxSizeMB * 1024 * 1024) {
    return `File too large (max ${maxSizeMB}MB)`
  }
  if (file.size === 0) return 'File is empty'
  return null
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\u0590-\u05FF-]/g, '_')
}

function getFileIcon(file: File) {
  if (file.type === 'application/pdf') return FileText
  if (file.type.startsWith('image/')) return Image
  return FileText
}

export default function DropZone({
  onFiles,
  accept = '.pdf,image/*,.doc,.docx,.xls,.xlsx',
  maxSizeMB = 20,
  multiple = false,
  label = 'Drag & drop files here',
  sublabel,
  disabled = false,
}: DropZoneProps) {
  const [dragging, setDragging] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [staged, setStaged] = useState<DropZoneFile[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const processFiles = useCallback((rawFiles: FileList | null) => {
    if (!rawFiles || disabled) return
    const errs: string[] = []
    const valid: DropZoneFile[] = []

    Array.from(rawFiles).forEach(file => {
      const err = validateFile(file, maxSizeMB)
      if (err) { errs.push(`${file.name}: ${err}`); return }
      const sanitized = new File([file], sanitizeFilename(file.name), { type: file.type })
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
      valid.push({ file: sanitized, id, preview })
    })

    setErrors(errs)
    if (valid.length > 0) {
      const next = multiple ? [...staged, ...valid] : valid.slice(0, 1)
      setStaged(next)
      onFiles(next)
    }
  }, [disabled, maxSizeMB, multiple, onFiles, staged])

  function onDragEnter(e: DragEvent) { e.preventDefault(); if (!disabled) setDragging(true) }
  function onDragLeave(e: DragEvent) { e.preventDefault(); setDragging(false) }
  function onDragOver(e: DragEvent) { e.preventDefault() }
  function onDrop(e: DragEvent) {
    e.preventDefault(); setDragging(false)
    processFiles(e.dataTransfer.files)
  }
  function onChange(e: ChangeEvent<HTMLInputElement>) {
    processFiles(e.target.files)
    e.target.value = '' // allow re-upload same file
  }

  function remove(id: string) {
    const next = staged.filter(f => f.id !== id)
    setStaged(next)
    onFiles(next)
  }

  const GOLD = '#C9A227'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {/* Drop zone */}
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${dragging ? GOLD : staged.length > 0 ? '#4caf80' : 'var(--border)'}`,
          borderRadius: '14px',
          padding: '1.75rem 1.25rem',
          textAlign: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: dragging ? `${GOLD}11` : staged.length > 0 ? 'rgba(76,175,128,0.06)' : 'var(--bg-input)',
          transition: 'all 0.18s ease',
          opacity: disabled ? 0.5 : 1,
          userSelect: 'none',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          style={{ display: 'none' }}
          onChange={onChange}
          disabled={disabled}
        />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
          {staged.length > 0
            ? <CheckCircle size={28} style={{ color: '#4caf80' }} />
            : <Upload size={28} style={{ color: dragging ? GOLD : 'var(--text-muted)', transition: 'color 0.18s' }} />
          }
          <div style={{ fontSize: '14px', fontWeight: '600', color: staged.length > 0 ? '#4caf80' : dragging ? GOLD : 'var(--text-secondary)' }}>
            {dragging ? 'Drop to upload' : staged.length > 0 ? `${staged.length} file${staged.length > 1 ? 's' : ''} ready` : label}
          </div>
          {sublabel && !staged.length && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{sublabel}</div>
          )}
          {!staged.length && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              PDF, images, documents · max {maxSizeMB}MB
            </div>
          )}
        </div>
      </div>

      {/* Staged files */}
      {staged.map(f => {
        const Icon = getFileIcon(f.file)
        return (
          <div key={f.id} style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '0.6rem 0.9rem',
          }}>
            {f.preview
              ? <img src={f.preview} alt="" style={{ width: '36px', height: '36px', borderRadius: '6px', objectFit: 'cover' }} />
              : <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'var(--accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={18} style={{ color: 'var(--accent-light)' }} />
                </div>
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{(f.file.size / 1024).toFixed(0)} KB</div>
            </div>
            <button onClick={() => remove(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', borderRadius: '6px' }}>
              <X size={15} />
            </button>
          </div>
        )
      })}

      {/* Errors */}
      {errors.map((err, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '12px', color: 'var(--status-rejected)', background: 'var(--status-rejected-bg)', borderRadius: '8px', padding: '0.5rem 0.75rem' }}>
          <AlertCircle size={13} /> {err}
        </div>
      ))}
    </div>
  )
}
