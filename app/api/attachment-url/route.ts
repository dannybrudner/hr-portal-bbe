/**
 * GET /api/attachment-url?path=<storagePath>
 * Returns a short-lived signed URL for any private storage file.
 *
 * Access rules (server-side, cannot be bypassed client-side):
 * - Managers: access any file
 * - Employees: access only files where their user ID appears in the path
 *   (payslips/{userId}/..., docs/{userId}/..., leave-attachments/{leaveId}/...)
 *   For leave attachments, verifies leave request ownership via DB lookup.
 *
 * Uses service role key to generate signed URLs — bypasses Storage RLS.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
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

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('role').eq('id', user.id).single()

  const path = req.nextUrl.searchParams.get('path')
  if (!path || path.includes('..') || path.startsWith('/')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  // Managers can access any file — generate URL immediately
  if (profile?.role === 'manager') {
    const { data, error } = await supabaseAdmin.storage
      .from('documents').createSignedUrl(path, 3600)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ url: data.signedUrl })
  }

  // Employees: verify they own the file
  const segments = path.split('/')
  const prefix = segments[0] // e.g. 'payslips', 'docs', 'leave-attachments', 'taxforms'

  let allowed = false

  if (prefix === 'payslips' || prefix === 'docs' || prefix === 'taxforms') {
    // Path format: {prefix}/{userId}/...
    // Second segment is the owning user's ID
    allowed = segments[1] === user.id

  } else if (prefix === 'leave-attachments') {
    // Path format: leave-attachments/{leaveRequestId}/{filename}
    // Verify via DB that this leave request belongs to the user
    const leaveId = segments[1]
    const { data: lr } = await supabaseAdmin
      .from('leave_requests').select('user_id').eq('id', leaveId).single()
    allowed = lr?.user_id === user.id

  } else if (prefix === 'employee_documents' || prefix === 'certificates') {
    // Verify via employee_documents table
    const { data: doc } = await supabaseAdmin
      .from('employee_documents').select('employee_id').eq('storage_path', path).single()
    allowed = doc?.employee_id === user.id
  }

  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin.storage
    .from('documents').createSignedUrl(path, 3600)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ url: data.signedUrl })
}
