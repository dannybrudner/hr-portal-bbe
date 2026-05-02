import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY || "placeholder")

export async function POST(req: NextRequest) {
  const { to, name, month, year } = await req.json()

  try {
    await resend.emails.send({
      from: 'HR Portal <noreply@yourcompany.com>',
      to,
      subject: `Your Payslip for ${month} ${year} is Ready`,
      html: `
        <div style="font-family:'Plus Jakarta Sans',sans-serif;max-width:520px;margin:0 auto;background:#1a1f2e;color:#f0ede8;padding:32px;border-radius:16px;">
          <div style="background:#c9924a;width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;color:#1a1000;margin-bottom:24px;">HR</div>
          <h2 style="margin:0 0 8px;">Hi ${name},</h2>
          <p style="color:#9aa0b4;margin:0 0 24px;">Your payslip for <strong style="color:#e4b06a;">${month} ${year}</strong> has been uploaded and is ready to view.</p>
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/payslips" style="display:inline-block;background:#c9924a;color:#1a1000;font-weight:600;padding:12px 24px;border-radius:12px;text-decoration:none;font-size:14px;">View Payslip →</a>
          <p style="color:#626880;font-size:12px;margin-top:24px;">This is an automated message from your HR Portal.</p>
        </div>
      `,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
