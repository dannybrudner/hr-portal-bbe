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
 * Returns null on error.
 */
export async function getSignedUrl(storagePath: string, expiresInSeconds = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(storagePath, expiresInSeconds)
  if (error) { console.error('[documentService] signedUrl error:', error); return null }
  return data.signedUrl
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
