/**
 * GET /api/refund-status?token=xxx
 * Manager clicks email link → validates JWT → updates status → shows confirmation page
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verify } from 'jsonwebtoken'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const jwtSecret = process.env.JWT_SECRET || 'change-me-in-env'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return new NextResponse('Missing token', { status: 400 })

  let payload: { refundId: string; status: string }
  try {
    payload = verify(token, jwtSecret) as any
  } catch {
    return new NextResponse(html('Invalid or expired link', 'error'), { headers: { 'Content-Type': 'text/html' } })
  }

  const { refundId, status } = payload
  const validStatuses = ['approved', 'denied', 'refunded']
  if (!validStatuses.includes(status)) return new NextResponse('Invalid status', { status: 400 })

  const { error } = await supabaseAdmin.from('refund_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', refundId)

  if (error) return new NextResponse(html('Update failed: ' + error.message, 'error'), { headers: { 'Content-Type': 'text/html' } })

  // Audit log
  await supabaseAdmin.from('refund_status_log').insert({ refund_id: refundId, status, changed_at: new Date().toISOString(), changed_via: 'email_link' }).maybeSingle()

  return new NextResponse(html(`Refund marked as <strong>${status}</strong>. You can close this tab.`, 'success'), {
    headers: { 'Content-Type': 'text/html' }
  })
}

function html(message: string, type: 'success' | 'error') {
  const color = type === 'success' ? '#4caf80' : '#e06060'
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#1e1e1e;color:#f0ede8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
    <div style="text-align:center;padding:2rem;">
      <div style="font-size:48px;margin-bottom:1rem;">${type === 'success' ? '✓' : '✗'}</div>
      <h2 style="color:${color};">${message}</h2>
      <p style="color:#9aa0b4;">Buchman Brudner HR Portal</p>
    </div>
  </body></html>`
}
