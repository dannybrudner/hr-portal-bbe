import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { userId, projectId, projectName, employeeName, month, year, hours, notes } = await req.json()
  if (!userId || !projectId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const { error } = await supabaseAdmin.from('hour_logs').upsert({
    user_id: userId, project_id: projectId, month, year, hours, notes,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,project_id,month,year' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Async: update Excel file via edge function (best-effort)
  const workerUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/excel-worker`
  fetch(workerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'x-worker-secret': process.env.WORKER_SECRET || '',
    },
    body: JSON.stringify({ action: 'log_hours', employeeName, projectName, month, year, hours, notes }),
  }).catch(console.error)

  return NextResponse.json({ ok: true })
}
