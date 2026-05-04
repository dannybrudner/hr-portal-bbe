import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  // Authenticate caller — must be the actual user whose hours are being logged
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { projectId, projectName, month, year, hours, notes } = body

  // Validate types and ranges
  if (!projectId || typeof projectId !== 'string') return NextResponse.json({ error: 'Invalid projectId' }, { status: 400 })
  if (!Number.isInteger(month) || month < 1 || month > 12) return NextResponse.json({ error: 'Invalid month' }, { status: 400 })
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
  if (typeof hours !== 'number' || hours < 0 || hours > 744) return NextResponse.json({ error: 'Invalid hours' }, { status: 400 })

  // Verify user is actually assigned to this project
  const { data: assignment } = await supabaseAdmin
    .from('project_assignments')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .single()

  if (!assignment) return NextResponse.json({ error: 'Not assigned to this project' }, { status: 403 })

  // Upsert to DB — use authenticated user's ID, never from request body
  const { error } = await supabaseAdmin.from('hour_logs').upsert({
    user_id: user.id,
    project_id: projectId,
    month, year,
    hours: Number(hours),
    notes: notes?.slice(0, 500) || '', // max 500 chars
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,project_id,month,year' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get employee name for Excel
  const { data: profile } = await supabaseAdmin
    .from('profiles').select('full_name').eq('id', user.id).single()
  const employeeName = profile?.full_name || user.email || ''

  // Async Excel rebuild — best-effort, DB is source of truth
  const workerUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/excel-worker`
  fetch(workerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'x-worker-secret': process.env.WORKER_SECRET || '',
    },
    body: JSON.stringify({ action: 'rebuild', projectId, projectName, employeeName }),
  }).catch(err => console.error('Excel worker:', err))

  return NextResponse.json({ ok: true })
}
