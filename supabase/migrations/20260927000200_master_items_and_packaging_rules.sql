begin;

alter table public.inventory_items
  add column if not exists request_to_inventory numeric(14,6),
  add column if not exists billing_to_inventory numeric(14,6);

update public.inventory_items set
  request_to_inventory=coalesce(request_to_inventory,case
    when request_unit='KG' and inventory_unit='G' then 1000
    when request_unit='L' and inventory_unit='ML' then 1000
    when request_unit in ('PIECE','EACH') and inventory_unit='EACH' then 1
    when request_unit=inventory_unit then 1 else 1 end),
  billing_to_inventory=coalesce(billing_to_inventory,case
    when billing_unit='KG' and inventory_unit='G' then 1000
    when billing_unit='L' and inventory_unit='ML' then 1000
    when billing_unit in ('PIECE','EACH') and inventory_unit='EACH' then 1
    when billing_unit=inventory_unit then 1 else 1 end);

-- Older weight/volume items stored alert and target levels in their display
-- unit while balances and recipes were already stored in the base unit.
update public.inventory_items set
  low_stock_threshold=low_stock_threshold*1000,
  target_stock_level=target_stock_level*1000,
  display_unit='G'
where inventory_unit='G' and display_unit='KG';
update public.inventory_items set
  low_stock_threshold=low_stock_threshold*1000,
  target_stock_level=target_stock_level*1000,
  display_unit='ML'
where inventory_unit='ML' and display_unit='L';

-- Existing dual-unit items use their confirmed bill history as the safest
-- available starting conversion. Admin can review and refine it in Master Item.
with historical_conversion as (
  select sbi.item_id,sum(sbi.base_quantity)/nullif(sum(sbi.quantity),0) factor
  from public.supply_bill_items sbi join public.supply_bills sb on sb.id=sbi.bill_id
  where coalesce(sb.receipt_status,'RECEIVED')='RECEIVED' and sbi.quantity>0 and sbi.base_quantity>0
  group by sbi.item_id
)
update public.inventory_items i set
  billing_to_inventory=h.factor,
  request_to_inventory=case when i.request_unit=i.billing_unit then h.factor else i.request_to_inventory end
from historical_conversion h where h.item_id=i.id and h.factor>0
  and not ((i.billing_unit='KG' and i.inventory_unit='G') or (i.billing_unit='L' and i.inventory_unit='ML'));

alter table public.inventory_items alter column request_to_inventory set not null;
alter table public.inventory_items alter column billing_to_inventory set not null;
alter table public.inventory_items drop constraint if exists inventory_items_conversion_check;
alter table public.inventory_items add constraint inventory_items_conversion_check
  check(request_to_inventory>0 and billing_to_inventory>0);

alter table public.supply_bill_items
  add column if not exists request_quantity numeric(14,3),
  add column if not exists request_unit text,
  add column if not exists inventory_unit text,
  add column if not exists request_to_inventory numeric(14,6),
  add column if not exists billing_to_inventory numeric(14,6);

update public.supply_bill_items line set
  request_unit=coalesce(line.request_unit,item.request_unit),
  inventory_unit=coalesce(line.inventory_unit,item.inventory_unit),
  request_to_inventory=coalesce(line.request_to_inventory,item.request_to_inventory),
  billing_to_inventory=coalesce(line.billing_to_inventory,item.billing_to_inventory)
from public.inventory_items item where item.id=line.item_id;

alter table public.franchise_stock_request_items
  add column if not exists billing_quantity numeric(14,3),
  add column if not exists billing_unit text,
  add column if not exists inventory_quantity numeric(14,3),
  add column if not exists inventory_unit text,
  add column if not exists request_to_inventory numeric(14,6),
  add column if not exists billing_to_inventory numeric(14,6);

update public.franchise_stock_request_items line set
  billing_quantity=coalesce(line.billing_quantity,round(line.quantity*item.request_to_inventory/item.billing_to_inventory,3)),
  billing_unit=coalesce(line.billing_unit,item.billing_unit),
  inventory_quantity=coalesce(line.inventory_quantity,round(line.quantity*item.request_to_inventory,3)),
  inventory_unit=coalesce(line.inventory_unit,item.inventory_unit),
  request_to_inventory=coalesce(line.request_to_inventory,item.request_to_inventory),
  billing_to_inventory=coalesce(line.billing_to_inventory,item.billing_to_inventory)
