import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const { to, employeeName, month, year, customMessage, template } = await req.json()
  if (!to || !employeeName) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  // Support dynamic placeholders in template
  const defaultTemplate = `
    <p>Hi {{name}},</p>
    <p>Your payslip for <strong>{{month}} {{year}}</strong> is now available in the HR Portal.</p>
    {{custom}}
    <p>Log in to view and download: <a href="{{appUrl}}/payslips" style="color:#C9A227;">View Payslips</a></p>
  `
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.bb-eng.co.il'
  const body = (template || defaultTemplate)
    .replace(/{{name}}/g, employeeName)
    .replace(/{{month}}/g, month || '')
    .replace(/{{year}}/g, year || '')
    .replace(/{{custom}}/g, customMessage ? `<p>${customMessage}</p>` : '')
    .replace(/{{appUrl}}/g, appUrl)

  try {
    await resend.emails.send({
      from: 'BB-Eng HR Portal <office@bb-eng.co.il>',
      to,
      subject: `📄 Your payslip for ${month} ${year} is ready`,
      html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1e1e1e;color:#f0ede8;border-radius:16px;overflow:hidden;">
        <div style="background:#1a1a1a;padding:20px 28px;border-bottom:2px solid #C9A227;">
          <div style="font-size:18px;font-weight:700;color:#C9A227;">BUCHMAN BRUDNER</div>
          <div style="font-size:11px;color:#888;">HR Portal — Payslip Notification</div>
        </div>
        <div style="padding:28px;">${body}</div>
      </div>`,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
