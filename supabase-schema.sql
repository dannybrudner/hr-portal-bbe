-- =============================================
-- HR Portal — Complete Supabase Schema
-- Run this in your Supabase SQL Editor
-- =============================================

-- 1. PROFILES (extends auth.users)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  full_name text default '',
  phone text default '',
  address text default '',
  emergency_contact_name text default '',
  emergency_contact_phone text default '',
  bio text default '',
  role text default 'employee' check (role in ('employee', 'manager')),
  avatar_initials text default '',
  created_at timestamp with time zone default now()
);

-- 2. LEAVE REQUESTS
create table if not exists public.leave_requests (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  leave_type text not null check (leave_type in ('חופשה', 'מחלה', 'מילואים')),
  start_date date not null,
  end_date date not null,
  reason text default '',
  status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  manager_note text default '',
  created_at timestamp with time zone default now()
);

-- 3. REFUND REQUESTS
create table if not exists public.refund_requests (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  amount numeric not null,
  currency text default 'ILS',
  category text not null,
  expense_date date not null,
  receipt_url text default '',
  notes text default '',
  status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamp with time zone default now()
);

-- 4. PAYSLIPS
create table if not exists public.payslips (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  file_url text not null,
  file_name text not null,
  month integer not null check (month between 1 and 12),
  year integer not null,
  uploaded_by uuid references public.profiles(id),
  created_at timestamp with time zone default now()
);

-- 5. TAX FORMS
create table if not exists public.tax_forms (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  file_url text not null,
  file_name text not null,
  form_type text not null check (form_type in ('101', '106', 'other')),
  year integer not null,
  created_at timestamp with time zone default now()
);

-- 6. DOCUMENTS
create table if not exists public.documents (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  file_url text not null,
  file_name text not null,
  folder text default 'General',
  created_at timestamp with time zone default now()
);

-- 7. CERTIFICATES
create table if not exists public.certificates (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  issued_by text default '',
  issue_date date,
  file_url text default '',
  created_at timestamp with time zone default now()
);

-- 8. OFFICE DAYS (who is in office each day - public to all)
create table if not exists public.office_days (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  date date not null,
  created_at timestamp with time zone default now(),
  unique(user_id, date)
);

-- 9. CALENDAR EVENTS (company events, manager-created)
create table if not exists public.calendar_events (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  date date not null,
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default now()
);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

alter table public.profiles enable row level security;
alter table public.leave_requests enable row level security;
alter table public.refund_requests enable row level security;
alter table public.payslips enable row level security;
alter table public.tax_forms enable row level security;
alter table public.documents enable row level security;
alter table public.certificates enable row level security;
alter table public.office_days enable row level security;
alter table public.calendar_events enable row level security;

-- Profiles: users see own, managers see all
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Managers can view all profiles" on public.profiles for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'manager')
);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- Leave requests: own + managers
create policy "Users see own leave requests" on public.leave_requests for select using (auth.uid() = user_id);
create policy "Managers see all leave requests" on public.leave_requests for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'manager')
);
create policy "Users insert own leave requests" on public.leave_requests for insert with check (auth.uid() = user_id);
create policy "Managers update leave requests" on public.leave_requests for update using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'manager')
);

-- Refunds: own only
create policy "Users manage own refunds" on public.refund_requests for all using (auth.uid() = user_id);
create policy "Managers see all refunds" on public.refund_requests for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'manager')
);

-- Payslips: own view, manager manage
create policy "Users see own payslips" on public.payslips for select using (auth.uid() = user_id);
create policy "Managers manage all payslips" on public.payslips for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'manager')
);

-- Tax forms: own view, manager manage
create policy "Users see own tax forms" on public.tax_forms for select using (auth.uid() = user_id);
create policy "Managers manage all tax forms" on public.tax_forms for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'manager')
);

-- Documents: own
create policy "Users manage own documents" on public.documents for all using (auth.uid() = user_id);

-- Certificates: own
create policy "Users manage own certificates" on public.certificates for all using (auth.uid() = user_id);

-- Office days: all authenticated users can see all (public by design), but only manage own
create policy "All users see office days" on public.office_days for select using (auth.role() = 'authenticated');
create policy "Users manage own office days" on public.office_days for insert with check (auth.uid() = user_id);
create policy "Users delete own office days" on public.office_days for delete using (auth.uid() = user_id);

-- Calendar events: all can see, managers create/delete
create policy "All users see calendar events" on public.calendar_events for select using (auth.role() = 'authenticated');
create policy "Managers manage calendar events" on public.calendar_events for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'manager')
);

-- =============================================
-- STORAGE BUCKETS
-- Run these in Supabase Storage settings or SQL
-- =============================================
-- Create a bucket called 'documents' with public access
-- insert into storage.buckets (id, name, public) values ('documents', 'documents', true);

-- Storage policies (run after creating bucket)
-- create policy "Auth users upload" on storage.objects for insert with check (auth.role() = 'authenticated');
-- create policy "Public read" on storage.objects for select using (bucket_id = 'documents');
-- create policy "Users delete own" on storage.objects for delete using (auth.uid()::text = (storage.foldername(name))[2]);

-- =============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role, avatar_initials)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'employee',
    upper(left(coalesce(new.raw_user_meta_data->>'full_name', new.email), 2))
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
