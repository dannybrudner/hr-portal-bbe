'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase, Payslip, TaxForm } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { FileText, Download, Receipt } from 'lucide-react'
import { format } from 'date-fns'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function PayslipsPage() {
  const { user } = useAuth()
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [taxForms, setTaxForms] = useState<TaxForm[]>([])

  const fetch = useCallback(async () => {
    const [{ data: ps }, { data: tf }] = await Promise.all([
      supabase.from('payslips').select('*').eq('user_id', user!.id).order('year', { ascending: false }).order('month', { ascending: false }),
      supabase.from('tax_forms').select('*').eq('user_id', user!.id).order('year', { ascending: false }),
    ])
    setPayslips(ps || [])
    setTaxForms(tf || [])
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  return (
    <div className="fade-in">
      <div className="section-title">תלושי שכר · Payslips</div>
      <div className="section-subtitle">Your payslips will appear here after being uploaded by the manager</div>

      {/* Payslips */}
      <div style={{ marginBottom: '2.5rem' }}>
        <h3 style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Monthly Payslips
        </h3>
        {payslips.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
            <FileText size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
            <div style={{ color: 'var(--text-secondary)' }}>No payslips uploaded yet</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
            {payslips.map(p => (
              <a key={p.id} href={p.file_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                <div className="card card-hover" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FileText size={20} style={{ color: 'var(--accent-light)' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '15px' }}>{MONTHS[p.month - 1]} {p.year}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Payslip</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent-light)', fontSize: '12px', fontWeight: '500' }}>
                    <Download size={14} /> Download
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Tax Forms */}
      <div>
        <h3 style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Tax Forms · טפסי מס
        </h3>
        {taxForms.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
            <Receipt size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 0.75rem' }} />
            <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>No tax forms uploaded yet</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
            {taxForms.map(tf => (
              <a key={tf.id} href={tf.file_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                <div className="card card-hover" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(107,159,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Receipt size={20} style={{ color: '#6b9fff' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '15px' }}>Form {tf.form_type}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{tf.year}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#6b9fff', fontSize: '12px', fontWeight: '500' }}>
                    <Download size={14} /> Download
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
