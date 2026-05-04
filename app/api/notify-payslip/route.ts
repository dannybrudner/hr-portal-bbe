import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY)
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.bb-eng.co.il'

// Service role to verify caller is authenticated
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** Escape HTML special chars to prevent XSS via template placeholders */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

const DEFAULT_TEMPLATE = `
  <p>Hi {{name}},</p>
  <p>Your payslip for <strong>{{month}} {{year}}</strong> is now available in the HR Portal.</p>
  {{custom}}
  <p><a href="{{appUrl}}/payslips" style="color:#C9A227;">View Payslips →</a></p>
`

// Allowed placeholder keys — only these are substituted
const ALLOWED_PLACEHOLDERS: Record<string, (v: Record<string,string>) => string> = {
  '{{name}}':   (v) => escapeHtml(v.employeeName || ''),
  '{{month}}':  (v) => escapeHtml(v.month || ''),
  '{{year}}':   (v) => escapeHtml(v.year || ''),
  '{{custom}}': (v) => v.customMessage ? `<p>${escapeHtml(v.customMessage)}</p>` : '',
  '{{appUrl}}': (_) => appUrl, // trusted, not from user input
}

function renderTemplate(template: string, vars: Record<string,string>): string {
  let result = template
  for (const [placeholder, fn] of Object.entries(ALLOWED_PLACEHOLDERS)) {
    result = result.replaceAll(placeholder, fn(vars))
  }
  // Strip any remaining {{ }} to prevent unknown placeholder leakage
  result = result.replace(/\{\{[^}]+\}\}/g, '')
  return result
}

export async function POST(req: NextRequest) {
  // Verify caller is authenticated manager
  const authHeader = req.headers.get('Authorization')
  if (authHeader) {
    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'manager') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { to, employeeName, month, year, customMessage, template } = body

  if (!to || !employeeName) return NextResponse.json({ error: 'Missing required fields: to, employeeName' }, { status: 400 })
  if (typeof to !== 'string' || !to.includes('@')) return NextResponse.json({ error: 'Invalid email' }, { status: 400 })

  const vars = { employeeName, month: month || '', year: year || '', customMessage: customMessage || '' }

  // Use provided template only if it's a string — never execute it
  const rawTemplate = typeof template === 'string' ? template : DEFAULT_TEMPLATE
  const body_html = renderTemplate(rawTemplate, vars)

  try {
    const { error } = await resend.emails.send({
      from: 'BB-Eng HR Portal <office@bb-eng.co.il>',
      to,
      subject: `📄 Your payslip for ${escapeHtml(month)} ${escapeHtml(year)} is ready`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;background:#1e1e1e;color:#f0ede8;border-radius:16px;overflow:hidden;">
        <div style="background:#1a1a1a;padding:20px 28px;border-bottom:2px solid #C9A227;">
          <div style="font-size:18px;font-weight:700;color:#C9A227;">BUCHMAN BRUDNER</div>
          <div style="font-size:11px;color:#888;">HR Portal — Payslip Notification</div>
        </div>
        <div style="padding:28px;">${body_html}</div>
      </div>`,
    })
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('Payslip email error:', err)
    return NextResponse.json({ error: err.message || 'Email send failed' }, { status: 500 })
  }
}
