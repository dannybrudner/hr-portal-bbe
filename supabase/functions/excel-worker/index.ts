/**
 * Excel Worker — Supabase Edge Function
 * Excel is a REPORT ARTIFACT, not source of truth. Postgres is source of truth.
 * This function regenerates the Excel from DB data — no read-modify-write cycle,
 * so no race conditions or corruption risk.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import ExcelJS from 'https://esm.sh/exceljs@4.4.0'

const BUCKET = 'documents'
const FILE_PATH = 'worklog/worklog.xlsx'
// advisory lock key: 42

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

/**
 * Rebuild the Excel file from scratch using DB as source of truth.
 * Uses pg_try_advisory_lock to prevent concurrent rebuilds.
 * If lock is held, returns early — the in-flight rebuild will be current enough.
 */
async function rebuildWorkbook(projectId: string, projectName: string) {
  // Try to acquire advisory lock — non-blocking
  const { data: lockData } = await supabase.rpc('try_acquire_excel_lock')
  if (!lockData) {
    // Another rebuild in progress — skip, DB is already up to date
    console.log('Excel rebuild skipped: lock held by concurrent process')
    return
  }

  try {
    // Fetch all data for this project from DB (source of truth)
    const { data: logs, error } = await supabase
      .from('hour_logs')
      .select('*, profiles(full_name, email)')
      .eq('project_id', projectId)
      .order('year').order('month')

    if (error) throw error

    // Fetch summary: all projects × all employees
    const { data: allLogs } = await supabase
      .from('hour_logs')
      .select('project_id, user_id, month, year, hours, notes, projects(name), profiles(full_name)')

    const wb = new ExcelJS.Workbook()
    wb.creator = 'BB-Eng HR Portal'
    wb.created = new Date()

    const GOLD = 'C9A227'
    const DARK = '1E1E1E'
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

    // Project sheet
    const ws = wb.addWorksheet(projectName.slice(0, 31))
    ws.columns = [
      { header: 'Employee', key: 'emp', width: 26 },
      { header: 'Year', key: 'year', width: 8 },
      { header: 'Month', key: 'month', width: 10 },
      { header: 'Hours', key: 'hours', width: 8 },
      { header: 'Notes', key: 'notes', width: 40 },
    ]
    ws.getRow(1).font = { bold: true, color: { argb: 'FF' + GOLD } }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + DARK } }

    for (const log of logs || []) {
      ws.addRow({
        emp: (log.profiles as any)?.full_name || log.user_id,
        year: log.year,
        month: MONTHS[log.month - 1],
        hours: log.hours,
        notes: log.notes || '',
      })
    }

    // Summary sheet
    const ws2 = wb.addWorksheet('Summary')
    ws2.columns = [
      { header: 'Employee', key: 'emp', width: 26 },
      { header: 'Project', key: 'proj', width: 22 },
      { header: 'Year', key: 'year', width: 8 },
      { header: 'Month', key: 'month', width: 10 },
      { header: 'Hours', key: 'hours', width: 8 },
    ]
    ws2.getRow(1).font = { bold: true, color: { argb: 'FF' + GOLD } }
    ws2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + DARK } }

    for (const log of allLogs || []) {
      ws2.addRow({
        emp: (log.profiles as any)?.full_name || log.user_id,
        proj: (log.projects as any)?.name || log.project_id,
        year: log.year,
        month: MONTHS[log.month - 1],
        hours: log.hours,
      })
    }

    const buf = await wb.xlsx.writeBuffer()
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(FILE_PATH, buf, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true,
    })
    if (uploadError) throw uploadError
    console.log(`Excel rebuilt successfully for project: ${projectName}`)

  } finally {
    // Always release lock
    await supabase.rpc('release_excel_lock')
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const secret = req.headers.get('x-worker-secret')
  if (secret !== Deno.env.get('WORKER_SECRET')) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const body = await req.json()
    const { action, projectId, projectName } = body

    if (action === 'rebuild') {
      await rebuildWorkbook(projectId, projectName)
      return Response.json({ ok: true })
    }

    if (action === 'get_url') {
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(FILE_PATH)
      return Response.json({ url: data.publicUrl })
    }

    return new Response('Unknown action', { status: 400 })
  } catch (err) {
    console.error('Excel worker error:', err)
    return Response.json({ error: String(err) }, { status: 500 })
  }
})