from public.inventory_items item where item.id=line.item_id;

create or replace function public.save_franchise_stock_request(p_request_id uuid,p_outlet_id uuid,p_required_for date,p_items jsonb,p_notes text,p_status text,p_user uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_request_id uuid:=p_request_id;r record;v_existing record;
begin
  if p_status not in ('DRAFT','SUBMITTED') or p_required_for<current_date or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Select a valid date and at least one item';end if;
  if v_request_id is null and p_status='DRAFT' then select id into v_request_id from public.franchise_stock_requests where outlet_id=p_outlet_id and created_by=p_user and status='DRAFT' limit 1 for update;end if;
  if v_request_id is null then
    v_request_id:=gen_random_uuid();insert into public.franchise_stock_requests(id,outlet_id,required_for,status,notes,created_by) values(v_request_id,p_outlet_id,p_required_for,p_status,nullif(trim(p_notes),''),p_user);
  else
    select id,status,outlet_id,created_by,bill_id,processing_started_at into v_existing from public.franchise_stock_requests where id=v_request_id for update;
    if not found or v_existing.status not in ('DRAFT','SUBMITTED') or v_existing.bill_id is not null or v_existing.processing_started_at is not null or v_existing.outlet_id<>p_outlet_id or v_existing.created_by<>p_user then raise exception 'This requirement can no longer be edited';end if;
    if v_existing.status='SUBMITTED' and p_status<>'SUBMITTED' then raise exception 'Use Save Changes for a sent requirement';end if;
    update public.franchise_stock_requests set required_for=p_required_for,status=p_status,notes=nullif(trim(p_notes),''),updated_at=now() where id=v_request_id;
    delete from public.franchise_stock_request_items where request_id=v_request_id;
  end if;
  for r in select * from jsonb_to_recordset(p_items) x(item_id uuid,item_name text,unit text,quantity numeric,fixed_unit_price numeric,billing_quantity numeric,billing_unit text,inventory_quantity numeric,inventory_unit text,request_to_inventory numeric,billing_to_inventory numeric) loop
    if r.quantity<=0 then raise exception 'Invalid request item';end if;
    insert into public.franchise_stock_request_items(request_id,item_id,item_name,unit,quantity,fixed_unit_price,billing_quantity,billing_unit,inventory_quantity,inventory_unit,request_to_inventory,billing_to_inventory)
    values(v_request_id,r.item_id,r.item_name,r.unit,r.quantity,r.fixed_unit_price,r.billing_quantity,r.billing_unit,r.inventory_quantity,r.inventory_unit,r.request_to_inventory,r.billing_to_inventory);
  end loop;
  return v_request_id;
end;$$;

create or replace function public.submit_franchise_stock_request(p_outlet_id uuid,p_required_for date,p_items jsonb,p_notes text,p_user uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_request_id uuid:=gen_random_uuid();r record;
begin
  if p_required_for<current_date or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Select a valid date and at least one item';end if;
  insert into public.franchise_stock_requests(id,outlet_id,required_for,status,notes,created_by)
  values(v_request_id,p_outlet_id,p_required_for,'SUBMITTED',nullif(trim(p_notes),''),p_user);
  for r in select * from jsonb_to_recordset(p_items) x(item_id uuid,item_name text,unit text,quantity numeric,fixed_unit_price numeric,billing_quantity numeric,billing_unit text,inventory_quantity numeric,inventory_unit text,request_to_inventory numeric,billing_to_inventory numeric) loop
    if r.quantity<=0 then raise exception 'Invalid request item';end if;
    insert into public.franchise_stock_request_items(request_id,item_id,item_name,unit,quantity,fixed_unit_price,billing_quantity,billing_unit,inventory_quantity,inventory_unit,request_to_inventory,billing_to_inventory)
    values(v_request_id,r.item_id,r.item_name,r.unit,r.quantity,r.fixed_unit_price,r.billing_quantity,r.billing_unit,r.inventory_quantity,r.inventory_unit,r.request_to_inventory,r.billing_to_inventory);
  end loop;
  return v_request_id;
end;$$;

alter table public.inventory_movements
  add column if not exists item_name_snapshot text,
  add column if not exists inventory_unit_snapshot text,
  add column if not exists rule_snapshot jsonb;
update public.inventory_movements movement set
  item_name_snapshot=coalesce(movement.item_name_snapshot,item.name),
  inventory_unit_snapshot=coalesce(movement.inventory_unit_snapshot,item.inventory_unit)
from public.inventory_items item where item.id=movement.item_id;
alter table public.inventory_movements drop constraint if exists inventory_movements_movement_type_check;
alter table public.inventory_movements add constraint inventory_movements_movement_type_check
  check(movement_type in ('OPENING_STOCK','STOCK_RECEIVED','USAGE','WASTE','ADJUSTMENT','SALE_DEDUCTION','PACKAGING_CONSUMPTION','REVERSAL'));

create or replace function public.issue_supply_bill(p_outlet_id uuid,p_items jsonb,p_notes text,p_supplied_at timestamptz,p_user uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_bill_id uuid:=gen_random_uuid();v_bill_number text;v_total numeric(12,2);r record;
begin
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Supply bill requires at least one item';end if;
  v_bill_number:='OHHO-SUP-'||to_char(coalesce(p_supplied_at,now()),'YYYYMMDD')||'-'||lpad(nextval('public.supply_bill_number_seq')::text,5,'0');
  select coalesce(sum(x.quantity*x.unit_price),0) into v_total from jsonb_to_recordset(p_items) x(quantity numeric,unit_price numeric);
  insert into public.supply_bills(id,bill_number,outlet_id,total_amount,notes,supplied_at,created_by,receipt_status)
  values(v_bill_id,v_bill_number,p_outlet_id,v_total,nullif(trim(p_notes),''),coalesce(p_supplied_at,now()),p_user,'PENDING');
  for r in select * from jsonb_to_recordset(p_items) x(item_id uuid,item_name text,unit text,quantity numeric,base_quantity numeric,unit_price numeric,request_quantity numeric,request_unit text,inventory_unit text,request_to_inventory numeric,billing_to_inventory numeric) loop
    if r.quantity<=0 or r.base_quantity<=0 or r.unit_price<0 then raise exception 'Invalid bill item';end if;
    insert into public.supply_bill_items(bill_id,item_id,item_name,unit,quantity,base_quantity,unit_price,line_total,request_quantity,request_unit,inventory_unit,request_to_inventory,billing_to_inventory)
    values(v_bill_id,r.item_id,r.item_name,r.unit,r.quantity,r.base_quantity,r.unit_price,round(r.quantity*r.unit_price,2),r.request_quantity,r.request_unit,r.inventory_unit,r.request_to_inventory,r.billing_to_inventory);
  end loop;
  return v_bill_id;
end;$$;

create or replace function public.confirm_supply_receipt(p_bill_id uuid,p_user uuid,p_received_at timestamptz default now())
returns boolean language plpgsql security definer set search_path=public as $$
declare v_bill public.supply_bills%rowtype;r record;v_balance numeric(14,3);
begin
  select * into v_bill from public.supply_bills where id=p_bill_id and status='ISSUED' for update;
  if not found then raise exception 'Supply bill not found';end if;
  if v_bill.receipt_status='RECEIVED' then return false;end if;
  for r in select * from public.supply_bill_items where bill_id=p_bill_id order by id loop
    insert into public.outlet_inventory(outlet_id,item_id,quantity_on_hand,updated_at) values(v_bill.outlet_id,r.item_id,r.base_quantity,now())
      on conflict(outlet_id,item_id) do update set quantity_on_hand=public.outlet_inventory.quantity_on_hand+excluded.quantity_on_hand,updated_at=now()
      returning quantity_on_hand into v_balance;
    insert into public.inventory_movements(outlet_id,item_id,movement_type,quantity_delta,balance_after,reference_type,reference_id,notes,created_by,occurred_at,item_name_snapshot,inventory_unit_snapshot,rule_snapshot)
    values(v_bill.outlet_id,r.item_id,'STOCK_RECEIVED',r.base_quantity,v_balance,'SUPPLY_BILL',p_bill_id,v_bill.notes,p_user,coalesce(p_received_at,now()),r.item_name,r.inventory_unit,
      jsonb_build_object('requestQuantity',r.request_quantity,'requestUnit',r.request_unit,'billingQuantity',r.quantity,'billingUnit',r.unit,'requestToInventory',r.request_to_inventory,'billingToInventory',r.billing_to_inventory));
  end loop;
  update public.supply_bills set receipt_status='RECEIVED',received_at=coalesce(p_received_at,now()),received_by=p_user,updated_at=now() where id=p_bill_id;
  return true;
end;$$;

create table if not exists public.inventory_packaging_rules (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  order_types text[] not null default array['TAKEAWAY']::text[],
  consumption_type text not null check(consumption_type in ('PER_ORDER','PER_MENU_ITEM','PER_MENU_CATEGORY')),
  consumption_quantity numeric(14,3) not null check(consumption_quantity>0),
  menu_item_id uuid references public.menu_items(id) on delete restrict,
  menu_category_id uuid references public.menu_categories(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(order_types <@ array['DINE_IN','TAKEAWAY','DELIVERY']::text[] and cardinality(order_types)>0),
  check((consumption_type='PER_ORDER' and menu_item_id is null and menu_category_id is null) or
        (consumption_type='PER_MENU_ITEM' and menu_item_id is not null and menu_category_id is null) or
        (consumption_type='PER_MENU_CATEGORY' and menu_item_id is null and menu_category_id is not null))
);
create unique index if not exists inventory_packaging_rules_unique
  on public.inventory_packaging_rules(item_id,consumption_type,coalesce(menu_item_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(menu_category_id,'00000000-0000-0000-0000-000000000000'::uuid));
alter table public.inventory_packaging_rules enable row level security;
revoke all on public.inventory_packaging_rules from anon,authenticated;
grant select on public.inventory_packaging_rules to authenticated;
drop policy if exists inventory_packaging_rules_read on public.inventory_packaging_rules;
create policy inventory_packaging_rules_read on public.inventory_packaging_rules for select to authenticated using(true);

-- Preserve the previous optional-packaging recipe behavior as an explicit
-- Takeaway rule. Admin can then refine it to per-order or per-category.
insert into public.inventory_packaging_rules(item_id,order_types,consumption_type,consumption_quantity,menu_item_id)
select inventory_item_id,array['TAKEAWAY']::text[],'PER_MENU_ITEM',base_quantity,menu_item_id
from public.menu_item_recipes where is_packaging
on conflict do nothing;

create or replace function public.update_inventory_master_item(p_item_id uuid,p_values jsonb,p_user uuid)
returns public.inventory_items language plpgsql security definer set search_path=public as $$
declare old_item public.inventory_items%rowtype; new_item public.inventory_items%rowtype; factor numeric; r record; v_new numeric(14,3);
begin
  select * into old_item from public.inventory_items where id=p_item_id for update;
  if not found then raise exception 'Master Item not found';end if;
  if old_item.inventory_unit<>(p_values->>'inventory_unit') and old_item.billing_unit<>(p_values->>'billing_unit') then
    raise exception 'Change the billing unit first, save, then change the inventory unit so current stock can be converted safely';
  end if;
  factor:=(p_values->>'billing_to_inventory')::numeric/old_item.billing_to_inventory;
  update public.inventory_items set
    name=p_values->>'name',category_id=(p_values->>'category_id')::uuid,
    request_unit=p_values->>'request_unit',supply_unit=p_values->>'billing_unit',billing_unit=p_values->>'billing_unit',
    base_unit=p_values->>'inventory_unit',inventory_unit=p_values->>'inventory_unit',display_unit=p_values->>'inventory_unit',
    request_to_inventory=(p_values->>'request_to_inventory')::numeric,billing_to_inventory=(p_values->>'billing_to_inventory')::numeric,
    default_supply_price=(p_values->>'default_supply_price')::numeric,low_stock_threshold=(p_values->>'low_stock_threshold')::numeric,
    target_stock_level=(p_values->>'target_stock_level')::numeric,active=coalesce((p_values->>'active')::boolean,true),updated_at=now()
  where id=p_item_id returning * into new_item;
  if old_item.inventory_unit<>new_item.inventory_unit then
    update public.menu_item_recipes set base_quantity=round(base_quantity*factor,3)
      where inventory_item_id=p_item_id;
    update public.inventory_packaging_rules set consumption_quantity=round(consumption_quantity*factor,3),updated_at=now()
      where item_id=p_item_id;
    for r in select * from public.outlet_inventory where item_id=p_item_id order by outlet_id for update loop
      v_new:=round(r.quantity_on_hand*factor,3);
      update public.outlet_inventory set quantity_on_hand=v_new,updated_at=now() where outlet_id=r.outlet_id and item_id=p_item_id;
      if v_new<>r.quantity_on_hand then
        insert into public.inventory_movements(outlet_id,item_id,movement_type,quantity_delta,balance_after,reference_type,notes,created_by,item_name_snapshot,inventory_unit_snapshot,rule_snapshot)
        values(r.outlet_id,p_item_id,'ADJUSTMENT',v_new-r.quantity_on_hand,v_new,'MASTER_ITEM_EDIT','Master Item inventory unit converted',p_user,old_item.name,old_item.inventory_unit,
          jsonb_build_object('oldQuantity',r.quantity_on_hand,'oldUnit',old_item.inventory_unit,'newUnit',new_item.inventory_unit,'factor',factor));
      end if;
    end loop;
  end if;
  return new_item;
end;$$;
revoke all on function public.update_inventory_master_item(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.update_inventory_master_item(uuid,jsonb,uuid) to service_role;

create or replace function public.set_inventory_opening_stock(p_outlet_id uuid,p_items jsonb,p_reason text,p_user uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_event_id uuid:=gen_random_uuid();v_correction boolean;r record;v_previous numeric(14,3);v_delta numeric(14,3);v_item public.inventory_items%rowtype;
begin
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Enter at least one physical stock quantity';end if;
  perform pg_advisory_xact_lock(hashtext(p_outlet_id::text));
  select exists(select 1 from public.inventory_opening_stock_events where outlet_id=p_outlet_id) into v_correction;
  if v_correction and length(trim(coalesce(p_reason,'')))<3 then raise exception 'A correction reason is required';end if;
  insert into public.inventory_opening_stock_events(id,outlet_id,event_type,reason,confirmed_by)
  values(v_event_id,p_outlet_id,case when v_correction then 'CORRECTION' else 'OPENING' end,nullif(trim(p_reason),''),p_user);
  for r in select * from jsonb_to_recordset(p_items) x(item_id uuid,quantity numeric) loop
    if r.quantity<0 then raise exception 'Physical stock cannot be negative';end if;
    select * into v_item from public.inventory_items where id=r.item_id;
    if not found then raise exception 'Master Item not found';end if;
    insert into public.outlet_inventory(outlet_id,item_id,quantity_on_hand,updated_at)
    values(p_outlet_id,r.item_id,0,now()) on conflict(outlet_id,item_id) do nothing;
    select quantity_on_hand into v_previous from public.outlet_inventory where outlet_id=p_outlet_id and item_id=r.item_id for update;
    v_delta:=r.quantity-v_previous;
    insert into public.inventory_opening_stock_items(event_id,item_id,previous_quantity,physical_quantity) values(v_event_id,r.item_id,v_previous,r.quantity);
    update public.outlet_inventory set quantity_on_hand=r.quantity,updated_at=now() where outlet_id=p_outlet_id and item_id=r.item_id;
    if v_delta<>0 then
      insert into public.inventory_movements(outlet_id,item_id,movement_type,quantity_delta,balance_after,reference_type,reference_id,notes,created_by,item_name_snapshot,inventory_unit_snapshot,rule_snapshot)
      values(p_outlet_id,r.item_id,case when v_correction then 'ADJUSTMENT' else 'OPENING_STOCK' end,v_delta,r.quantity,'OPENING_STOCK',v_event_id,
        case when v_correction then 'Physical stock correction: '||trim(p_reason) else 'Opening stock confirmed'||case when nullif(trim(coalesce(p_reason,'')),'') is null then '' else ': '||trim(p_reason) end end,p_user,
        v_item.name,v_item.inventory_unit,jsonb_build_object('previousQuantity',v_previous,'physicalQuantity',r.quantity,'eventType',case when v_correction then 'CORRECTION' else 'OPENING' end));
    end if;
  end loop;
  return v_event_id;
end;$$;

create or replace function public.record_kitchen_wastage(p_outlet_id uuid,p_type text,p_menu_item_id uuid,p_stock_item_id uuid,p_quantity numeric,p_base_quantity numeric,p_reason text,p_packaging_used boolean,p_note text,p_user uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid:=gen_random_uuid();r record;v_balance numeric(14,3);
begin
  if p_quantity<=0 or p_type not in ('MENU_ITEM','STOCK_ITEM') or p_reason not in ('BURNT','DAMAGED_DROPPED','SPOILED_EXPIRED','PREPARATION_WASTE','OTHER') then raise exception 'Invalid wastage entry';end if;
  if p_type='MENU_ITEM' and not exists(select 1 from public.menu_item_recipes where menu_item_id=p_menu_item_id and not is_packaging) then raise exception 'Configure this menu item recipe before recording wastage';end if;
  if p_type='STOCK_ITEM' and (p_stock_item_id is null or p_base_quantity<=0) then raise exception 'Invalid stock wastage quantity';end if;
  insert into public.kitchen_wastage(id,outlet_id,wastage_type,menu_item_id,stock_item_id,quantity,reason,packaging_used,note,created_by)
  values(v_id,p_outlet_id,p_type,p_menu_item_id,p_stock_item_id,p_quantity,p_reason,coalesce(p_packaging_used,false),nullif(trim(p_note),''),p_user);
  for r in
    select x.item_id,sum(x.used)::numeric(14,3) used,i.name item_name,i.inventory_unit from (
      select recipe.inventory_item_id item_id,recipe.base_quantity*p_quantity used from public.menu_item_recipes recipe
      where p_type='MENU_ITEM' and recipe.menu_item_id=p_menu_item_id and (not recipe.is_packaging or coalesce(p_packaging_used,false))
      union all select p_stock_item_id,p_base_quantity where p_type='STOCK_ITEM'
    ) x join public.inventory_items i on i.id=x.item_id group by x.item_id,i.name,i.inventory_unit order by x.item_id
  loop
    if r.item_id is null or r.used<=0 then raise exception 'Wastage item has no valid recipe or quantity';end if;
    update public.outlet_inventory set quantity_on_hand=quantity_on_hand-r.used,updated_at=now()
      where outlet_id=p_outlet_id and item_id=r.item_id and quantity_on_hand>=r.used returning quantity_on_hand into v_balance;
    if not found then raise exception 'Wastage exceeds available stock';end if;
    insert into public.inventory_movements(outlet_id,item_id,movement_type,quantity_delta,balance_after,reference_type,reference_id,notes,created_by,item_name_snapshot,inventory_unit_snapshot,rule_snapshot)
    values(p_outlet_id,r.item_id,'WASTE',-r.used,v_balance,'KITCHEN_WASTAGE',v_id,p_reason||coalesce(' · '||nullif(trim(p_note),''),''),p_user,r.item_name,r.inventory_unit,
      jsonb_build_object('wastageType',p_type,'menuItemId',p_menu_item_id,'enteredQuantity',p_quantity,'packagingUsed',coalesce(p_packaging_used,false)));
  end loop;
  return v_id;
end;$$;

create or replace function public.apply_completed_order_inventory()
returns trigger language plpgsql security definer set search_path=public as $$
declare r record; v_balance numeric(14,3);
begin
  if new.status <> 'COMPLETED' or old.status = 'COMPLETED' then return new; end if;
  if exists (
    select 1 from public.order_items ol where ol.order_id=new.id and not exists (
      select 1 from public.menu_item_recipes recipe where recipe.menu_item_id=ol.menu_item_id and not recipe.is_packaging
    )
  ) then raise exception 'Configure food recipes for every menu item before completing this order'; end if;

  insert into public.inventory_order_effects(order_id,outlet_id) values(new.id,new.outlet_id) on conflict(order_id) do nothing;
  if not found then return new; end if;

  for r in
    with effects as (
      select recipe.inventory_item_id item_id,'SALE_DEDUCTION' movement_type,
        sum(recipe.base_quantity*ol.quantity)::numeric(14,3) used_quantity,
        jsonb_build_object('type','RECIPE','orderType',new.order_type) rule_snapshot
      from public.order_items ol join public.menu_item_recipes recipe on recipe.menu_item_id=ol.menu_item_id
      where ol.order_id=new.id and not recipe.is_packaging group by recipe.inventory_item_id
      union all
      select pr.item_id,'PACKAGING_CONSUMPTION',
        case pr.consumption_type
          when 'PER_ORDER' then pr.consumption_quantity
          when 'PER_MENU_ITEM' then pr.consumption_quantity*coalesce((select sum(ol.quantity) from public.order_items ol where ol.order_id=new.id and ol.menu_item_id=pr.menu_item_id),0)
          when 'PER_MENU_CATEGORY' then pr.consumption_quantity*coalesce((select sum(ol.quantity) from public.order_items ol join public.menu_items mi on mi.id=ol.menu_item_id where ol.order_id=new.id and mi.category_id=pr.menu_category_id),0)
        end,
        jsonb_build_object('type',pr.consumption_type,'orderTypes',pr.order_types,'quantity',pr.consumption_quantity,'menuItemId',pr.menu_item_id,'menuCategoryId',pr.menu_category_id)
      from public.inventory_packaging_rules pr where pr.active and new.order_type=any(pr.order_types)
    )
    select e.item_id,e.movement_type,sum(e.used_quantity)::numeric(14,3) used_quantity,
      jsonb_agg(e.rule_snapshot) rule_snapshot,i.name item_name,i.inventory_unit
    from effects e join public.inventory_items i on i.id=e.item_id where e.used_quantity>0
    group by e.item_id,e.movement_type,i.name,i.inventory_unit order by e.item_id,e.movement_type
  loop
    update public.outlet_inventory set quantity_on_hand=quantity_on_hand-r.used_quantity,updated_at=now()
      where outlet_id=new.outlet_id and item_id=r.item_id and quantity_on_hand>=r.used_quantity returning quantity_on_hand into v_balance;
    if not found then raise exception 'Insufficient stock to complete this order: %',r.item_name; end if;
    insert into public.inventory_movements(outlet_id,item_id,movement_type,quantity_delta,balance_after,reference_type,reference_id,notes,created_by,occurred_at,item_name_snapshot,inventory_unit_snapshot,rule_snapshot)
    values(new.outlet_id,r.item_id,r.movement_type,-r.used_quantity,v_balance,'ORDER',new.id,
      case when r.movement_type='PACKAGING_CONSUMPTION' then 'Packaging for '||new.order_type||' order ' else 'Recipe deduction for order ' end||coalesce(new.order_number::text,new.id::text),
      auth.uid(),now(),r.item_name,r.inventory_unit,r.rule_snapshot);
  end loop;
  return new;
end;$$;

revoke all on function public.apply_completed_order_inventory() from public,anon,authenticated;
grant execute on function public.apply_completed_order_inventory() to service_role;
revoke all on function public.submit_franchise_stock_request(uuid,date,jsonb,text,uuid) from public,anon,authenticated;
revoke all on function public.save_franchise_stock_request(uuid,uuid,date,jsonb,text,text,uuid) from public,anon,authenticated;
revoke all on function public.issue_supply_bill(uuid,jsonb,text,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.confirm_supply_receipt(uuid,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.set_inventory_opening_stock(uuid,jsonb,text,uuid) from public,anon,authenticated;
revoke all on function public.record_kitchen_wastage(uuid,text,uuid,uuid,numeric,numeric,text,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.submit_franchise_stock_request(uuid,date,jsonb,text,uuid) to service_role;
grant execute on function public.save_franchise_stock_request(uuid,uuid,date,jsonb,text,text,uuid) to service_role;
grant execute on function public.issue_supply_bill(uuid,jsonb,text,timestamptz,uuid) to service_role;
grant execute on function public.confirm_supply_receipt(uuid,uuid,timestamptz) to service_role;
grant execute on function public.set_inventory_opening_stock(uuid,jsonb,text,uuid) to service_role;
grant execute on function public.record_kitchen_wastage(uuid,text,uuid,uuid,numeric,numeric,text,boolean,text,uuid) to service_role;

commit;
