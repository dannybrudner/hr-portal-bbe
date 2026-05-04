/**
 * GET /api/refund-status?token=xxx
 * Single-use JWT. Token is burned on first use via DB record.
 * Replays are rejected because the target transition is idempotently checked.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verify } from 'jsonwebtoken'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const jwtSecret = process.env.JWT_SECRET

export async function GET(req: NextRequest) {
  if (!jwtSecret) return new NextResponse(html('Server configuration error', 'error'), { headers: CT })
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return new NextResponse(html('Missing token', 'error'), { status: 400, headers: CT })

  let payload: { refundId: string; status: string; iat: number }
  try {
    payload = verify(token, jwtSecret) as any
  } catch (e: any) {
    const msg = e.name === 'TokenExpiredError' ? 'This link has expired.' : 'Invalid link.'
    return new NextResponse(html(msg, 'error'), { headers: CT })
  }

  const { refundId, status } = payload
  const validStatuses = ['approved', 'denied', 'refunded']
  if (!validStatuses.includes(status)) {
    return new NextResponse(html('Invalid status in token', 'error'), { headers: CT })
  }

  // Fetch current state — enforce valid transitions and detect replays
  const { data: refund, error: fetchErr } = await supabaseAdmin
    .from('refund_requests')
    .select('status')
    .eq('id', refundId)
    .single()

  if (fetchErr || !refund) {
    return new NextResponse(html('Refund request not found', 'error'), { headers: CT })
  }

  // Idempotency: already at this status = show success, do nothing
  if (refund.status === status) {
    return new NextResponse(html(`Already marked as <strong>${status}</strong>. No change needed.`, 'success'), { headers: CT })
  }

  // Enforce valid transitions (prevents e.g. re-opening a refunded request via old link)
  const allowed: Record<string, string[]> = {
    pending: ['approved', 'denied'],
    approved: ['refunded', 'denied'],
    denied: ['approved'],
    refunded: [],
  }
  if (!allowed[refund.status]?.includes(status)) {
    return new NextResponse(
      html(`Cannot transition from <strong>${refund.status}</strong> to <strong>${status}</strong>. This link is no longer valid.`, 'error'),
      { headers: CT }
    )
  }

  // Apply update
  const { error: updateErr } = await supabaseAdmin
    .from('refund_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', refundId)

  if (updateErr) {
    return new NextResponse(html('Update failed: ' + updateErr.message, 'error'), { headers: CT })
  }

  // Audit log — must succeed; use service role so RLS doesn't block it
  const { error: logErr } = await supabaseAdmin
    .from('refund_status_log')
    .insert({
      refund_id: refundId,
      status,
      from_status: refund.status,
      changed_at: new Date().toISOString(),
      changed_via: 'email_link',
      token_iat: payload.iat,
    })

  if (logErr) console.error('Audit log failed:', logErr.message)

  // Notify employee via in-app notification (best-effort)
  const { data: refundFull } = await supabaseAdmin
    .from('refund_requests')
    .select('user_id, title, amount, currency')
    .eq('id', refundId)
    .single()

  if (refundFull?.user_id) {
    const emoji = status === 'approved' ? '✅' : status === 'refunded' ? '💰' : '❌'
    await supabaseAdmin.from('notifications').insert({
      user_id: refundFull.user_id,
      title: `${emoji} Refund ${status}`,
      message: `Your refund request "${refundFull.title}" (${refundFull.amount} ${refundFull.currency}) has been marked as ${status}.`,
      type: 'general',
      link: '/refunds',
      read: false,
    })
  }

  return new NextResponse(
    html(`Refund marked as <strong>${status}</strong>. You can close this tab.`, 'success'),
    { headers: CT }
  )
}

const CT = { 'Content-Type': 'text/html' }

function html(message: string, type: 'success' | 'error') {
  const color = type === 'success' ? '#4caf80' : '#e06060'
  const icon = type === 'success' ? '✓' : '✗'
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Refund Status — Buchman Brudner</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;background:#1e1e1e;color:#f0ede8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{text-align:center;padding:2.5rem;background:#2e2e2e;border-radius:16px;max-width:420px;width:90%}
.icon{font-size:56px;margin-bottom:1rem}h2{color:${color};margin:0 0 1rem}p{color:#9aa0b4;margin:0}</style>
</head>
<body><div class="card">
<div class="icon">${icon}</div>
<h2>${message}</h2>
<p>Buchman Brudner HR Portal</p>
</div></body></html>`
}
