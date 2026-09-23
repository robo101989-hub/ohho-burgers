create sequence if not exists public.supply_bill_number_seq start 1;

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  base_unit text not null check (base_unit in ('G','ML','EACH')),
  display_unit text not null check (display_unit in ('G','KG','ML','L','EACH')),
  low_stock_threshold numeric(14,3) not null default 0 check (low_stock_threshold >= 0),
  default_supply_price numeric(12,2) not null default 0 check (default_supply_price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.outlet_inventory (
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  quantity_on_hand numeric(14,3) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (outlet_id,item_id)
);

create table if not exists public.supply_bills (
  id uuid primary key default gen_random_uuid(),
  bill_number text not null unique,
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  status text not null default 'ISSUED' check (status in ('DRAFT','ISSUED','VOID')),
  payment_status text not null default 'UNPAID' check (payment_status in ('UNPAID','PARTIAL','PAID')),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  notes text,
  supplied_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supply_bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.supply_bills(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  item_name text not null,
  unit text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  base_quantity numeric(14,3) not null check (base_quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  movement_type text not null check (movement_type in ('STOCK_RECEIVED','USAGE','WASTE','ADJUSTMENT','SALE_DEDUCTION','REVERSAL')),
  quantity_delta numeric(14,3) not null check (quantity_delta <> 0),
  balance_after numeric(14,3) not null,
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid references auth.users(id),
  occurred_at timestamptz not null default now()
);

create table if not exists public.supply_bill_payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.supply_bills(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('CASH','UPI','BANK','OTHER')),
  reference text,
  paid_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  counted_at timestamptz not null default now(),
  notes text,
  created_by uuid references auth.users(id)
);

create table if not exists public.stock_count_items (
  id uuid primary key default gen_random_uuid(),
  stock_count_id uuid not null references public.stock_counts(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  expected_quantity numeric(14,3) not null,
  actual_quantity numeric(14,3) not null,
  variance numeric(14,3) generated always as (actual_quantity - expected_quantity) stored
);

create table if not exists public.menu_item_recipes (
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  base_quantity numeric(14,3) not null check (base_quantity > 0),
  primary key (menu_item_id,inventory_item_id)
);

create index if not exists inventory_movements_outlet_date_idx on public.inventory_movements(outlet_id,occurred_at desc);
create index if not exists supply_bills_outlet_date_idx on public.supply_bills(outlet_id,supplied_at desc);
create index if not exists supply_bill_items_bill_idx on public.supply_bill_items(bill_id);
create index if not exists supply_bill_payments_bill_idx on public.supply_bill_payments(bill_id);

alter table public.inventory_items enable row level security;
alter table public.outlet_inventory enable row level security;
alter table public.supply_bills enable row level security;
alter table public.supply_bill_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.supply_bill_payments enable row level security;
alter table public.stock_counts enable row level security;
alter table public.stock_count_items enable row level security;
alter table public.menu_item_recipes enable row level security;

revoke all on public.inventory_items, public.outlet_inventory, public.supply_bills, public.supply_bill_items,
  public.inventory_movements, public.supply_bill_payments, public.stock_counts, public.stock_count_items,
  public.menu_item_recipes from anon, authenticated;

grant select on public.inventory_items, public.outlet_inventory, public.supply_bills, public.supply_bill_items,
  public.inventory_movements, public.supply_bill_payments, public.stock_counts, public.stock_count_items,
  public.menu_item_recipes to authenticated;

create or replace function public.inventory_scope_allowed(target_outlet uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.profiles p
    where p.id=auth.uid() and p.is_active=true and (
      p.role='ADMIN' or exists (
        select 1 from public.outlet_users ou where ou.user_id=p.id and ou.outlet_id=target_outlet
      )
    )
  );
$$;
revoke all on function public.inventory_scope_allowed(uuid) from public,anon;
grant execute on function public.inventory_scope_allowed(uuid) to authenticated,service_role;

drop policy if exists inventory_items_read on public.inventory_items;
create policy inventory_items_read on public.inventory_items for select to authenticated using (
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active=true)
);
drop policy if exists outlet_inventory_read on public.outlet_inventory;
create policy outlet_inventory_read on public.outlet_inventory for select to authenticated using (public.inventory_scope_allowed(outlet_id));
drop policy if exists supply_bills_read on public.supply_bills;
create policy supply_bills_read on public.supply_bills for select to authenticated using (public.inventory_scope_allowed(outlet_id));
drop policy if exists supply_bill_items_read on public.supply_bill_items;
create policy supply_bill_items_read on public.supply_bill_items for select to authenticated using (
  exists(select 1 from public.supply_bills b where b.id=bill_id and public.inventory_scope_allowed(b.outlet_id))
);
drop policy if exists inventory_movements_read on public.inventory_movements;
create policy inventory_movements_read on public.inventory_movements for select to authenticated using (public.inventory_scope_allowed(outlet_id));
drop policy if exists supply_bill_payments_read on public.supply_bill_payments;
create policy supply_bill_payments_read on public.supply_bill_payments for select to authenticated using (
  exists(select 1 from public.supply_bills b where b.id=bill_id and public.inventory_scope_allowed(b.outlet_id))
);

create or replace function public.issue_supply_bill(
  p_outlet_id uuid, p_items jsonb, p_notes text, p_supplied_at timestamptz, p_user uuid
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_bill_id uuid := gen_random_uuid(); v_bill_number text; v_total numeric(12,2); r record; v_balance numeric(14,3);
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'Supply bill requires at least one item'; end if;
  v_bill_number := 'OHHO-SUP-' || to_char(coalesce(p_supplied_at,now()),'YYYYMMDD') || '-' || lpad(nextval('public.supply_bill_number_seq')::text,5,'0');
  select coalesce(sum((x.quantity::numeric)*(x.unit_price::numeric)),0) into v_total
  from jsonb_to_recordset(p_items) x(item_id uuid,item_name text,unit text,quantity numeric,base_quantity numeric,unit_price numeric);
  insert into public.supply_bills(id,bill_number,outlet_id,total_amount,notes,supplied_at,created_by)
  values(v_bill_id,v_bill_number,p_outlet_id,v_total,nullif(trim(p_notes),''),coalesce(p_supplied_at,now()),p_user);
  for r in select * from jsonb_to_recordset(p_items) x(item_id uuid,item_name text,unit text,quantity numeric,base_quantity numeric,unit_price numeric) loop
    if r.quantity<=0 or r.base_quantity<=0 or r.unit_price<0 then raise exception 'Invalid bill item'; end if;
    insert into public.supply_bill_items(bill_id,item_id,item_name,unit,quantity,base_quantity,unit_price,line_total)
    values(v_bill_id,r.item_id,r.item_name,r.unit,r.quantity,r.base_quantity,r.unit_price,round(r.quantity*r.unit_price,2));
    insert into public.outlet_inventory(outlet_id,item_id,quantity_on_hand,updated_at)
    values(p_outlet_id,r.item_id,r.base_quantity,now())
    on conflict(outlet_id,item_id) do update set quantity_on_hand=public.outlet_inventory.quantity_on_hand+excluded.quantity_on_hand,updated_at=now()
    returning quantity_on_hand into v_balance;
    insert into public.inventory_movements(outlet_id,item_id,movement_type,quantity_delta,balance_after,reference_type,reference_id,notes,created_by,occurred_at)
    values(p_outlet_id,r.item_id,'STOCK_RECEIVED',r.base_quantity,v_balance,'SUPPLY_BILL',v_bill_id,p_notes,p_user,coalesce(p_supplied_at,now()));
  end loop;
  return v_bill_id;
end; $$;

create or replace function public.adjust_outlet_inventory(
  p_outlet_id uuid,p_item_id uuid,p_delta numeric,p_type text,p_notes text,p_user uuid
) returns numeric language plpgsql security definer set search_path=public as $$
declare v_current numeric(14,3); v_next numeric(14,3);
begin
  if p_delta=0 or p_type not in ('USAGE','WASTE','ADJUSTMENT') then raise exception 'Invalid stock adjustment'; end if;
  insert into public.outlet_inventory(outlet_id,item_id,quantity_on_hand) values(p_outlet_id,p_item_id,0)
  on conflict(outlet_id,item_id) do nothing;
  select quantity_on_hand into v_current from public.outlet_inventory where outlet_id=p_outlet_id and item_id=p_item_id for update;
  v_next := v_current+p_delta;
  if v_next<0 then raise exception 'Adjustment exceeds available stock'; end if;
  update public.outlet_inventory set quantity_on_hand=v_next,updated_at=now() where outlet_id=p_outlet_id and item_id=p_item_id;
  insert into public.inventory_movements(outlet_id,item_id,movement_type,quantity_delta,balance_after,notes,created_by)
  values(p_outlet_id,p_item_id,p_type,p_delta,v_next,nullif(trim(p_notes),''),p_user);
  return v_next;
end; $$;

create or replace function public.record_supply_payment(
  p_bill_id uuid,p_amount numeric,p_method text,p_reference text,p_user uuid
) returns text language plpgsql security definer set search_path=public as $$
declare v_total numeric(12,2); v_paid numeric(12,2); v_status text;
begin
  select total_amount,paid_amount into v_total,v_paid from public.supply_bills where id=p_bill_id and status='ISSUED' for update;
  if not found or p_amount<=0 or v_paid+p_amount>v_total then raise exception 'Invalid payment amount'; end if;
  insert into public.supply_bill_payments(bill_id,amount,payment_method,reference,created_by)
  values(p_bill_id,p_amount,p_method,nullif(trim(p_reference),''),p_user);
  v_paid:=v_paid+p_amount; v_status:=case when v_paid>=v_total then 'PAID' else 'PARTIAL' end;
  update public.supply_bills set paid_amount=v_paid,payment_status=v_status,updated_at=now() where id=p_bill_id;
  return v_status;
end; $$;

revoke all on function public.issue_supply_bill(uuid,jsonb,text,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.adjust_outlet_inventory(uuid,uuid,numeric,text,text,uuid) from public,anon,authenticated;
revoke all on function public.record_supply_payment(uuid,numeric,text,text,uuid) from public,anon,authenticated;
grant execute on function public.issue_supply_bill(uuid,jsonb,text,timestamptz,uuid) to service_role;
grant execute on function public.adjust_outlet_inventory(uuid,uuid,numeric,text,text,uuid) to service_role;
grant execute on function public.record_supply_payment(uuid,numeric,text,text,uuid) to service_role;
