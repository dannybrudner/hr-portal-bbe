/**
 * POST /api/register
 * Handles new employee self-registration server-side.
 *
 * Flow:
 * 1. Validate inputs
 * 2. Create Supabase auth user (triggers email confirmation)
 * 3. Create profile with approved=false
 * 4. Send manager approval request email with signed approve/reject links
 *
 * Why server-side: prevents client from setting role='manager' or approved=true
 * directly via the Supabase JS client insert.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sign } from 'jsonwebtoken'
import { Resend } from 'resend'
import { escapeHtml } from '@/lib/emailUtils'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY)
const jwtSecret = process.env.JWT_SECRET
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.bb-eng.co.il'

// Basic email sanity check — not a security boundary, Supabase validates properly
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  if (!jwtSecret) {
    console.error('[register] JWT_SECRET not set')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  let body: { email?: string; password?: string; fullName?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }

  const { email, password, fullName } = body

  // Input validation
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }
  if (!fullName || fullName.trim().length < 2) {
    return NextResponse.json({ error: 'Full name is required' }, { status: 400 })
  }

  const trimmedName = fullName.trim().slice(0, 100)
  const trimmedEmail = email.toLowerCase().trim()

  // Create auth user via admin API — this prevents clients from
  // calling supabase.auth.signUp() directly and bypassing profile creation
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: trimmedEmail,
    password,
    email_confirm: false, // requires email confirmation
  })

  if (authError) {
    // Map Supabase errors to user-safe messages
    const msg = authError.message.includes('already registered')
      ? 'An account with this email already exists.'
      : 'Registration failed. Please try again.'
    console.error('[register] auth create error:', authError.message)
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const userId = authData.user.id

  // Create profile — role forced to 'employee', approved forced to false
  // No client can override these values — only this server route creates profiles
  const initials = trimmedName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const { error: profileError } = await supabaseAdmin.from('profiles').insert({
    id: userId,
    email: trimmedEmail,
    full_name: trimmedName,
    role: 'employee',           // NEVER trust client for this
    approved: false,            // NEVER trust client for this
    avatar_initials: initials,
    phone: '', address: '',
    emergency_contact_name: '', emergency_contact_phone: '', bio: '',
  })

  if (profileError) {
    // Rollback: delete the auth user if profile creation fails
    await supabaseAdmin.auth.admin.deleteUser(userId)
    console.error('[register] profile insert error:', profileError.message)
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 })
  }

  // Send approval request to all managers
  await sendApprovalRequestEmail(userId, trimmedName, trimmedEmail)

  return NextResponse.json({ ok: true })
}

// ─── Manager approval email ──────────────────────────────────────────────────

async function sendApprovalRequestEmail(userId: string, fullName: string, email: string) {
  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 'placeholder') return

  const { data: managers } = await supabaseAdmin
    .from('profiles')
    .select('email, full_name')
    .eq('role', 'manager')
    .eq('approved', true)

  if (!managers?.length) {
    console.warn('[register] no approved managers found to notify')
    return
  }

  const now = new Date()
  const registeredAt = now.toLocaleString('en-GB', { timeZone: 'Asia/Jerusalem',
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  // Sign approve and reject tokens — 7-day expiry
  const makeToken = (action: string) =>
    sign({ userId, action }, jwtSecret!, { expiresIn: '7d' })

  for (const manager of managers) {
    const approveUrl = `${appUrl}/api/approve-employee?token=${makeToken('approved')}`
    const rejectUrl  = `${appUrl}/api/approve-employee?token=${makeToken('rejected')}`
    const managerName = escapeHtml(manager.full_name || 'Manager')
    const safeName = escapeHtml(fullName)
    const safeEmail = escapeHtml(email)

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>New Registration Request</title>
</head>
<body style="margin:0;padding:0;background:#f0ede8;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0ede8;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" style="max-width:560px;background:#1a1a1a;border-radius:20px;overflow:hidden;border:1px solid #2a2a2a;">

      <!-- Header -->
      <tr>
        <td style="background:#111;padding:20px 32px;border-bottom:3px solid #C9A227;text-align:center;">
          <img src="${appUrl}/logo.png" alt="Buchman Brudner" width="180" height="auto"
               style="display:block;margin:0 auto;max-width:180px;height:auto;" />
        </td>
      </tr>

      <!-- Title bar -->
      <tr>
        <td style="background:#1a1600;padding:20px 32px;border-bottom:1px solid #2a2a2a;">
          <div style="font-size:13px;color:#C9A227;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;">
            Action Required
          </div>
          <h2 style="margin:0;font-size:20px;color:#f0ede8;font-weight:700;">
            New Employee Registration Request
          </h2>
          <p style="margin:6px 0 0;font-size:13px;color:#9aa0b4;">
            Hi ${managerName}, a new employee has registered and is awaiting your approval.
          </p>
        </td>
      </tr>

      <!-- Employee details -->
      <tr>
        <td style="padding:28px 32px;">
          <div style="background:#222;border:1px solid #333;border-radius:14px;overflow:hidden;margin-bottom:24px;">
            <div style="background:#1e1e1e;padding:14px 20px;border-bottom:1px solid #333;">
              <span style="font-size:11px;font-weight:700;color:#C9A227;letter-spacing:0.08em;text-transform:uppercase;">
                Employee Details
              </span>
            </div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:8px 0;">
              <tr>
                <td style="padding:10px 20px;font-size:12px;color:#6a7080;width:130px;vertical-align:top;">Full Name</td>
                <td style="padding:10px 20px;font-size:14px;color:#f0ede8;font-weight:600;">${safeName}</td>
              </tr>
              <tr style="background:#1e1e1e;">
                <td style="padding:10px 20px;font-size:12px;color:#6a7080;vertical-align:top;">Email Address</td>
                <td style="padding:10px 20px;font-size:14px;color:#f0ede8;">${safeEmail}</td>
              </tr>
              <tr>
                <td style="padding:10px 20px;font-size:12px;color:#6a7080;vertical-align:top;">Registered</td>
                <td style="padding:10px 20px;font-size:14px;color:#9aa0b4;">${registeredAt} (Israel)</td>
              </tr>
              <tr style="background:#1e1e1e;">
                <td style="padding:10px 20px;font-size:12px;color:#6a7080;vertical-align:top;">Status</td>
                <td style="padding:10px 20px;">
                  <span style="background:#C9A22722;border:1px solid #C9A22766;border-radius:6px;padding:3px 10px;font-size:12px;color:#C9A227;font-weight:700;">
                    Pending Approval
                  </span>
                </td>
              </tr>
            </table>
          </div>

          <!-- Security notice -->
          <div style="background:#1a1200;border:1px solid #3a2a00;border-radius:10px;padding:14px 16px;margin-bottom:24px;">
            <div style="font-size:12px;color:#C9A227;font-weight:700;margin-bottom:4px;">⚠ Security Notice</div>
            <div style="font-size:12px;color:#9aa0b4;line-height:1.6;">
              Only approve employees you personally recognise and have authorised to join the portal.
              Each link expires in <strong style="color:#f0ede8;">7 days</strong> and can only be used once.
            </div>
          </div>

          <!-- Action buttons -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-right:8px;" width="50%">
                <a href="${approveUrl}"
                   style="display:block;text-align:center;background:#4caf80;color:#fff;font-weight:700;padding:14px 12px;border-radius:12px;text-decoration:none;font-size:15px;">
                  ✓ Approve Access
                </a>
              </td>
              <td style="padding-left:8px;" width="50%">
                <a href="${rejectUrl}"
                   style="display:block;text-align:center;background:#e06060;color:#fff;font-weight:700;padding:14px 12px;border-radius:12px;text-decoration:none;font-size:15px;">
                  ✗ Reject Registration
                </a>
              </td>
            </tr>
          </table>
          <p style="text-align:center;margin:16px 0 0;font-size:12px;color:#555;">
            Or manage all pending employees in the
            <a href="${appUrl}/admin" style="color:#C9A227;text-decoration:none;">Manager Portal</a>
          </p>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#111;padding:14px 32px;border-top:1px solid #2a2a2a;text-align:center;">
          <p style="margin:0;font-size:11px;color:#444;line-height:1.6;">
            This is an automated security notification from the Buchman Brudner HR Portal.<br>
            Do not share these links with anyone.
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`

    const text = `New Employee Registration Request\n\nHi ${manager.full_name},\n\n${fullName} (${email}) has registered on the HR Portal and is awaiting your approval.\n\nRegistered: ${registeredAt}\n\nAPPROVE: ${approveUrl}\nREJECT:  ${rejectUrl}\n\nThese links expire in 7 days and can only be used once.\n\nBuchman Brudner Engineering HR Portal`

    try {
      await resend.emails.send({
        from: 'Buchman Brudner HR <office@bb-eng.co.il>',
        to: manager.email,
        subject: `🔔 Approval Required: ${fullName} has registered`,
        html,
        text,
      })
    } catch (err) {
      console.error('[register] manager email error:', err)
    }
  }
}
