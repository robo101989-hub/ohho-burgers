alter table public.inventory_items
  add column if not exists supply_unit text,
  add column if not exists inventory_unit text;

update public.inventory_items
set supply_unit=case when billing_unit='EACH' then 'PIECE' else billing_unit end,
    inventory_unit=base_unit
where supply_unit is null or inventory_unit is null;

alter table public.inventory_items alter column supply_unit set not null;
alter table public.inventory_items alter column inventory_unit set not null;
alter table public.inventory_items drop constraint if exists inventory_items_request_unit_check;
alter table public.inventory_items add constraint inventory_items_request_unit_check
  check(request_unit in ('KG','G','L','ML','PIECE','BOTTLE','PACK','CAN','BOX'));
alter table public.inventory_items drop constraint if exists inventory_items_billing_unit_check;
alter table public.inventory_items add constraint inventory_items_billing_unit_check
  check(billing_unit in ('KG','G','L','ML','PIECE','EACH','BOTTLE','PACK','CAN','BOX'));
alter table public.inventory_items drop constraint if exists inventory_items_measurement_type_check;
alter table public.inventory_items add constraint inventory_items_measurement_type_check
  check(measurement_type in ('PIECE_PIECE','KG_KG','PIECE_KG','FLEXIBLE'));
alter table public.inventory_items drop constraint if exists inventory_items_measurement_consistency_check;
alter table public.inventory_items add constraint inventory_items_flexible_units_check check (
  supply_unit in ('KG','G','L','ML','PIECE','BOTTLE','PACK','CAN','BOX') and
  inventory_unit in ('G','ML','EACH') and base_unit=inventory_unit
);

alter table public.franchise_stock_request_items drop constraint if exists franchise_stock_request_items_unit_check;
alter table public.franchise_stock_request_items add constraint franchise_stock_request_items_unit_check
  check(unit in ('KG','G','L','ML','PIECE','EACH','BOTTLE','PACK','CAN','BOX'));

alter table public.inventory_movements drop constraint if exists inventory_movements_movement_type_check;
alter table public.inventory_movements add constraint inventory_movements_movement_type_check
  check(movement_type in ('OPENING_STOCK','STOCK_RECEIVED','USAGE','WASTE','ADJUSTMENT','SALE_DEDUCTION','REVERSAL'));

create table if not exists public.inventory_opening_stock_events (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  event_type text not null check(event_type in ('OPENING','CORRECTION')),
  reason text,
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz not null default now()
);

create table if not exists public.inventory_opening_stock_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.inventory_opening_stock_events(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  previous_quantity numeric(14,3) not null,
  physical_quantity numeric(14,3) not null check(physical_quantity>=0),
  unique(event_id,item_id)
);

create index if not exists inventory_opening_stock_events_outlet_idx
  on public.inventory_opening_stock_events(outlet_id,confirmed_at desc);
alter table public.inventory_opening_stock_events enable row level security;
alter table public.inventory_opening_stock_items enable row level security;
revoke all on public.inventory_opening_stock_events,public.inventory_opening_stock_items from anon,authenticated;
grant select on public.inventory_opening_stock_events,public.inventory_opening_stock_items to authenticated;
drop policy if exists inventory_opening_events_read on public.inventory_opening_stock_events;
create policy inventory_opening_events_read on public.inventory_opening_stock_events for select to authenticated
  using(public.inventory_scope_allowed(outlet_id));
drop policy if exists inventory_opening_items_read on public.inventory_opening_stock_items;
create policy inventory_opening_items_read on public.inventory_opening_stock_items for select to authenticated
  using(exists(select 1 from public.inventory_opening_stock_events e where e.id=event_id and public.inventory_scope_allowed(e.outlet_id)));

