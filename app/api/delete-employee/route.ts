import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service role bypasses RLS — only callable server-side, auth-gated
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function DELETE(req: NextRequest) {
  // Verify caller is an authenticated manager
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

  const { data: callerProfile } = await supabaseAdmin
    .from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden — managers only' }, { status: 403 })
  }

  const { employeeId } = await req.json()
  if (!employeeId || typeof employeeId !== 'string') {
    return NextResponse.json({ error: 'Missing employeeId' }, { status: 400 })
  }
  // Prevent self-deletion
  if (employeeId === user.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }

  // Verify target exists and is not a manager
  const { data: target } = await supabaseAdmin
    .from('profiles').select('role, full_name').eq('id', employeeId).single()
  if (!target) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  if (target.role === 'manager') {
    return NextResponse.json({ error: 'Cannot delete another manager account' }, { status: 403 })
  }

  // Delete in dependency order using service role (bypasses RLS)
  const tables: Array<{ table: string; col: string }> = [
    { table: 'leave_requests',    col: 'user_id' },
    { table: 'refund_requests',   col: 'user_id' },
    { table: 'payslips',          col: 'user_id' },
    { table: 'tax_forms',         col: 'user_id' },
    { table: 'certificates',      col: 'user_id' },
    { table: 'hour_logs',         col: 'user_id' },
    { table: 'project_assignments', col: 'user_id' },
    { table: 'office_days',       col: 'user_id' },
    { table: 'notifications',     col: 'user_id' },
    { table: 'employee_documents', col: 'employee_id' },
  ]

  for (const { table, col } of tables) {
    const { error } = await supabaseAdmin.from(table).delete().eq(col, employeeId)
    if (error) console.error(`[delete-employee] ${table}:`, error.message)
  }

  // Delete birthday calendar events
  await supabaseAdmin.from('calendar_events')
    .delete().eq('created_by', employeeId).eq('event_type', 'birthday')

  // Delete the profile row
  const { error: profileErr } = await supabaseAdmin
    .from('profiles').delete().eq('id', employeeId)
  if (profileErr) {
    console.error('[delete-employee] profiles:', profileErr.message)
    return NextResponse.json({ error: profileErr.message }, { status: 500 })
  }

  // Optionally delete Supabase Auth user (requires service role)
  const { error: authDeleteErr } = await supabaseAdmin.auth.admin.deleteUser(employeeId)
  if (authDeleteErr) console.error('[delete-employee] auth user:', authDeleteErr.message)
  // Non-fatal — profile row deleted is the important part

  console.log(`[delete-employee] ${target.full_name} (${employeeId}) deleted by manager ${user.id}`)
  return NextResponse.json({ ok: true, deleted: target.full_name })
}
