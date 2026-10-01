begin;

alter table public.supply_bills
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id),
  add column if not exists void_reason text;

create table if not exists public.local_purchase_edit_history (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.supply_bills(id) on delete restrict,
  action text not null check (action in ('EDIT','REMOVE')),
  old_values jsonb not null,
  new_values jsonb not null,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);
alter table public.local_purchase_edit_history enable row level security;
revoke all on public.local_purchase_edit_history from public, anon, authenticated;

create or replace function public.edit_local_purchase(p_bill_id uuid,p_purchase jsonb,p_user uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare
  v_bill public.supply_bills%rowtype;
  v_line public.supply_bill_items%rowtype;
  v_quantity numeric := (p_purchase->>'quantity')::numeric;
  v_base numeric := (p_purchase->>'baseQuantity')::numeric;
  v_cost numeric := (p_purchase->>'cost')::numeric;
  v_unit text := p_purchase->>'unit';
  v_base_unit text := p_purchase->>'baseUnit';
  v_method text := p_purchase->>'paymentMethod';
  v_new_item_id uuid := nullif(p_purchase->>'itemId','')::uuid;
  v_old_item_name text;
  v_old_inventory_unit text;
  v_new_item_name text;
  v_new_inventory_unit text;
  v_factor numeric;
  v_balance numeric;
  v_next numeric;
  v_delta numeric;
  v_new_balance numeric;
  v_old_next numeric;
  v_new_next numeric;
  v_payment public.supply_bill_payments%rowtype;
  v_payment_count integer;
  v_old jsonb;
  v_notes text;
begin
  if not exists(select 1 from public.profiles where id=p_user and is_active is not false and role in ('ADMIN','OWNER','MANAGER')) then raise exception 'Inventory access denied'; end if;
  select * into v_bill from public.supply_bills where id=p_bill_id and purchase_source='LOCAL' for update;
  if not found or v_bill.status<>'ISSUED' or v_bill.receipt_status<>'RECEIVED' then raise exception 'Local purchase not found or no longer editable'; end if;
  if not exists(select 1 from public.profiles where id=p_user and role='ADMIN') and not exists(select 1 from public.outlet_users where user_id=p_user and outlet_id=v_bill.outlet_id) then raise exception 'Outlet access denied'; end if;
  select * into v_line from public.supply_bill_items where bill_id=p_bill_id order by id limit 1 for update;
  if not found or (select count(*) from public.supply_bill_items where bill_id=p_bill_id)<>1 then raise exception 'This purchase format cannot be edited here'; end if;
  select name,inventory_unit into v_old_item_name,v_old_inventory_unit from public.inventory_items where id=v_line.item_id;
  if not found then raise exception 'The original stock item no longer exists'; end if;
  select name,inventory_unit into v_new_item_name,v_new_inventory_unit from public.inventory_items where id=v_new_item_id and active and (local_outlet_id is null or local_outlet_id=v_bill.outlet_id) for share;
  if not found then raise exception 'Choose an active stock item available to this outlet'; end if;
  if v_unit is null or v_unit not in ('KG','G','L','ML','PIECE') then raise exception 'Invalid purchase unit'; end if;
  v_factor:=case when v_unit in ('KG','L') then 1000 else 1 end;
  if v_quantity is null or v_quantity<=0 or v_quantity>100000000 or v_quantity<>round(v_quantity,3) or v_cost is null or v_cost<=0 or v_cost>100000000 or v_cost<>round(v_cost,2) then raise exception 'Enter a valid quantity and total cost'; end if;
  if v_base_unit is distinct from v_new_inventory_unit or v_base_unit is distinct from (case when v_unit in ('KG','G') then 'G' when v_unit in ('L','ML') then 'ML' else 'EACH' end) or v_base is distinct from v_quantity*v_factor then raise exception 'Purchase unit does not match the stock item'; end if;
  if v_base_unit='EACH' and v_quantity<>trunc(v_quantity) then raise exception 'Pieces must be whole numbers'; end if;
  if v_method is null or v_method not in ('CASH','UPI','BANK','OTHER') then raise exception 'Invalid payment method'; end if;
  select count(*) into v_payment_count from public.supply_bill_payments where bill_id=p_bill_id;
  if v_payment_count<>1 then raise exception 'This purchase payment history cannot be edited here'; end if;
  select * into v_payment from public.supply_bill_payments where bill_id=p_bill_id order by paid_at,id limit 1 for update;

  v_old:=jsonb_build_object('itemId',v_line.item_id,'itemName',v_line.item_name,'quantity',v_line.quantity,'unit',v_line.unit,'baseQuantity',v_line.base_quantity,'baseUnit',v_line.inventory_unit,'unitPrice',v_line.unit_price,'lineTotal',v_line.line_total,'billTotal',v_bill.total_amount,'paidAmount',v_bill.paid_amount,'notes',v_bill.notes,'payment',jsonb_build_object('amount',v_payment.amount,'method',v_payment.payment_method,'reference',v_payment.reference,'paidAt',v_payment.paid_at));
  v_notes:='Local purchase'||case when coalesce(trim(p_purchase->>'notes'),'')<>'' then ' · '||left(trim(p_purchase->>'notes'),300) else '' end;
  insert into public.outlet_inventory(outlet_id,item_id,quantity_on_hand,updated_at)
  select v_bill.outlet_id,ids.item_id,0,now()
  from (select v_line.item_id as item_id union select v_new_item_id) ids
  order by ids.item_id
  on conflict(outlet_id,item_id) do nothing;
  perform item_id from public.outlet_inventory where outlet_id=v_bill.outlet_id and item_id in (v_line.item_id,v_new_item_id) order by item_id for update;
  select quantity_on_hand into v_balance from public.outlet_inventory where outlet_id=v_bill.outlet_id and item_id=v_line.item_id;
  if v_new_item_id=v_line.item_id then
    v_delta:=v_base-v_line.base_quantity;
    v_next:=v_balance+v_delta;
    if v_next<0 then raise exception 'Cannot reduce this purchase: some of its stock has already been used'; end if;
    update public.outlet_inventory set quantity_on_hand=v_next,updated_at=now() where outlet_id=v_bill.outlet_id and item_id=v_line.item_id;
    if abs(v_delta)>0.000001 then
      insert into public.inventory_movements(outlet_id,item_id,movement_type,quantity_delta,balance_after,reference_type,reference_id,notes,created_by,occurred_at,item_name_snapshot,inventory_unit_snapshot)
      values(v_bill.outlet_id,v_line.item_id,'ADJUSTMENT',v_delta,v_next,'LOCAL_PURCHASE_EDIT',p_bill_id,'Local purchase edited · '||v_bill.bill_number,p_user,now(),v_new_item_name,v_base_unit);
    end if;
  else
    select quantity_on_hand into v_new_balance from public.outlet_inventory where outlet_id=v_bill.outlet_id and item_id=v_new_item_id;
    v_old_next:=v_balance-v_line.base_quantity;
    if v_old_next<0 then raise exception 'Cannot change this item: some of its stock has already been used'; end if;
    v_new_next:=v_new_balance+v_base;
    update public.outlet_inventory set quantity_on_hand=v_old_next,updated_at=now() where outlet_id=v_bill.outlet_id and item_id=v_line.item_id;
    update public.outlet_inventory set quantity_on_hand=v_new_next,updated_at=now() where outlet_id=v_bill.outlet_id and item_id=v_new_item_id;
    insert into public.inventory_movements(outlet_id,item_id,movement_type,quantity_delta,balance_after,reference_type,reference_id,notes,created_by,occurred_at,item_name_snapshot,inventory_unit_snapshot)
    values(v_bill.outlet_id,v_line.item_id,'ADJUSTMENT',-v_line.base_quantity,v_old_next,'LOCAL_PURCHASE_EDIT',p_bill_id,'Local purchase item changed · '||v_bill.bill_number,p_user,now(),v_old_item_name,v_old_inventory_unit),
      (v_bill.outlet_id,v_new_item_id,'ADJUSTMENT',v_base,v_new_next,'LOCAL_PURCHASE_EDIT',p_bill_id,'Local purchase item changed · '||v_bill.bill_number,p_user,now(),v_new_item_name,v_base_unit);
  end if;
  update public.supply_bill_items set item_id=v_new_item_id,item_name=v_new_item_name,unit=v_unit,quantity=v_quantity,base_quantity=v_base,unit_price=round(v_cost/v_quantity,2),line_total=v_cost,request_quantity=v_quantity,request_unit=v_unit,inventory_unit=v_base_unit,request_to_inventory=v_factor,billing_to_inventory=v_factor where id=v_line.id;
  update public.supply_bills set total_amount=v_cost,paid_amount=v_cost,payment_status='PAID',notes=v_notes,updated_at=now() where id=p_bill_id;
  update public.supply_bill_payments set amount=v_cost,payment_method=v_method,reference='Local purchase updated',created_by=p_user where id=v_payment.id;
  insert into public.local_purchase_edit_history(bill_id,action,old_values,new_values,changed_by)
  values(p_bill_id,'EDIT',v_old,jsonb_build_object('itemId',v_new_item_id,'itemName',v_new_item_name,'quantity',v_quantity,'unit',v_unit,'baseQuantity',v_base,'baseUnit',v_base_unit,'totalPaid',v_cost,'paymentMethod',v_method,'notes',p_purchase->>'notes'),p_user);
  return true;
end; $$;

create or replace function public.void_local_purchase(p_bill_id uuid,p_user uuid,p_reason text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare
  v_bill public.supply_bills%rowtype;
  v_line public.supply_bill_items%rowtype;
  v_balance numeric;
  v_next numeric;
  v_name text;
  v_unit text;
  v_old jsonb;
  v_reason text:=left(coalesce(nullif(trim(p_reason),''),'Removed from local purchase history'),300);
begin
  if not exists(select 1 from public.profiles where id=p_user and is_active is not false and role in ('ADMIN','OWNER','MANAGER')) then raise exception 'Inventory access denied'; end if;
  select * into v_bill from public.supply_bills where id=p_bill_id and purchase_source='LOCAL' for update;
  if not found or v_bill.status<>'ISSUED' or v_bill.receipt_status<>'RECEIVED' then raise exception 'Local purchase not found or already removed'; end if;
  if not exists(select 1 from public.profiles where id=p_user and role='ADMIN') and not exists(select 1 from public.outlet_users where user_id=p_user and outlet_id=v_bill.outlet_id) then raise exception 'Outlet access denied'; end if;
  select * into v_line from public.supply_bill_items where bill_id=p_bill_id order by id limit 1 for update;
  if not found or (select count(*) from public.supply_bill_items where bill_id=p_bill_id)<>1 then raise exception 'This purchase format cannot be removed here'; end if;
  select name,inventory_unit into v_name,v_unit from public.inventory_items where id=v_line.item_id;
  insert into public.outlet_inventory(outlet_id,item_id,quantity_on_hand,updated_at) values(v_bill.outlet_id,v_line.item_id,0,now()) on conflict(outlet_id,item_id) do nothing;
  select quantity_on_hand into v_balance from public.outlet_inventory where outlet_id=v_bill.outlet_id and item_id=v_line.item_id for update;
  v_next:=v_balance-v_line.base_quantity;
  if v_next<0 then raise exception 'Cannot remove this purchase: some of its stock has already been used'; end if;
  v_old:=jsonb_build_object('billNumber',v_bill.bill_number,'itemId',v_line.item_id,'itemName',v_line.item_name,'quantity',v_line.quantity,'unit',v_line.unit,'baseQuantity',v_line.base_quantity,'baseUnit',v_line.inventory_unit,'totalPaid',v_bill.total_amount,'paidAmount',v_bill.paid_amount,'notes',v_bill.notes);
  update public.outlet_inventory set quantity_on_hand=v_next,updated_at=now() where outlet_id=v_bill.outlet_id and item_id=v_line.item_id;
  insert into public.inventory_movements(outlet_id,item_id,movement_type,quantity_delta,balance_after,reference_type,reference_id,notes,created_by,occurred_at,item_name_snapshot,inventory_unit_snapshot)
  values(v_bill.outlet_id,v_line.item_id,'ADJUSTMENT',-v_line.base_quantity,v_next,'LOCAL_PURCHASE_REMOVE',p_bill_id,v_reason||' · '||v_bill.bill_number,p_user,now(),v_name,v_unit);
  update public.supply_bills set status='VOID',voided_at=now(),voided_by=p_user,void_reason=v_reason,updated_at=now() where id=p_bill_id;
  insert into public.local_purchase_edit_history(bill_id,action,old_values,new_values,changed_by)
  values(p_bill_id,'REMOVE',v_old,jsonb_build_object('reason',v_reason,'stockReversed',v_line.base_quantity),p_user);
  return true;
end; $$;

revoke all on function public.edit_local_purchase(uuid,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.void_local_purchase(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.edit_local_purchase(uuid,jsonb,uuid) to service_role;
grant execute on function public.void_local_purchase(uuid,uuid,text) to service_role;

commit;
