create table if not exists public.franchise_stock_requests (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  required_for date not null,
  status text not null default 'SUBMITTED' check (status in ('SUBMITTED','FULFILLED','CANCELLED')),
  notes text,
  bill_id uuid references public.supply_bills(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.franchise_stock_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.franchise_stock_requests(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  item_name text not null,
  unit text not null check (unit in ('KG','EACH')),
  quantity numeric(14,3) not null check (quantity > 0),
  fixed_unit_price numeric(12,2) not null default 0
);

create table if not exists public.daily_expenses (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  category text not null check (category in ('LOCAL_STOCK','TRANSPORT','UTILITIES','SALARY','MAINTENANCE','OTHER')),
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('CASH','UPI','BANK','CARD','OTHER')),
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists franchise_stock_requests_outlet_date_idx on public.franchise_stock_requests(outlet_id,required_for desc);
create index if not exists daily_expenses_outlet_date_idx on public.daily_expenses(outlet_id,occurred_at desc);

alter table public.franchise_stock_requests enable row level security;
alter table public.franchise_stock_request_items enable row level security;
alter table public.daily_expenses enable row level security;
revoke all on public.franchise_stock_requests,public.franchise_stock_request_items,public.daily_expenses from anon,authenticated;

alter table public.outlet_sales_reports add column if not exists stock_received_amount numeric(12,2) not null default 0;
alter table public.outlet_sales_reports add column if not exists other_expense_amount numeric(12,2) not null default 0;
alter table public.outlet_sales_reports add column if not exists total_expense_amount numeric(12,2) not null default 0;
alter table public.outlet_sales_reports add column if not exists net_after_expenses numeric(12,2) not null default 0;

create or replace function public.submit_franchise_stock_request(
  p_outlet_id uuid,p_required_for date,p_items jsonb,p_notes text,p_user uuid
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_request_id uuid:=gen_random_uuid();r record;
begin
  if p_required_for<current_date or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Select a valid date and at least one item';end if;
  insert into public.franchise_stock_requests(id,outlet_id,required_for,notes,created_by)
  values(v_request_id,p_outlet_id,p_required_for,nullif(trim(p_notes),''),p_user);
  for r in select * from jsonb_to_recordset(p_items) x(item_id uuid,item_name text,unit text,quantity numeric,fixed_unit_price numeric) loop
    if r.quantity<=0 or r.unit not in ('KG','EACH') then raise exception 'Invalid request item';end if;
    insert into public.franchise_stock_request_items(request_id,item_id,item_name,unit,quantity,fixed_unit_price)
    values(v_request_id,r.item_id,r.item_name,r.unit,r.quantity,r.fixed_unit_price);
  end loop;
  return v_request_id;
end; $$;

revoke all on function public.submit_franchise_stock_request(uuid,date,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.submit_franchise_stock_request(uuid,date,jsonb,text,uuid) to service_role;

update public.inventory_items set name='Cooking Oil Can',base_unit='EACH',display_unit='EACH',updated_at=now()
where sku='COOKING-OIL' and not exists(select 1 from public.inventory_movements m where m.item_id=inventory_items.id);
