'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase, RefundRequest } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import toast from 'react-hot-toast'
import { Plus, X, ReceiptText, Upload } from 'lucide-react'
import { format } from 'date-fns'

const CATEGORIES = ['Travel', 'Meals', 'Equipment', 'Software', 'Training', 'Office Supplies', 'Other']
const CAT_ICONS: Record<string, string> = {
  'Travel':'✈️','Meals':'🍽️','Equipment':'🖥️','Software':'💻','Training':'📚','Office Supplies':'📎','Other':'📦'
}

export default function RefundsPage() {
  const { user } = useAuth()
  const [requests, setRequests] = useState<RefundRequest[]>([])
  const [showModal, setShowModal] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('ILS')
  const [category, setCategory] = useState('')
  const [expenseDate, setExpenseDate] = useState('')
  const [notes, setNotes] = useState('')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    const { data } = await supabase.from('refund_requests').select('*').eq('user_id', user!.id).order('created_at', { ascending: false })
    setRequests(data || [])
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    let receiptUrl = ''
    if (receiptFile) {
      const path = `receipts/${user!.id}/${Date.now()}_${receiptFile.name}`
      const { data: upload } = await supabase.storage.from('documents').upload(path, receiptFile)
      if (upload) {
        const { data: url } = supabase.storage.from('documents').getPublicUrl(path)
        receiptUrl = url.publicUrl
      }
    }
    const { error } = await supabase.from('refund_requests').insert({
      user_id: user!.id, title, amount: parseFloat(amount),
      currency, category, expense_date: expenseDate,
      receipt_url: receiptUrl, notes, status: 'pending',
    })
    if (error) { toast.error(error.message); setLoading(false); return }
    toast.success('Refund request submitted!')
    setShowModal(false)
    setTitle(''); setAmount(''); setCategory(''); setExpenseDate(''); setNotes(''); setReceiptFile(null)
    fetch()
    setLoading(false)
  }

  async function archiveRefund(id: string) {
    const { error } = await supabase.from('refund_requests').update({ archived: true }).eq('id', id)
    if (error) toast.error(error.message)
    else { toast.success('Request archived'); fetch() }
  }

  async function unarchiveRefund(id: string) {
    const { error } = await supabase.from('refund_requests').update({ archived: false }).eq('id', id)
    if (error) toast.error(error.message)
    else { toast.success('Restored'); fetch() }
  }

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <div className="section-title">Refund Requests</div>
          <div className="section-subtitle">Submit expense reimbursements and track their status</div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
        <button onClick={() => setShowArchived(false)}
          className={showArchived ? 'btn-secondary' : 'btn-primary'}
          style={{ padding: '0.4rem 1rem', fontSize: '13px' }}>
          Active
        </button>
        <button onClick={() => setShowArchived(true)}
          className={showArchived ? 'btn-primary' : 'btn-secondary'}
          style={{ padding: '0.4rem 1rem', fontSize: '13px' }}>
          🗂 Archived
        </button>
      </div>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> New Refund</button>
      </div>

      {requests.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <ReceiptText size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
          <div style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>No refund requests yet</div>
          <button className="btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Submit Expense</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {requests.map(r => (
            <div key={r.id} className="card card-hover" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ fontSize: '28px', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input)', borderRadius: '14px' }}>
                  {CAT_ICONS[r.category] || '📦'}
                </div>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '15px' }}>{r.title}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {r.category} · {format(new Date(r.expense_date), 'dd/MM/yyyy')}
                  </div>
                  {r.notes && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{r.notes}</div>}
                  {r.receipt_url && (
                    <a href={r.receipt_url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: 'var(--accent-light)', textDecoration: 'none' }}>
                      📎 View Receipt
                    </a>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
                <div style={{ fontFamily: 'Syne, sans-serif', fontSize: '20px', fontWeight: '700', color: 'var(--accent-light)' }}>
                  {r.amount.toLocaleString()} {r.currency}
                </div>
                <span className={`badge badge-${r.status}`}>{r.status}</span>
                {!showArchived && r.status !== 'pending' && (
                  <button onClick={() => archiveRefund(r.id)}
                    className="btn-secondary"
                    style={{ padding: '0.3rem 0.6rem', fontSize: '11px', opacity: 0.7 }}
                    title="Archive">🗂</button>
                )}
                {showArchived && (
                  <button onClick={() => unarchiveRefund(r.id)}
                    className="btn-secondary"
                    style={{ padding: '0.3rem 0.6rem', fontSize: '11px' }}
                    title="Restore">↩</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '20px', fontWeight: '700' }}>New Refund Request</h2>
              <button onClick={() => setShowModal(false)} className="btn-secondary" style={{ padding: '0.4rem' }}><X size={16} /></button>
            </div>
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label>Title</label>
                <input className="input" placeholder="e.g. Client dinner, Taxi ride" value={title} onChange={e => setTitle(e.target.value)} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                <div>
                  <label>Amount</label>
                  <input className="input" type="number" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required />
                </div>
                <div>
                  <label>Currency</label>
                  <select className="input" value={currency} onChange={e => setCurrency(e.target.value)}>
                    <option>ILS</option><option>USD</option><option>EUR</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label>Category</label>
                  <select className="input" value={category} onChange={e => setCategory(e.target.value)} required>
                    <option value="">Select category</option>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label>Date of Expense</label>
                  <input className="input" type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} required />
                </div>
              </div>
              <div>
                <label>Receipt (optional)</label>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  background: 'var(--bg-input)', border: '1px dashed var(--border)',
                  borderRadius: '12px', padding: '1rem', cursor: 'pointer',
                  color: receiptFile ? 'var(--accent-light)' : 'var(--text-muted)',
                }}>
                  <Upload size={18} />
                  {receiptFile ? receiptFile.name : 'Upload receipt image or PDF'}
                  <input type="file" style={{ display: 'none' }} accept="image/*,.pdf" onChange={e => setReceiptFile(e.target.files?.[0] || null)} />
                </label>
              </div>
              <div>
                <label>Notes (optional)</label>
                <textarea className="input" rows={2} placeholder="Additional details..." value={notes} onChange={e => setNotes(e.target.value)} style={{ resize: 'vertical' }} />
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
