alter table public.inventory_items
  add column if not exists measurement_type text,
  add column if not exists billing_unit text;

-- Phase 2 standardizes measurable stock to pieces or kilograms. Existing
-- millilitre balances use the same 1000-base conversion and retain their
-- numeric balance while moving to the supported weight unit.
update public.inventory_items
set base_unit='G', display_unit='KG', request_unit='KG', updated_at=now()
where base_unit='ML' or display_unit in ('ML','L');

update public.inventory_items
set measurement_type = case
      when request_unit = 'PIECE' and display_unit = 'EACH' then 'PIECE_PIECE'
      else 'KG_KG'
    end,
    billing_unit = case when display_unit = 'EACH' then 'EACH' else 'KG' end
where measurement_type is null or billing_unit is null;

alter table public.inventory_items alter column measurement_type set not null;
alter table public.inventory_items alter column billing_unit set not null;
alter table public.inventory_items drop constraint if exists inventory_items_measurement_type_check;
alter table public.inventory_items add constraint inventory_items_measurement_type_check
  check (measurement_type in ('PIECE_PIECE','KG_KG','PIECE_KG'));
alter table public.inventory_items drop constraint if exists inventory_items_billing_unit_check;
alter table public.inventory_items add constraint inventory_items_billing_unit_check
  check (billing_unit in ('EACH','KG'));
alter table public.inventory_items drop constraint if exists inventory_items_measurement_consistency_check;
alter table public.inventory_items add constraint inventory_items_measurement_consistency_check check (
  (measurement_type = 'PIECE_PIECE' and request_unit = 'PIECE' and base_unit = 'EACH' and display_unit = 'EACH' and billing_unit = 'EACH') or
  (measurement_type = 'KG_KG' and request_unit = 'KG' and base_unit = 'G' and display_unit = 'KG' and billing_unit = 'KG') or
  (measurement_type = 'PIECE_KG' and request_unit = 'PIECE' and base_unit = 'EACH' and display_unit = 'EACH' and billing_unit = 'KG')
);

alter table public.supply_bills
  add column if not exists receipt_status text,
  add column if not exists received_at timestamptz,
  add column if not exists received_by uuid references auth.users(id);

-- Older bills already changed outlet inventory in the original workflow.
update public.supply_bills
set receipt_status = 'RECEIVED', received_at = coalesce(received_at, supplied_at)
where receipt_status is null;

alter table public.supply_bills alter column receipt_status set default 'PENDING';
alter table public.supply_bills alter column receipt_status set not null;
alter table public.supply_bills drop constraint if exists supply_bills_receipt_status_check;
alter table public.supply_bills add constraint supply_bills_receipt_status_check
  check (receipt_status in ('PENDING','RECEIVED'));

create or replace function public.issue_supply_bill(
  p_outlet_id uuid, p_items jsonb, p_notes text, p_supplied_at timestamptz, p_user uuid
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_bill_id uuid := gen_random_uuid(); v_bill_number text; v_total numeric(12,2); r record;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'Supply bill requires at least one item'; end if;
  v_bill_number := 'OHHO-SUP-' || to_char(coalesce(p_supplied_at,now()),'YYYYMMDD') || '-' || lpad(nextval('public.supply_bill_number_seq')::text,5,'0');
  select coalesce(sum((x.quantity::numeric)*(x.unit_price::numeric)),0) into v_total
  from jsonb_to_recordset(p_items) x(item_id uuid,item_name text,unit text,quantity numeric,base_quantity numeric,unit_price numeric);
  insert into public.supply_bills(id,bill_number,outlet_id,total_amount,notes,supplied_at,created_by,receipt_status)
  values(v_bill_id,v_bill_number,p_outlet_id,v_total,nullif(trim(p_notes),''),coalesce(p_supplied_at,now()),p_user,'PENDING');
  for r in select * from jsonb_to_recordset(p_items) x(item_id uuid,item_name text,unit text,quantity numeric,base_quantity numeric,unit_price numeric) loop
    if r.quantity<=0 or r.base_quantity<=0 or r.unit_price<0 then raise exception 'Invalid bill item'; end if;
    insert into public.supply_bill_items(bill_id,item_id,item_name,unit,quantity,base_quantity,unit_price,line_total)
    values(v_bill_id,r.item_id,r.item_name,r.unit,r.quantity,r.base_quantity,r.unit_price,round(r.quantity*r.unit_price,2));
  end loop;
  return v_bill_id;
end; $$;

create or replace function public.confirm_supply_receipt(
  p_bill_id uuid, p_user uuid, p_received_at timestamptz default now()
) returns boolean language plpgsql security definer set search_path=public as $$
declare
  v_bill public.supply_bills%rowtype; r record; v_balance numeric(14,3);
begin
  select * into v_bill from public.supply_bills where id=p_bill_id and status='ISSUED' for update;
  if not found then raise exception 'Supply bill not found'; end if;
  if v_bill.receipt_status='RECEIVED' then return false; end if;

  for r in select * from public.supply_bill_items where bill_id=p_bill_id order by id loop
    insert into public.outlet_inventory(outlet_id,item_id,quantity_on_hand,updated_at)
    values(v_bill.outlet_id,r.item_id,r.base_quantity,now())
    on conflict(outlet_id,item_id) do update
      set quantity_on_hand=public.outlet_inventory.quantity_on_hand+excluded.quantity_on_hand,updated_at=now()
    returning quantity_on_hand into v_balance;
    insert into public.inventory_movements(outlet_id,item_id,movement_type,quantity_delta,balance_after,reference_type,reference_id,notes,created_by,occurred_at)
    values(v_bill.outlet_id,r.item_id,'STOCK_RECEIVED',r.base_quantity,v_balance,'SUPPLY_BILL',p_bill_id,v_bill.notes,p_user,coalesce(p_received_at,now()));
  end loop;

  update public.supply_bills
  set receipt_status='RECEIVED',received_at=coalesce(p_received_at,now()),received_by=p_user,updated_at=now()
  where id=p_bill_id;
  return true;
end; $$;

revoke all on function public.confirm_supply_receipt(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.confirm_supply_receipt(uuid,uuid,timestamptz) to service_role;
