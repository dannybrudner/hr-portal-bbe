import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { sign } from 'jsonwebtoken'

const resend = new Resend(process.env.RESEND_API_KEY)
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.bb-eng.co.il'
const jwtSecret = process.env.JWT_SECRET || 'change-me-in-env'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { refundId, employeeName, employeeEmail, title, amount, currency, category, type } = await req.json()

  const { data: managers } = await supabaseAdmin.from('profiles').select('email, full_name').eq('role', 'manager')
  if (!managers?.length) return NextResponse.json({ ok: true })

  // Generate signed action tokens (1 week expiry)
  const makeToken = (status: string) => sign({ refundId, status }, jwtSecret, { expiresIn: '7d' })

  // For new request — send approve/deny links
  if (type === 'new') {
    for (const manager of managers) {
      const approveUrl = `${appUrl}/api/refund-status?token=${makeToken('approved')}`
      const denyUrl = `${appUrl}/api/refund-status?token=${makeToken('denied')}`

      await resend.emails.send({
        from: 'BB-Eng HR Portal <office@bb-eng.co.il>',
        to: manager.email,
        subject: `💳 New Refund Request: ${employeeName} — ${amount} ${currency}`,
        html: `<div style="font-family:sans-serif;max-width:540px;margin:0 auto;background:#1e1e1e;color:#f0ede8;border-radius:16px;overflow:hidden;">
          <div style="background:#1a1a1a;padding:20px 28px;border-bottom:2px solid #C9A227;">
            <div style="font-size:18px;font-weight:700;color:#C9A227;">BUCHMAN BRUDNER</div>
            <div style="font-size:11px;color:#888;letter-spacing:0.1em;">HR Portal — Refund Request</div>
          </div>
          <div style="padding:28px;">
            <h2 style="margin:0 0 6px;font-size:18px;">New Refund Request</h2>
            <p style="color:#9aa0b4;margin:0 0 20px;font-size:13px;">Submitted by ${employeeName}</p>
            <div style="background:#2e2e2e;border-radius:10px;padding:16px;margin-bottom:20px;border-left:3px solid #C9A227;">
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:5px 0;font-size:12px;color:#9aa0b4;width:40%;">Employee</td><td style="font-weight:600;">${employeeName}</td></tr>
                <tr><td style="padding:5px 0;font-size:12px;color:#9aa0b4;">Item</td><td style="font-weight:600;">${title}</td></tr>
                <tr><td style="padding:5px 0;font-size:12px;color:#9aa0b4;">Amount</td><td style="font-weight:700;color:#C9A227;font-size:16px;">${amount} ${currency}</td></tr>
                <tr><td style="padding:5px 0;font-size:12px;color:#9aa0b4;">Category</td><td>${category}</td></tr>
              </table>
            </div>
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding-right:6px;"><a href="${approveUrl}" style="display:block;text-align:center;background:#4caf80;color:#fff;font-weight:700;padding:12px;border-radius:10px;text-decoration:none;">✓ Approve</a></td>
                <td style="padding-left:6px;"><a href="${denyUrl}" style="display:block;text-align:center;background:#e06060;color:#fff;font-weight:700;padding:12px;border-radius:10px;text-decoration:none;">✗ Deny</a></td>
              </tr>
            </table>
            <p style="text-align:center;margin-top:16px;font-size:12px;color:#5a5f6e;">Or manage all refunds in the <a href="${appUrl}/admin" style="color:#C9A227;">Manager Portal</a></p>
          </div>
        </div>`,
      })
    }
  }

  // For reminder — approved but not refunded
  if (type === 'reminder') {
    for (const manager of managers) {
      const refundUrl = `${appUrl}/api/refund-status?token=${makeToken('refunded')}`
      await resend.emails.send({
        from: 'BB-Eng HR Portal <office@bb-eng.co.il>',
        to: manager.email,
        subject: `⏰ Reminder: Refund pending for ${employeeName} — ${amount} ${currency}`,
        html: `<div style="font-family:sans-serif;max-width:540px;margin:0 auto;">
          <p>This is a reminder that the following refund was approved but not yet marked as refunded:</p>
          <p><strong>${employeeName}</strong> — ${title} — <strong>${amount} ${currency}</strong></p>
          <a href="${refundUrl}" style="display:inline-block;background:#C9A227;color:#1a1000;font-weight:700;padding:12px 24px;border-radius:10px;text-decoration:none;margin-top:12px;">✓ Mark as Refunded</a>
        </div>`,
      })
    }
  }

  return NextResponse.json({ ok: true })
}
