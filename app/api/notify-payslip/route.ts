import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY)
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.bb-eng.co.il'
// Logo hosted on the portal's public URL — email clients need an absolute HTTP URL
const LOGO_URL = `${appUrl}/logo.png`

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HEBREW_MONTHS: Record<number, string> = {
  1:'ינואר', 2:'פברואר', 3:'מרץ', 4:'אפריל', 5:'מאי', 6:'יוני',
  7:'יולי', 8:'אוגוסט', 9:'ספטמבר', 10:'אוקטובר', 11:'נובמבר', 12:'דצמבר',
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#x27;')
}

/** Render template: replace {{var}} tokens with values. Server-side only. */
function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    key in vars ? escapeHtml(vars[key]) : `{{${key}}}`
  )
}

function buildEmailHtml(bodyText: string, employeeName: string): string {
  // Convert plain-text body (with newlines) into HTML paragraphs
  const bodyHtml = bodyText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#d0cdc8;">${escapeHtml(line)}</p>`)
    .join('\n')

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>תלוש שכר</title>
</head>
<body style="margin:0;padding:0;background:#f0ede8;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;direction:rtl;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0ede8;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" style="max-width:560px;background:#1e1e1e;border-radius:16px;overflow:hidden;border:1px solid #2e2e2e;">

      <!-- Header with logo -->
      <tr>
        <td style="background:#1a1a1a;padding:20px 32px;border-bottom:3px solid #C9A227;text-align:center;">
          <img src="${LOGO_URL}" alt="Buchman Brudner Engineering" width="220" height="auto"
               style="display:block;margin:0 auto;max-width:220px;height:auto;" />
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:32px;color:#f0ede8;text-align:right;">
          ${bodyHtml}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
            <tr>
              <td align="right">
                <a href="${appUrl}/payslips"
                   style="display:inline-block;background:#C9A227;color:#1a1000;font-weight:700;font-size:14px;padding:12px 28px;border-radius:10px;text-decoration:none;">
                  לצפייה בתלוש השכר &larr;
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#151515;padding:14px 32px;border-top:1px solid #2a2a2a;text-align:center;">
          <p style="margin:0;font-size:11px;color:#555;direction:rtl;">
            הודעה זו נשלחה אוטומטית ממערכת ניהול משאבי האנוש של בוכמן - ברודנר.
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`
}

export async function POST(req: NextRequest) {
  // ── Auth: only authenticated managers ──────────────────────────────────
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

  // ── Parse body ──────────────────────────────────────────────────────────
  const body = await req.json()
  const { to, employeeName, month, year } = body

  if (!to || typeof to !== 'string' || !to.includes('@')) {
    return NextResponse.json({ error: 'Invalid or missing recipient email' }, { status: 400 })
  }
  if (!employeeName) {
    return NextResponse.json({ error: 'Missing employeeName' }, { status: 400 })
  }

  const monthNum = Number(month)
  const yearNum = Number(year)
  const monthHe = HEBREW_MONTHS[monthNum] || String(monthNum)

  // ── Load template from DB (falls back to default) ──────────────────────
  const { data: tmplRow } = await supabaseAdmin
    .from('email_templates')
    .select('subject, body_html')
    .eq('id', 'payslip_notification')
    .single()

  const defaultSubject = 'תלוש שכר לחודש {{monthName}} {{year}}'
  const defaultBody = `שלום {{employeeName}},\n\nמצ"ב תלוש שכר לחודש {{monthName}} {{year}}.\n\nבברכה,\nבוכמן - ברודנר תכנון ויעוץ הנדסי בע"מ`

  const subjectTemplate = tmplRow?.subject || defaultSubject
  const bodyTemplate = tmplRow?.body_html || defaultBody

  const vars: Record<string, string> = {
    employeeName,
    monthName: monthHe,
    year: String(yearNum),
  }

  const renderedSubject = renderTemplate(subjectTemplate, vars)
  const renderedBody = renderTemplate(bodyTemplate, vars)

  const html = buildEmailHtml(renderedBody, employeeName)
  const text = renderedBody.replace(/<[^>]+>/g, '') // plain-text fallback

  // ── Send via Resend ─────────────────────────────────────────────────────
  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 'placeholder') {
    console.error('[payslip] RESEND_API_KEY is not set or is placeholder')
    return NextResponse.json({ error: 'Email service not configured. Set RESEND_API_KEY in Vercel environment variables.' }, { status: 503 })
  }

  try {
    const { data: sendData, error: sendErr } = await resend.emails.send({
      from: 'Buchman Brudner HR <office@bb-eng.co.il>',
      to,                          // ← raw string, NOT escaped (escapeHtml corrupts emails)
      subject: renderedSubject,
      html,
      text,
    })

    if (sendErr) {
      console.error('[payslip] Resend error:', JSON.stringify(sendErr))
      return NextResponse.json({ error: sendErr.message || 'Email send failed', detail: sendErr }, { status: 500 })
    }

    console.log(`[payslip] Sent to ${to} for ${monthHe} ${yearNum} | id: ${(sendData as any)?.id}`)
    return NextResponse.json({ ok: true, messageId: (sendData as any)?.id })

  } catch (err: any) {
    console.error('[payslip] Unexpected error:', err)
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 })
  }
}
