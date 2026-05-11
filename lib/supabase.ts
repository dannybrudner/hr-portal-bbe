import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Profile = {
  id: string
  email: string
  full_name: string
  phone: string
  address: string
  emergency_contact_name: string
  emergency_contact_phone: string
  bio: string
  role: 'employee' | 'manager'
  avatar_initials: string
  created_at: string
  // Extended fields
  first_name_he?: string
  last_name_he?: string
  first_name_en?: string
  last_name_en?: string
  private_email?: string
  birthday?: string
  profile_complete?: boolean
  id_number?: string
  approved?: boolean
  approved_at?: string
}

export type LeaveRequest = {
  id: string
  user_id: string
  leave_type: 'חופשה' | 'מחלה' | 'מילואים'
  start_date: string
  end_date: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  manager_note: string
  created_at: string
  archived: boolean
  attachment_path?: string
  profiles?: Profile
}

export type RefundRequest = {
  id: string
  user_id: string
  title: string
  amount: number
  currency: string
  category: string
  expense_date: string
  receipt_url: string
  notes: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export type Payslip = {
  id: string
  user_id: string
  file_url: string
  file_name: string
  month: number
  year: number
  uploaded_by: string
  created_at: string
}

export type TaxForm = {
  id: string
  user_id: string
  file_url: string
  file_name: string
  form_type: '101' | '106' | 'other'
  year: number
  created_at: string
}

export type Document = {
  id: string
  user_id: string
  file_url: string
  file_name: string
  folder: string
  created_at: string
}

export type Certificate = {
  id: string
  user_id: string
  name: string
  issued_by: string
  issue_date: string
  file_url: string
  created_at: string
}

export type EmployeeDocument = {
  id: string
  employee_id: string
  uploaded_by: string
  document_type: string
  file_name: string
  storage_path: string
  upload_date: string
  year: number
  quarter: number
  related_entity_id: string | null
  tags: string[]
  created_at: string
}

export type OfficeDay = {
  id: string
  user_id: string
  date: string
  created_at: string
  profiles?: Profile
}

export type CalendarEvent = {
  id: string
  title: string
  date: string
  created_by: string
  created_at: string
  updated_at?: string
  event_type?: 'company' | 'birthday' | 'holiday'
}
