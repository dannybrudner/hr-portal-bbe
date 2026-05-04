/**
 * GET /api/attachment-url?path=leave-attachments/xxx/file.pdf
 * Returns a short-lived signed URL for a private storage file.
 * Caller must be authenticated as the file owner or a manager.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  // Validate caller session via Authorization header
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

  // Check role
  const { data: profile } = await supabaseAdmin
    .from('profiles').select('role').eq('id', user.id).single()

  const path = req.nextUrl.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'Missing path' }, { status: 400 })

  // Employees can only access their own files (path contains their leaveRequestId)
  // Managers can access any file
  if (profile?.role !== 'manager') {
    // Verify the leave request belongs to the user
    const leaveId = path.split('/')[1] // leave-attachments/{leaveId}/file.pdf
    const { data: req_ } = await supabaseAdmin
      .from('leave_requests').select('user_id').eq('id', leaveId).single()
    if (req_?.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // Generate signed URL — valid for 60 minutes
  const { data, error } = await supabaseAdmin.storage
    .from('documents')
    .createSignedUrl(path, 3600)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ url: data.signedUrl })
}
