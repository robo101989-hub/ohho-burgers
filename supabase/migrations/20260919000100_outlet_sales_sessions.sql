alter table public.outlets
  add column if not exists current_session_started_at timestamptz;

update public.outlets
set current_session_started_at = coalesce(current_session_started_at, updated_at, now())
where status = 'ACTIVE';

create table if not exists public.outlet_sales_reports (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  opened_at timestamptz not null,
  closed_at timestamptz not null,
  order_count integer not null default 0,
  item_count integer not null default 0,
  gross_sales numeric(12,2) not null default 0,
  cash_sales numeric(12,2) not null default 0,
  upi_sales numeric(12,2) not null default 0,
  card_sales numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique(outlet_id, opened_at)
);

create index if not exists idx_outlet_sales_reports_outlet_closed
  on public.outlet_sales_reports(outlet_id, closed_at desc);

alter table public.outlet_sales_reports enable row level security;

revoke all on table public.outlet_sales_reports from anon;
revoke all on table public.outlet_sales_reports from authenticated;

grant select on table public.outlet_sales_reports to authenticated;

drop policy if exists outlet_sales_reports_select_scoped on public.outlet_sales_reports;
create policy outlet_sales_reports_select_scoped
on public.outlet_sales_reports
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active is distinct from false
      and (
        p.role = 'ADMIN'
        or (
          p.role in ('OWNER','MANAGER')
          and exists (
            select 1
            from public.outlet_users ou
            where ou.user_id = p.id
              and ou.outlet_id = outlet_sales_reports.outlet_id
          )
        )
      )
  )
);
