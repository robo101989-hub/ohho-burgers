create table if not exists public.outlet_sales_sessions (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opened_by uuid references auth.users(id) on delete set null,
  closed_by uuid references auth.users(id) on delete set null,
  paid_order_count integer not null default 0,
  complimentary_order_count integer not null default 0,
  gross_sales numeric(12,2) not null default 0,
  cash_sales numeric(12,2) not null default 0,
  upi_sales numeric(12,2) not null default 0,
  card_sales numeric(12,2) not null default 0,
  complimentary_value numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  constraint outlet_sales_sessions_times_check check (closed_at is null or closed_at >= opened_at)
);

create unique index if not exists outlet_sales_sessions_one_open_per_outlet
  on public.outlet_sales_sessions (outlet_id)
  where closed_at is null;

create index if not exists outlet_sales_sessions_outlet_closed_at_idx
  on public.outlet_sales_sessions (outlet_id, closed_at desc);

alter table public.outlet_sales_sessions enable row level security;

drop policy if exists outlet_sales_sessions_admin_all on public.outlet_sales_sessions;
create policy outlet_sales_sessions_admin_all
  on public.outlet_sales_sessions
  for all
  to authenticated
  using (public.is_ohho_admin())
  with check (public.is_ohho_admin());
