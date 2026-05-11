/**
 * Centralized Document Service
 * ALL file uploads across the platform must go through registerDocument()
 * so every file appears in the Documents section under Year → Quarter.
 */
import { supabase } from './supabase'

export type DocumentType =
  | 'leave_attachment'
  | 'sick_note'
  | 'certificate'
  | 'payslip'
  | 'tax_form'
  | 'general'
  | 'hr_document'

export interface RegisterDocumentParams {
  employeeId: string
  uploadedBy: string
  documentType: DocumentType
  fileName: string
  storagePath: string
  relatedEntityId?: string
  tags?: string[]
}

function getQuarter(date: Date): number {
  return Math.ceil((date.getMonth() + 1) / 3)
}

/**
 * Register any uploaded file into the centralized documents table.
 * Returns the created document record ID.
 */
export async function registerDocument(params: RegisterDocumentParams): Promise<string | null> {
  const now = new Date()
  const { data, error } = await supabase
    .from('employee_documents')
    .insert({
      employee_id: params.employeeId,
      uploaded_by: params.uploadedBy,
      document_type: params.documentType,
      file_name: params.fileName,
      storage_path: params.storagePath,
      upload_date: now.toISOString(),
      year: now.getFullYear(),
      quarter: getQuarter(now),
      related_entity_id: params.relatedEntityId || null,
      tags: params.tags || [],
    })
    .select('id')
    .single()

  if (error) {
    console.error('[documentService] register error:', error)
    return null
  }
  return data.id
}

/**
 * Get a signed URL for a private storage file.
 * Routes through /api/attachment-url which uses the service role key,
 * so managers can access any employee's files regardless of ownership.
 * Falls back to the anon client for legacy/public URLs.
 */
export async function getSignedUrl(storagePath: string, expiresInSeconds = 3600): Promise<string | null> {
  // Use the server-side route which uses service role — works for managers and employees
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return null

    const params = new URLSearchParams({ path: storagePath })
    const res = await fetch(`/api/attachment-url?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      console.error('[documentService] attachment-url error:', res.status, await res.text())
      return null
    }
    const { url } = await res.json()
    return url ?? null
  } catch (err) {
    console.error('[documentService] signedUrl error:', err)
    return null
  }
}

/**
 * Upload a file to Supabase Storage and register it in employee_documents.
 * This is the single entry point for all uploads.
 */
export async function uploadAndRegister(
  file: File,
  storagePath: string,
  params: RegisterDocumentParams
): Promise<{ storagePath: string; documentId: string | null } | null> {
  const { error } = await supabase.storage
    .from('documents')
    .upload(storagePath, file, { upsert: false })

  if (error) {
    console.error('[documentService] upload error:', error)
    return null
  }

  const documentId = await registerDocument({ ...params, storagePath })
  return { storagePath, documentId }
}
