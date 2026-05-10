import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY)
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.bb-eng.co.il'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HEBREW_MONTHS: Record<number, string> = {
  1: 'ינואר', 2: 'פברואר', 3: 'מרץ', 4: 'אפריל',
  5: 'מאי', 6: 'יוני', 7: 'יולי', 8: 'אוגוסט',
  9: 'ספטמבר', 10: 'אוקטובר', 11: 'נובמבר', 12: 'דצמבר',
}

function escapeHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#x27;')
}

export async function POST(req: NextRequest) {
  // Verify caller is authenticated manager — server-side only
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'manager') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { to, employeeName, month, year } = body

  if (!to || !employeeName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Compute payroll month label in Hebrew
  const monthNum = Number(month)
  const yearNum = Number(year)
  const monthHe = HEBREW_MONTHS[monthNum] || String(monthNum)

  const safeName = escapeHtml(employeeName)
  const safeMonth = escapeHtml(`${monthHe} ${yearNum}`)

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>תלוש שכר</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;direction:rtl;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" style="max-width:560px;background:#1e1e1e;border-radius:16px;overflow:hidden;border:1px solid #2e2e2e;">

      <!-- Header -->
      <tr>
        <td style="background:#1a1a1a;padding:24px 32px;border-bottom:3px solid #C9A227;text-align:right;">
          <div style="font-size:22px;font-weight:700;color:#C9A227;letter-spacing:0.5px;">בוכמן - ברודנר</div>
          <div style="font-size:12px;color:#888;margin-top:4px;">תכנון ויעוץ הנדסי בע&quot;מ</div>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:32px;color:#f0ede8;text-align:right;">
          <p style="margin:0 0 20px;font-size:16px;color:#f0ede8;">שלום <strong style="color:#C9A227;">${safeName}</strong>,</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#d0cdc8;">
            מצ&quot;ב תלוש שכר לחודש <strong style="color:#C9A227;">${safeMonth}</strong>.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
            <tr>
              <td align="right">
                <a href="${appUrl}/payslips"
                   style="display:inline-block;background:#C9A227;color:#1a1000;font-weight:700;font-size:15px;padding:12px 28px;border-radius:10px;text-decoration:none;direction:rtl;">
                  צפה בתלוש השכר ←
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:0;font-size:14px;color:#9aa0b4;line-height:1.6;">
            בברכה,<br>
            <strong style="color:#d0cdc8;">בוכמן - ברודנר תכנון ויעוץ הנדסי בע&quot;מ</strong>
          </p>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#151515;padding:16px 32px;border-top:1px solid #2a2a2a;text-align:center;">
          <p style="margin:0;font-size:11px;color:#555;direction:rtl;">
            הודעה זו נשלחה אוטומטית ממערכת ניהול משאבי האנוש.
            לשאלות פנה/י למנהל/ת.
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`

  // Plain text fallback (also RTL-safe)
  const text = `שלום ${employeeName},\n\nמצ"ב תלוש שכר לחודש ${monthHe} ${yearNum}.\n\nלצפייה בתלוש: ${appUrl}/payslips\n\nבברכה,\nבוכמן - ברודנר תכנון ויעוץ הנדסי בע"מ`

  try {
    const { error } = await resend.emails.send({
      from: 'BB-Eng HR Portal <office@bb-eng.co.il>',
      to: escapeHtml(to),
      subject: `📄 תלוש שכר לחודש ${monthHe} ${yearNum}`,
      html,
      text,
    })
    if (error) throw error

    // Audit log
    await supabaseAdmin.from('employee_documents').update({}).eq('id', 'noop') // no-op to keep connection warm
    console.log(`[payslip] email sent to ${to} for ${monthHe} ${yearNum} by manager ${user.id}`)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[payslip] email error:', err)
    return NextResponse.json({ error: err.message || 'Email failed' }, { status: 500 })
  }
}
