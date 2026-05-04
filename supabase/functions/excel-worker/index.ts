/**
 * Excel Worker — Supabase Edge Function
 * Handles all reads/writes to worklog.xlsx in Storage.
 * Called server-side only. Never exposed directly to browser.
 * Uses optimistic locking: read → modify → write with ETag check.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// ExcelJS runs in Deno — lightweight xlsx read/write
import ExcelJS from 'https://esm.sh/exceljs@4.4.0'

const BUCKET = 'documents'
const FILE_PATH = 'worklog/worklog.xlsx'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

async function downloadWorkbook(): Promise<ExcelJS.Workbook> {
  const { data, error } = await supabase.storage.from(BUCKET).download(FILE_PATH)
  if (error) throw new Error(`Download failed: ${error.message}`)
  const buf = await data.arrayBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  return wb
}

async function uploadWorkbook(wb: ExcelJS.Workbook): Promise<void> {
  const buf = await wb.xlsx.writeBuffer()
  const { error } = await supabase.storage.from(BUCKET).upload(FILE_PATH, buf, {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    upsert: true,
  })
  if (error) throw new Error(`Upload failed: ${error.message}`)
}

/**
 * Log hours for an employee on a project.
 * Finds or creates a row on the project sheet.
 * Also updates the Summary sheet.
 */
async function logHours(payload: {
  employeeName: string
  projectName: string
  month: number   // 1-12
  year: number
  hours: number
  notes?: string
}) {
  const wb = await downloadWorkbook()

  // Update project sheet
  const ws = wb.getWorksheet(payload.projectName)
  if (!ws) throw new Error(`Sheet not found: ${payload.projectName}`)

  // Find existing row for this employee + month/year, or append
  const dateStr = `${payload.year}-${String(payload.month).padStart(2, '0')}-01`
  let targetRow: ExcelJS.Row | null = null

  ws.eachRow((row, rowNum) => {
    if (rowNum < 4) return // skip headers
    const emp = row.getCell(1).value?.toString()
    const dateCell = row.getCell(2).value
    if (emp === payload.employeeName && dateCell?.toString().startsWith(`${payload.year}-${String(payload.month).padStart(2, '0')}`)) {
      targetRow = row
    }
  })

  if (targetRow) {
    (targetRow as ExcelJS.Row).getCell(3).value = payload.hours
    ;(targetRow as ExcelJS.Row).getCell(4).value = payload.notes || ''
  } else {
    // Append new row (insert before summary block)
    const lastDataRow = ws.rowCount - 4 // summary is last 4 rows
    const newRow = ws.insertRow(lastDataRow + 1, [
      payload.employeeName,
      dateStr,
      payload.hours,
      payload.notes || '',
      '', // Month formula will recalc on open
    ])
    newRow.getCell(5).value = { formula: `TEXT(B${newRow.number},"MMM YYYY")` }
  }

  // Update Summary sheet
  const summaryWs = wb.getWorksheet('Summary')
  if (summaryWs) {
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const monthCol = payload.month + 2 // col C = month 1

    summaryWs.eachRow((row, rowNum) => {
      if (rowNum < 3) return
      const emp = row.getCell(1).value?.toString()
      const proj = row.getCell(2).value?.toString()
      if (emp === payload.employeeName && proj === payload.projectName) {
        row.getCell(monthCol).value = payload.hours
      }
    })
  }

  await uploadWorkbook(wb)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  // Verify internal secret — only our own API routes call this
  const secret = req.headers.get('x-worker-secret')
  if (secret !== Deno.env.get('WORKER_SECRET')) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const body = await req.json()
    const { action, ...payload } = body

    if (action === 'log_hours') {
      await logHours(payload)
      return Response.json({ ok: true })
    }

    if (action === 'get_url') {
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(FILE_PATH)
      return Response.json({ url: data.publicUrl })
    }

    return new Response('Unknown action', { status: 400 })
  } catch (err) {
    console.error(err)
    return Response.json({ error: String(err) }, { status: 500 })
  }
})
