/**
 * Monthly Reminder — Supabase Edge Function
 * Sends ONE digest email per manager listing ALL approved-but-not-refunded requests.
 * Idempotency: checks reminder_sent_at to prevent duplicate sends within same calendar month.
 *
 * pg_cron setup (run once in Supabase SQL editor):
 *   SELECT cron.schedule(
 *     'monthly-refund-reminder',
 *     '0 9 25 * *',
 *     $$SELECT net.http_post(
 *       url := 'https://wxvcqykrwrqqosikfsnl.supabase.co/functions/v1/monthly-reminder',
 *       headers := '{"Authorization":"Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
 *     ) AS request_id$$
 *   );
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)
const resend = new Resend(Deno.env.get('RESEND_API_KEY'))
const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') || 'https://portal.bb-eng.co.il'

Deno.serve(async (req) => {
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ') || auth.slice(7) !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Idempotency: only send once per calendar month
  // Store last sent date in a simple kv table or check cron_log
  const thisMonth = new Date().toISOString().slice(0, 7) // "2026-05"
  const { data: existing } = await supabase
    .from('reminder_log')
    .select('id')
    .eq('month', thisMonth)
    .eq('type', 'refund_reminder')
    .maybeSingle()

  if (existing) {
    console.log(`Reminder already sent for ${thisMonth} — skipping`)
    return Response.json({ skipped: true, reason: 'already_sent_this_month' })
  }

  // Get all approved-but-not-refunded requests
  const { data: pending, error } = await supabase
    .from('refund_requests')
    .select('id, title, amount, currency, created_at, profiles(full_name, email)')
    .eq('status', 'approved')
    .order('created_at')

  if (error) {
    console.error('DB error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  if (!pending?.length) {
    // Log even the "nothing to do" run so we know it fired
    await supabase.from('reminder_log').insert({ month: thisMonth, type: 'refund_reminder', sent: 0 })
    return Response.json({ sent: 0, reason: 'no_pending_refunds' })
  }

  // Get managers
  const { data: managers } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('role', 'manager')

  if (!managers?.length) {
    return Response.json({ sent: 0, reason: 'no_managers' })
  }

  // Build table rows once
  const rows = pending.map(p => `
    <tr>
      <td style="padding:8px;border:1px solid #333;">${(p.profiles as any)?.full_name || '—'}</td>
      <td style="padding:8px;border:1px solid #333;">${p.title}</td>
      <td style="padding:8px;border:1px solid #333;font-weight:700;color:#C9A227;">${p.amount} ${p.currency}</td>
      <td style="padding:8px;border:1px solid #333;">${new Date(p.created_at).toLocaleDateString('en-IL')}</td>
    </tr>`).join('')

  const errors: string[] = []
  let sent = 0

  // Send one digest email per manager (separate emails, correct loop)
  for (const manager of managers) {
    try {
      await resend.emails.send({
        from: 'BB-Eng HR Portal <office@bb-eng.co.il>',
        to: manager.email,
        subject: `⏰ Monthly Reminder: ${pending.length} refund(s) awaiting payment`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;background:#1e1e1e;color:#f0ede8;border-radius:16px;overflow:hidden;">
          <div style="background:#1a1a1a;padding:20px 28px;border-bottom:2px solid #C9A227;">
            <div style="font-size:18px;font-weight:700;color:#C9A227;">BUCHMAN BRUDNER</div>
            <div style="font-size:11px;color:#888;letter-spacing:0.05em;">HR Portal — Monthly Refund Reminder</div>
          </div>
          <div style="padding:28px;">
            <p>Hi ${manager.full_name || 'Manager'},</p>
            <p>The following <strong>${pending.length}</strong> refund request(s) have been <strong style="color:#4caf80;">approved</strong> but not yet marked as refunded:</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
              <thead><tr style="background:#2e2e2e;">
                <th style="padding:8px;border:1px solid #333;text-align:left;">Employee</th>
                <th style="padding:8px;border:1px solid #333;text-align:left;">Item</th>
                <th style="padding:8px;border:1px solid #333;text-align:left;">Amount</th>
                <th style="padding:8px;border:1px solid #333;text-align:left;">Submitted</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
            <a href="${appUrl}/admin" style="display:inline-block;background:#C9A227;color:#1a1000;font-weight:700;padding:12px 24px;border-radius:10px;text-decoration:none;">
              Open Manager Portal →
            </a>
            <p style="margin-top:20px;font-size:12px;color:#5a5f6e;">This reminder is sent automatically on the 25th of each month.</p>
          </div>
        </div>`,
      })
      sent++
    } catch (e: any) {
      errors.push(`${manager.email}: ${e.message}`)
      console.error('Email failed for', manager.email, e)
    }
  }

  // Record that we ran this month — do this even if some emails failed
  await supabase.from('reminder_log').insert({
    month: thisMonth,
    type: 'refund_reminder',
    sent,
    pending_count: pending.length,
    errors: errors.length ? errors : null,
  })

  return Response.json({ sent, pending: pending.length, errors })
})
