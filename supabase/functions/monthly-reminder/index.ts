/**
 * Monthly Reminder — Supabase Edge Function
 * Scheduled via pg_cron to run on 25th of each month.
 * Sends reminder emails for refunds that are approved but not yet refunded.
 *
 * Setup in Supabase SQL:
 *   select cron.schedule('monthly-refund-reminder', '0 9 25 * *',
 *     $$select net.http_post(url:='https://[project].supabase.co/functions/v1/monthly-reminder',
 *       headers:='{"Authorization":"Bearer [service_role_key]"}'::jsonb) as request_id$$);
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@2'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const resend = new Resend(Deno.env.get('RESEND_API_KEY'))
const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') || 'https://portal.bb-eng.co.il'

Deno.serve(async (req) => {
  // Only allow from Supabase cron (internal)
  const auth = req.headers.get('Authorization')
  if (!auth?.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '')) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Get all approved-but-not-refunded requests
  const { data: pending } = await supabase
    .from('refund_requests')
    .select('*, profiles(full_name, email)')
    .eq('status', 'approved')

  if (!pending?.length) return Response.json({ sent: 0 })

  // Get managers
  const { data: managers } = await supabase.from('profiles').select('email, full_name').eq('role', 'manager')
  if (!managers?.length) return Response.json({ sent: 0 })

  let sent = 0
  for (const r of pending) {
    const emp = (r.profiles as any)?.full_name || 'Employee'
    const rows = pending.map(p => `<tr>
      <td style="padding:6px;border:1px solid #333;">${(p.profiles as any)?.full_name}</td>
      <td style="padding:6px;border:1px solid #333;">${p.title}</td>
      <td style="padding:6px;border:1px solid #333;font-weight:700;color:#C9A227;">${p.amount} ${p.currency}</td>
      <td style="padding:6px;border:1px solid #333;">${new Date(p.created_at).toLocaleDateString()}</td>
    </tr>`).join('')

    for (const manager of managers) {
      await resend.emails.send({
        from: 'BB-Eng HR Portal <office@bb-eng.co.il>',
        to: manager.email,
        subject: `⏰ Monthly Reminder: ${pending.length} refund(s) awaiting payment`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#1e1e1e;color:#f0ede8;border-radius:16px;overflow:hidden;">
          <div style="background:#1a1a1a;padding:20px 28px;border-bottom:2px solid #C9A227;">
            <div style="font-size:18px;font-weight:700;color:#C9A227;">BUCHMAN BRUDNER — Monthly Refund Reminder</div>
          </div>
          <div style="padding:28px;">
            <p>The following ${pending.length} refund request(s) have been approved but not yet refunded:</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
              <tr style="background:#2e2e2e;">
                <th style="padding:8px;border:1px solid #333;text-align:left;">Employee</th>
                <th style="padding:8px;border:1px solid #333;text-align:left;">Item</th>
                <th style="padding:8px;border:1px solid #333;text-align:left;">Amount</th>
                <th style="padding:8px;border:1px solid #333;text-align:left;">Date</th>
              </tr>
              ${rows}
            </table>
            <a href="${appUrl}/admin" style="display:inline-block;background:#C9A227;color:#1a1000;font-weight:700;padding:12px 24px;border-radius:10px;text-decoration:none;">
              Open Manager Portal →
            </a>
          </div>
        </div>`,
      })
      sent++
      break // one email per manager with full list
    }
    break // avoid duplicate emails per refund - already sent one with full list
  }

  return Response.json({ sent, pending: pending.length })
})
