begin;
alter table public.inventory_items add column if not exists local_outlet_id uuid references public.outlets(id);
alter table public.supply_bills add column if not exists purchase_source text not null default 'CENTRAL' check (purchase_source in ('CENTRAL','LOCAL'));
alter table public.supply_bills add column if not exists local_entry_key uuid unique;

-- One transaction creates the item if needed, records the paid purchase and adds stock.
-- The client key makes retries safe even when the first response is lost.
create or replace function public.record_local_purchase(p_outlet_id uuid,p_entry_key uuid,p_purchase jsonb,p_user uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_item public.inventory_items%rowtype; v_bill uuid; v_session uuid;
  v_quantity numeric := (p_purchase->>'quantity')::numeric;
  v_base numeric := (p_purchase->>'baseQuantity')::numeric;
  v_cost numeric := (p_purchase->>'cost')::numeric;
  v_unit text := p_purchase->>'unit'; v_base_unit text := p_purchase->>'baseUnit';
  v_name text := trim(p_purchase->>'name'); v_now timestamptz := now();
begin
  if not exists(select 1 from public.profiles where id=p_user and is_active is not false and role in ('ADMIN','OWNER','MANAGER')) then raise exception 'Inventory access denied'; end if;
  if not exists(select 1 from public.profiles where id=p_user and role='ADMIN') and not exists(select 1 from public.outlet_users where user_id=p_user and outlet_id=p_outlet_id) then raise exception 'Outlet access denied'; end if;
  if p_entry_key is null then raise exception 'Purchase key is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_entry_key::text,0));
  select id into v_bill from public.supply_bills where local_entry_key=p_entry_key and outlet_id=p_outlet_id and created_by=p_user;
  if found then return v_bill; end if;
  select id into v_session from public.outlet_sales_sessions where outlet_id=p_outlet_id and closed_at is null for share;
  if not found then raise exception 'Open an outlet session before recording a local purchase'; end if;
  if v_quantity is null or v_quantity<=0 or v_quantity>100000000 or v_quantity<>round(v_quantity,3) or v_cost is null or v_cost<=0 or v_cost>100000000 or v_cost<>round(v_cost,2) then raise exception 'Invalid purchase quantity or cost'; end if;
  if v_unit is null or v_unit not in ('KG','G','L','ML','PIECE') or v_base_unit is distinct from (case when v_unit in ('KG','G') then 'G' when v_unit in ('L','ML') then 'ML' else 'EACH' end) or v_base is distinct from v_quantity*(case when v_unit in ('KG','L') then 1000 else 1 end) then raise exception 'Invalid purchase units'; end if;
  if v_unit='PIECE' and v_quantity<>trunc(v_quantity) then raise exception 'Pieces must be whole numbers'; end if;
  if coalesce(p_purchase->>'paymentMethod','') not in ('CASH','UPI','BANK','OTHER') then raise exception 'Invalid payment method'; end if;
  if nullif(p_purchase->>'itemId','') is not null then
    select * into v_item from public.inventory_items where id=(p_purchase->>'itemId')::uuid and active and (local_outlet_id is null or local_outlet_id=p_outlet_id) for share;
    if not found or v_item.inventory_unit<>v_base_unit then raise exception 'Stock item or unit is invalid for this outlet'; end if;
  else
    if coalesce(length(v_name),0)=0 or length(v_name)>100 then raise exception 'Item name is required'; end if;
    if not exists(select 1 from public.stock_categories where id=(p_purchase->>'categoryId')::uuid and active) then raise exception 'Choose an active stock category'; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_outlet_id::text||lower(v_name),0));
    if exists(select 1 from public.inventory_items where lower(trim(name))=lower(v_name) and active and (local_outlet_id is null or local_outlet_id=p_outlet_id)) then raise exception 'This item already exists. Select it from the item list'; end if;
    insert into public.inventory_items(name,sku,category_id,base_unit,display_unit,inventory_unit,supply_unit,request_unit,billing_unit,measurement_type,request_to_inventory,billing_to_inventory,local_outlet_id)
    values(v_name,'LOCAL-'||p_entry_key::text,(p_purchase->>'categoryId')::uuid,v_base_unit,v_base_unit,v_base_unit,v_unit,v_unit,v_unit,'FLEXIBLE',v_base/v_quantity,v_base/v_quantity,p_outlet_id) returning * into v_item;
  end if;
  v_bill:=public.issue_supply_bill(p_outlet_id,jsonb_build_array(jsonb_build_object(
    'item_id',v_item.id,'item_name',v_item.name,'unit',v_unit,'quantity',v_quantity,'base_quantity',v_base,
    'unit_price',v_cost/v_quantity,'request_quantity',v_quantity,'request_unit',v_unit,'inventory_unit',v_base_unit,
    'request_to_inventory',v_base/v_quantity,'billing_to_inventory',v_base/v_quantity)),
    'Local purchase'||case when coalesce(p_purchase->>'notes','')<>'' then ' · '||(p_purchase->>'notes') else '' end,v_now,p_user);
  update public.supply_bills set purchase_source='LOCAL',local_entry_key=p_entry_key,total_amount=v_cost,bill_number=replace(bill_number,'OHHO-SUP-','OHHO-LOCAL-') where id=v_bill;
  update public.supply_bill_items set line_total=v_cost where bill_id=v_bill;
  perform public.confirm_supply_receipt(v_bill,p_user,v_now);
  perform public.record_supply_payment(v_bill,v_cost,p_purchase->>'paymentMethod','Local purchase paid',p_user);
  return v_bill;
end; $$;
revoke all on function public.record_local_purchase(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.record_local_purchase(uuid,uuid,jsonb,uuid) to service_role;
commit;
