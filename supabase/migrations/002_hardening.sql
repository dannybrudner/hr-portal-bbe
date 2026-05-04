-- Advisory lock helpers for Excel worker
CREATE OR REPLACE FUNCTION public.try_acquire_excel_lock()
RETURNS boolean AS $$
  SELECT pg_try_advisory_lock(42);
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.release_excel_lock()
RETURNS void AS $$
  SELECT pg_advisory_unlock(42);
$$ LANGUAGE sql SECURITY DEFINER;

-- Reminder idempotency log
CREATE TABLE IF NOT EXISTS public.reminder_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  month text NOT NULL,        -- "2026-05"
  type text NOT NULL,         -- "refund_reminder"
  sent integer DEFAULT 0,
  pending_count integer,
  errors jsonb,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(month, type)
);
ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reminder_log_manager" ON public.reminder_log FOR ALL USING (public.is_manager());

-- Add from_status to refund_status_log for complete audit trail
ALTER TABLE public.refund_status_log ADD COLUMN IF NOT EXISTS from_status text;
ALTER TABLE public.refund_status_log ADD COLUMN IF NOT EXISTS token_iat bigint;

-- Make documents bucket PRIVATE (leave attachments must not be public)
-- Run this manually in Storage settings or via:
UPDATE storage.buckets SET public = false WHERE id = 'documents';

-- Ensure leave attachment path is stored (not public URL)
-- The attachment_url column should store storage path, not full URL
-- Rename for clarity
ALTER TABLE public.leave_requests RENAME COLUMN attachment_url TO attachment_path;

SELECT 'hardening migrations done' as result;
