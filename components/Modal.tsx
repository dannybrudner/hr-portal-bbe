'use client'
/**
 * Modal — true viewport-level modal using React Portal.
 *
 * Renders directly into document.body, completely outside the component
 * tree. This means no parent transform/overflow/stacking context can
 * ever clip it.
 *
 * Usage:
 *   import Modal from '@/components/Modal'
 *
 *   <Modal open={showModal} onClose={() => setShowModal(false)} title="New Request">
 *     <form>...</form>
 *   </Modal>
 */
import { useEffect, useRef, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  maxWidth?: number | string
}

export default function Modal({ open, onClose, title, children, maxWidth = 520 }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const overlay = (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: 'clamp(1rem, 4vh, 3rem) 1rem',
        overflowY: 'auto',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-accent)',
          borderRadius: '24px',
          padding: '2rem',
          width: '100%',
          maxWidth: typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth,
          margin: 'auto 0',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '20px', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: '0.4rem', borderRadius: '8px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 0.15s',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        {children}
      </div>
    </div>
  )

  // Portal to body — escapes ALL parent stacking contexts
  return createPortal(overlay, document.body)
}
