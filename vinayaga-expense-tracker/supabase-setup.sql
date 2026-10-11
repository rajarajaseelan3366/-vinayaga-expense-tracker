-- ============================================================
-- Vinayaga Construction - Expense Tracker: Supabase setup
-- Run this whole file once in Supabase Dashboard > SQL Editor.
-- Tables are prefixed et_ so they never clash with the
-- portfolio website tables (site_content, site_admins).
-- ============================================================

-- 1. Projects
create table if not exists public.et_projects (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  client_name     text not null,
  contract_amount numeric(14,2) not null default 0,
  created_at      timestamptz not null default now()
);

-- 2. Client payments (money in)
create table if not exists public.et_payments (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.et_projects(id) on delete cascade,
  amount     numeric(14,2) not null default 0,
  date       timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- 3. Expenses (money out)
create table if not exists public.et_expenses (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.et_projects(id) on delete cascade,
  amount     numeric(14,2) not null default 0,
  date       timestamptz not null default now(),
  category   text not null,
  note       text not null default '',
  created_at timestamptz not null default now()
);

-- 4. Row Level Security: enabled, with open policies for the
--    public (anon) role so the static site works without login.
--    NOTE: anyone holding the publishable key can read/write
--    these tables. Add login (Supabase Auth) later to lock down.
alter table public.et_projects enable row level security;
alter table public.et_payments enable row level security;
alter table public.et_expenses enable row level security;

drop policy if exists et_projects_anon_all on public.et_projects;
create policy et_projects_anon_all on public.et_projects
  for all to anon using (true) with check (true);

drop policy if exists et_payments_anon_all on public.et_payments;
create policy et_payments_anon_all on public.et_payments
  for all to anon using (true) with check (true);

drop policy if exists et_expenses_anon_all on public.et_expenses;
create policy et_expenses_anon_all on public.et_expenses
  for all to anon using (true) with check (true);

-- 5. Table privileges for the anon role (default grants usually
--    cover this, but explicit is safer).
grant select, insert, update, delete on public.et_projects to anon;
grant select, insert, update, delete on public.et_payments to anon;
grant select, insert, update, delete on public.et_expenses to anon;
