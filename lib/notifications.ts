import { supabase } from './supabase'

export type Notification = {
  id: string
  user_id: string
  title: string
  message: string
  type: 'leave_approved' | 'leave_rejected' | 'leave_new' | 'payslip' | 'general'
  read: boolean
  link: string
  created_at: string
}

export async function createNotification(
  userId: string,
  title: string,
  message: string,
  type: Notification['type'],
  link: string = ''
) {
  await supabase.from('notifications').insert({ user_id: userId, title, message, type, link, read: false })
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false)
  return count || 0
}

export async function markAllRead(userId: string) {
  await supabase.from('notifications').update({ read: true }).eq('user_id', userId)
}
