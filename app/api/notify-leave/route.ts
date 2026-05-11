import { NextRequest, NextResponse } from 'next/server'
import { escapeHtml } from '@/lib/emailUtils'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY || "placeholder")

export async function POST(req: NextRequest) {
  // Verify caller is authenticated
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { createClient } = await import('@supabase/supabase-js')
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { to, name, status, leaveType, startDate, endDate, note } = await req.json()

  const statusText = status === 'approved' ? '✅ Approved' : '❌ Rejected'
  const statusColor = status === 'approved' ? '#4caf80' : '#e06060'

  try {
    await resend.emails.send({
      from: 'BB-Eng HR Portal <office@bb-eng.co.il>',
      to,
      subject: `Leave Request ${statusText} — ${escapeHtml(String(leaveType ?? ""))}`,
      html: `
        <div style="font-family:'Plus Jakarta Sans',sans-serif;max-width:520px;margin:0 auto;background:#1a1f2e;color:#f0ede8;padding:32px;border-radius:16px;">
          <div style="background:#c9924a;width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;color:#1a1000;margin-bottom:24px;">HR</div>
          <h2 style="margin:0 0 8px;font-size:20px;">Hi ${escapeHtml(String(name ?? ""))},</h2>
          <p style="color:#9aa0b4;margin:0 0 24px;">Your leave request has been reviewed.</p>
          <div style="background:#2a3142;border-radius:12px;padding:20px;margin-bottom:24px;">
            <div style="margin-bottom:12px;">
              <span style="font-size:12px;color:#626880;text-transform:uppercase;letter-spacing:0.05em;">Status</span>
              <div style="font-size:18px;font-weight:700;color:${statusColor};margin-top:4px;">${statusText}</div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div><span style="font-size:12px;color:#626880">Type</span><div style="font-weight:600;margin-top:2px;">${escapeHtml(String(leaveType ?? ""))}</div></div>
              <div><span style="font-size:12px;color:#626880">Dates</span><div style="font-weight:600;margin-top:2px;">${escapeHtml(String(startDate ?? ""))} — ${escapeHtml(String(endDate ?? ""))}</div></div>
            </div>
            ${note ? `<div style="margin-top:16px;padding:12px;background:#1e2333;border-radius:8px;"><span style="font-size:12px;color:#c9924a;">Manager note:</span><div style="margin-top:4px;font-size:14px;">${escapeHtml(String(note ?? ""))}</div></div>` : ''}
          </div>
          <p style="color:#626880;font-size:12px;">This is an automated message from your HR Portal.</p>
        </div>
      `,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
