import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY || 'placeholder')
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hr-portal-bbe.vercel.app'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export async function POST(req: NextRequest) {
  const { leaveRequestId, employeeName, employeeEmail, leaveType, startDate, endDate, reason, fileUrl } = await req.json()
  const { data: managers } = await supabaseAdmin.from('profiles').select('email, full_name').eq('role', 'manager')
  if (!managers?.length) return NextResponse.json({ ok: true, note: 'no managers' })

  const approveUrl = `${appUrl}/admin?action=approve&id=${leaveRequestId}`
  const rejectUrl = `${appUrl}/admin?action=reject&id=${leaveRequestId}`
  const days = Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000*60*60*24)) + 1

  try {
    for (const manager of managers) {
      await resend.emails.send({
        from: 'BB-Eng HR Portal <office@bb-eng.co.il>',
        to: manager.email,
        subject: `New Leave Request: ${employeeName} — ${leaveType} (${days} days)`,
        html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#1e1e1e;color:#f0ede8;border-radius:16px;overflow:hidden;">
          <div style="background:#1a1a1a;padding:24px 32px;border-bottom:2px solid #C9A227;">
            <div style="font-size:20px;font-weight:700;color:#C9A227;">BUCHMAN BRUDNER</div>
            <div style="font-size:11px;color:#888;letter-spacing:0.1em;">HR Portal — Leave Request</div>
          </div>
          <div style="padding:32px;">
            <h2 style="margin:0 0 8px;font-size:20px;">New Leave Request Submitted</h2>
            <p style="color:#9aa0b4;margin:0 0 24px;font-size:14px;">Requires your approval, ${manager.full_name || 'Manager'}</p>
            <div style="background:#2e2e2e;border-radius:12px;padding:20px;margin-bottom:24px;border-left:3px solid #C9A227;">
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:6px 0;font-size:12px;color:#9aa0b4;width:40%;">Employee</td><td style="font-weight:600;">${employeeName}</td></tr>
                <tr><td style="padding:6px 0;font-size:12px;color:#9aa0b4;">Email</td><td style="font-size:13px;">${employeeEmail}</td></tr>
                <tr><td style="padding:6px 0;font-size:12px;color:#9aa0b4;">Type</td><td style="font-weight:600;color:#C9A227;">${leaveType}</td></tr>
                <tr><td style="padding:6px 0;font-size:12px;color:#9aa0b4;">Dates</td><td style="font-weight:600;">${startDate} → ${endDate} (${days} day${days>1?'s':''})</td></tr>
                ${reason ? `<tr><td style="padding:6px 0;font-size:12px;color:#9aa0b4;vertical-align:top;">Reason</td><td style="font-size:13px;color:#ccc;">${reason}</td></tr>` : ''}
              </table>
            </div>
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding-right:8px;"><a href="${approveUrl}" style="display:block;text-align:center;background:#4caf80;color:#fff;font-weight:700;padding:14px;border-radius:10px;text-decoration:none;font-size:15px;">✓ Approve</a></td>
                <td style="padding-left:8px;"><a href="${rejectUrl}" style="display:block;text-align:center;background:#e06060;color:#fff;font-weight:700;padding:14px;border-radius:10px;text-decoration:none;font-size:15px;">✗ Reject</a></td>
              </tr>
            </table>
            <p style="font-size:12px;color:#5a5f6e;text-align:center;margin-top:20px;">Or visit the <a href="${appUrl}/admin" style="color:#C9A227;">Manager Portal</a></p>
          </div>
        </div>`,
      })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
