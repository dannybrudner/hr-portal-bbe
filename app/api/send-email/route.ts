import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY || "placeholder")

export async function POST(req: NextRequest) {
  // Manager-only: prevents any authenticated user from sending bulk email
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabaseAdminLocal = (await import('@supabase/supabase-js')).createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const userClient = (await import('@supabase/supabase-js')).createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: senderProfile } = await supabaseAdminLocal.from('profiles').select('role').eq('id', user.id).single()
  if (senderProfile?.role !== 'manager') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { recipients, subject, body } = await req.json()

  try {
    for (const r of recipients) {
      const personalBody = body.replace(/\{name\}/g, r.name || r.email)
      await resend.emails.send({
        from: 'BB-Eng HR Portal <office@bb-eng.co.il>',
        to: r.email,
        subject,
        html: `
          <div style="font-family:'Plus Jakarta Sans',sans-serif;max-width:520px;margin:0 auto;background:#1a1f2e;color:#f0ede8;padding:32px;border-radius:16px;">
            <div style="background:#c9924a;width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;color:#1a1000;margin-bottom:24px;">HR</div>
            <div style="white-space:pre-line;line-height:1.7;">${personalBody}</div>
            <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:24px 0;"/>
            <p style="color:#626880;font-size:12px;">Sent via HR Portal</p>
          </div>
        `,
      })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