create or replace function public.set_inventory_opening_stock(
  p_outlet_id uuid,p_items jsonb,p_reason text,p_user uuid
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_event_id uuid:=gen_random_uuid();v_correction boolean;r record;v_previous numeric(14,3);v_delta numeric(14,3);
begin
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Enter at least one physical stock quantity';end if;
  perform pg_advisory_xact_lock(hashtext(p_outlet_id::text));
  select exists(select 1 from public.inventory_opening_stock_events where outlet_id=p_outlet_id) into v_correction;
  if v_correction and length(trim(coalesce(p_reason,'')))<3 then raise exception 'A correction reason is required';end if;
  insert into public.inventory_opening_stock_events(id,outlet_id,event_type,reason,confirmed_by)
  values(v_event_id,p_outlet_id,case when v_correction then 'CORRECTION' else 'OPENING' end,nullif(trim(p_reason),''),p_user);
  for r in select * from jsonb_to_recordset(p_items) x(item_id uuid,quantity numeric) loop
    if r.quantity<0 then raise exception 'Physical stock cannot be negative';end if;
    insert into public.outlet_inventory(outlet_id,item_id,quantity_on_hand,updated_at)
    values(p_outlet_id,r.item_id,0,now()) on conflict(outlet_id,item_id) do nothing;
    select quantity_on_hand into v_previous from public.outlet_inventory
      where outlet_id=p_outlet_id and item_id=r.item_id for update;
    v_delta:=r.quantity-v_previous;
    insert into public.inventory_opening_stock_items(event_id,item_id,previous_quantity,physical_quantity)
    values(v_event_id,r.item_id,v_previous,r.quantity);
    update public.outlet_inventory set quantity_on_hand=r.quantity,updated_at=now()
      where outlet_id=p_outlet_id and item_id=r.item_id;
    if v_delta<>0 then
      insert into public.inventory_movements(outlet_id,item_id,movement_type,quantity_delta,balance_after,reference_type,reference_id,notes,created_by)
      values(p_outlet_id,r.item_id,case when v_correction then 'ADJUSTMENT' else 'OPENING_STOCK' end,v_delta,r.quantity,'OPENING_STOCK',v_event_id,
        case when v_correction then 'Physical stock correction: '||trim(p_reason) else 'Opening stock confirmed'||case when nullif(trim(coalesce(p_reason,'')),'') is null then '' else ': '||trim(p_reason) end end,p_user);
    end if;
  end loop;
  return v_event_id;
end;$$;
revoke all on function public.set_inventory_opening_stock(uuid,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.set_inventory_opening_stock(uuid,jsonb,text,uuid) to service_role;

create or replace function public.submit_franchise_stock_request(
  p_outlet_id uuid,p_required_for date,p_items jsonb,p_notes text,p_user uuid
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_request_id uuid:=gen_random_uuid();r record;
begin
  if p_required_for<current_date or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Select a valid date and at least one item';end if;
  insert into public.franchise_stock_requests(id,outlet_id,required_for,notes,created_by)
  values(v_request_id,p_outlet_id,p_required_for,nullif(trim(p_notes),''),p_user);
  for r in select * from jsonb_to_recordset(p_items) x(item_id uuid,item_name text,unit text,quantity numeric,fixed_unit_price numeric) loop
    if r.quantity<=0 or r.unit not in ('KG','G','L','ML','PIECE','EACH','BOTTLE','PACK','CAN','BOX') then raise exception 'Invalid request item';end if;
    insert into public.franchise_stock_request_items(request_id,item_id,item_name,unit,quantity,fixed_unit_price)
    values(v_request_id,r.item_id,r.item_name,r.unit,r.quantity,r.fixed_unit_price);
  end loop;
  return v_request_id;
end;$$;

create or replace function public.save_franchise_stock_request(
  p_request_id uuid,p_outlet_id uuid,p_required_for date,p_items jsonb,p_notes text,p_status text,p_user uuid
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_request_id uuid:=p_request_id;r record;v_existing record;
begin
  if p_status not in ('DRAFT','SUBMITTED') or p_required_for<current_date or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Select a valid date and at least one item';end if;
  if v_request_id is null and p_status='DRAFT' then select id into v_request_id from public.franchise_stock_requests where outlet_id=p_outlet_id and created_by=p_user and status='DRAFT' limit 1 for update;end if;
  if v_request_id is null then
    v_request_id:=gen_random_uuid();insert into public.franchise_stock_requests(id,outlet_id,required_for,status,notes,created_by) values(v_request_id,p_outlet_id,p_required_for,p_status,nullif(trim(p_notes),''),p_user);
  else
    select id,status,outlet_id,created_by into v_existing from public.franchise_stock_requests where id=v_request_id for update;
    if not found or v_existing.status<>'DRAFT' or v_existing.outlet_id<>p_outlet_id or v_existing.created_by<>p_user then raise exception 'This requirement can no longer be edited';end if;
    update public.franchise_stock_requests set required_for=p_required_for,status=p_status,notes=nullif(trim(p_notes),''),updated_at=now() where id=v_request_id;
    delete from public.franchise_stock_request_items where request_id=v_request_id;
  end if;
  for r in select * from jsonb_to_recordset(p_items) x(item_id uuid,item_name text,unit text,quantity numeric,fixed_unit_price numeric) loop
    if r.quantity<=0 or r.unit not in ('KG','G','L','ML','PIECE','EACH','BOTTLE','PACK','CAN','BOX') then raise exception 'Invalid request item';end if;
    insert into public.franchise_stock_request_items(request_id,item_id,item_name,unit,quantity,fixed_unit_price) values(v_request_id,r.item_id,r.item_name,r.unit,r.quantity,r.fixed_unit_price);
  end loop;
  return v_request_id;
end;$$;
revoke all on function public.submit_franchise_stock_request(uuid,date,jsonb,text,uuid) from public,anon,authenticated;
revoke all on function public.save_franchise_stock_request(uuid,uuid,date,jsonb,text,text,uuid) from public,anon,authenticated;
grant execute on function public.submit_franchise_stock_request(uuid,date,jsonb,text,uuid) to service_role;
grant execute on function public.save_franchise_stock_request(uuid,uuid,date,jsonb,text,text,uuid) to service_role;
