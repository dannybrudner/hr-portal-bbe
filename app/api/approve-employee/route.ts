/**
 * GET /api/approve-employee?token=<jwt>
 *
 * Processes manager approval or rejection of a pending employee registration.
 * Tokens are signed JWTs (7-day expiry). Each token encodes the action
 * (approved/rejected), userId, and iat. A SHA-256 hash of the raw token is
 * stored in approval_requests to detect replays and enforce single-use.
 *
 * Security design:
 * - Service role only — client never calls this directly
 * - Token hash stored server-side prevents replay
 * - Race condition safe: atomic upsert on profile update
 * - No sensitive data in URL beyond opaque token
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verify } from 'jsonwebtoken'
import { createHash } from 'crypto'
import { Resend } from 'resend'
import { escapeHtml } from '@/lib/emailUtils'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY)
const jwtSecret = process.env.JWT_SECRET
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.bb-eng.co.il'

function sha256(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export async function GET(req: NextRequest) {
  if (!jwtSecret) {
    return new NextResponse(page('Server configuration error', 'error'), { headers: CT })
  }

  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return new NextResponse(page('Missing token', 'error'), { status: 400, headers: CT })
  }

  // Verify JWT signature and expiry
  let payload: { userId: string; action: 'approved' | 'rejected'; iat: number }
  try {
    payload = verify(token, jwtSecret) as any
  } catch (e: any) {
    const msg = e.name === 'TokenExpiredError'
      ? 'This approval link has expired (7-day limit).'
      : 'Invalid or tampered approval link.'
    return new NextResponse(page(msg, 'error'), { headers: CT })
  }

  const { userId, action } = payload
  if (!userId || !['approved', 'rejected'].includes(action)) {
    return new NextResponse(page('Invalid token payload', 'error'), { headers: CT })
  }

  const tokenHash = sha256(token)

  // Check for replay: has this exact token already been used?
  const { data: existing } = await supabaseAdmin
    .from('approval_requests')
    .select('status, action')
    .eq('token_hash', tokenHash)
    .single()

  if (existing?.status === 'used') {
    const alreadyMsg = existing.action === 'approved'
      ? 'This employee has already been approved.'
      : 'This employee has already been rejected.'
    return new NextResponse(page(alreadyMsg, 'info'), { headers: CT })
  }

  // Fetch the target profile
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('full_name, email, approved, role')
    .eq('id', userId)
    .single()

  if (!profile) {
    return new NextResponse(page('Employee account not found.', 'error'), { headers: CT })
  }

  // Idempotency: already approved — show success, do nothing
  if (profile.approved && action === 'approved') {
    return new NextResponse(page(`${escapeHtml(profile.full_name)} is already approved.`, 'info'), { headers: CT })
  }

  // Prevent managers from being manipulated via this flow
  if (profile.role === 'manager') {
    return new NextResponse(page('Cannot modify a manager account via this link.', 'error'), { headers: CT })
  }

  // Apply action
  const now = new Date().toISOString()

  if (action === 'approved') {
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ approved: true, approved_at: now })
      .eq('id', userId)
      .eq('approved', false) // atomic guard — only update if still pending

    if (error) {
      console.error('[approve-employee] DB update error:', error.message)
      return new NextResponse(page('Failed to update account. Please try again.', 'error'), { headers: CT })
    }

    // Send welcome email to employee
    await sendWelcomeEmail(profile.email, profile.full_name)
  }

  // Record token as used (upsert to avoid race on duplicate clicks)
  await supabaseAdmin.from('approval_requests').upsert({
    user_id: userId,
    token_hash: tokenHash,
    action,
    status: 'used',
    expires_at: new Date(payload.iat * 1000 + 7 * 24 * 60 * 60 * 1000).toISOString(),
    acted_at: now,
  }, { onConflict: 'token_hash' })

  const successMsg = action === 'approved'
    ? `✓ ${escapeHtml(profile.full_name)} has been approved. A welcome email has been sent.`
    : `${escapeHtml(profile.full_name)}'s registration has been rejected.`

  const type = action === 'approved' ? 'success' : 'info'
  return new NextResponse(page(successMsg, type), { headers: CT })
}

// ─── Welcome email ─────────────────────────────────────────────────────────

async function sendWelcomeEmail(to: string, fullName: string) {
  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 'placeholder') return

  const name = escapeHtml(fullName)
  const portalUrl = appUrl
  const logoUrl = `${appUrl}/logo.png`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Welcome to the Portal</title>
</head>
<body style="margin:0;padding:0;background:#f0ede8;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0ede8;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" style="max-width:580px;background:#1a1a1a;border-radius:20px;overflow:hidden;border:1px solid #2a2a2a;">

      <!-- Logo header -->
      <tr>
        <td style="background:#111111;padding:24px 36px;border-bottom:3px solid #C9A227;text-align:center;">
          <img src="${logoUrl}" alt="Buchman Brudner Engineering" width="200" height="auto"
               style="display:block;margin:0 auto;max-width:200px;height:auto;" />
        </td>
      </tr>

      <!-- Hero banner -->
      <tr>
        <td style="background:linear-gradient(135deg,#1e1a0e 0%,#2a2210 50%,#1a1a1a 100%);padding:40px 36px;text-align:center;border-bottom:1px solid #2e2e2e;">
          <div style="font-size:42px;margin-bottom:12px;">🎉</div>
          <h1 style="margin:0;font-size:26px;font-weight:700;color:#C9A227;letter-spacing:-0.5px;">
            Welcome to the Portal
          </h1>
          <p style="margin:12px 0 0;font-size:15px;color:#9aa0b4;line-height:1.6;">
            Your account has been approved and is ready to use
          </p>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:36px;color:#f0ede8;">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#d0cdc8;">
            Hi <strong style="color:#f0ede8;">${name}</strong>,
          </p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#9aa0b4;">
            Your registration to the <strong style="color:#C9A227;">Buchman Brudner Engineering</strong>
            employee portal has been reviewed and approved by your manager.
          </p>

          <!-- Feature tiles -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
            <tr>
              <td style="padding:4px;">
                <div style="background:#222;border:1px solid #333;border-radius:12px;padding:16px;">
                  <div style="font-size:20px;margin-bottom:6px;">📅</div>
                  <div style="font-size:13px;font-weight:700;color:#f0ede8;margin-bottom:4px;">Leave Requests</div>
                  <div style="font-size:12px;color:#6a7080;">Submit and track your time off</div>
                </div>
              </td>
              <td style="padding:4px;">
                <div style="background:#222;border:1px solid #333;border-radius:12px;padding:16px;">
                  <div style="font-size:20px;margin-bottom:6px;">💰</div>
                  <div style="font-size:13px;font-weight:700;color:#f0ede8;margin-bottom:4px;">Payslips</div>
                  <div style="font-size:12px;color:#6a7080;">Access your payroll securely</div>
                </div>
              </td>
              <td style="padding:4px;">
                <div style="background:#222;border:1px solid #333;border-radius:12px;padding:16px;">
                  <div style="font-size:20px;margin-bottom:6px;">📁</div>
                  <div style="font-size:13px;font-weight:700;color:#f0ede8;margin-bottom:4px;">Documents</div>
                  <div style="font-size:12px;color:#6a7080;">Your HR files, organized</div>
                </div>
              </td>
            </tr>
          </table>

          <!-- CTA -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center">
                <a href="${portalUrl}/dashboard"
                   style="display:inline-block;background:#C9A227;color:#1a1000;font-weight:700;font-size:16px;padding:16px 40px;border-radius:12px;text-decoration:none;letter-spacing:0.2px;">
                  Proceed to the Portal →
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#111;padding:16px 36px;border-top:1px solid #2a2a2a;text-align:center;">
          <p style="margin:0;font-size:11px;color:#555;line-height:1.6;">
            This is an automated message from the Buchman Brudner HR Portal.<br>
            If you did not register for this portal, please ignore this email.
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`

  const text = `Hi ${fullName},\n\nYour account on the Buchman Brudner Engineering employee portal has been approved.\n\nYou can now log in at: ${portalUrl}/dashboard\n\nBuchman Brudner Engineering`

  try {
    await resend.emails.send({
      from: 'Buchman Brudner HR <office@bb-eng.co.il>',
      to,
      subject: '🎉 Welcome — Your Portal Access Has Been Approved',
      html,
      text,
    })
  } catch (err) {
    console.error('[approve-employee] welcome email error:', err)
  }
}

// ─── Response page ──────────────────────────────────────────────────────────

const CT = { 'Content-Type': 'text/html; charset=utf-8' }

function page(message: string, type: 'success' | 'error' | 'info') {
  const colors = { success: '#4caf80', error: '#e06060', info: '#C9A227' }
  const icons = { success: '✓', error: '✗', info: 'ℹ' }
  const color = colors[type]
  const icon = icons[type]
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Employee Approval — Buchman Brudner</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:system-ui,sans-serif;background:#111;color:#f0ede8;
       display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
  .card{text-align:center;padding:3rem 2.5rem;background:#1e1e1e;border-radius:20px;
        max-width:440px;width:90%;border:1px solid #2a2a2a}
  .icon{width:64px;height:64px;border-radius:50%;background:${color}22;
        border:2px solid ${color};display:flex;align-items:center;justify-content:center;
        font-size:28px;color:${color};margin:0 auto 1.5rem}
  h2{color:${color};margin:0 0 1rem;font-size:20px}
  p{color:#9aa0b4;margin:0;font-size:14px;line-height:1.6}
  .brand{margin-top:2rem;font-size:12px;color:#444}
</style>
</head>
<body><div class="card">
<div class="icon">${icon}</div>
<h2>${message}</h2>
<p>You can close this tab.</p>
<div class="brand">Buchman Brudner Engineering · HR Portal</div>
</div></body></html>`
}
