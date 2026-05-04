ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS attachment_url text DEFAULT '';

CREATE TABLE IF NOT EXISTS public.refund_status_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  refund_id uuid REFERENCES public.refund_requests(id) ON DELETE CASCADE,
  status text NOT NULL,
  changed_at timestamp with time zone DEFAULT now(),
  changed_via text DEFAULT 'ui'
);
ALTER TABLE public.refund_status_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "log_manager" ON public.refund_status_log FOR ALL USING (public.is_manager());

ALTER TABLE public.refund_requests DROP CONSTRAINT IF EXISTS refund_requests_status_check;
ALTER TABLE public.refund_requests ADD CONSTRAINT refund_requests_status_check
  CHECK (status IN ('pending','approved','denied','refunded'));

ALTER TABLE public.refund_requests ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

SELECT 'migrations done' as result;
