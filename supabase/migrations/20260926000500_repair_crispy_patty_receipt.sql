alter table public.franchise_stock_request_items
  drop constraint if exists franchise_stock_request_items_unit_check;
alter table public.franchise_stock_request_items
  add constraint franchise_stock_request_items_unit_check
  check (unit in ('KG','PIECE','EACH'));

do $$
declare
  v_bill_id uuid;
  v_item_id uuid;
  v_outlet_id uuid;
  v_supplied_at timestamptz;
  v_request_line_id uuid;
  v_old_base numeric;
  v_corrected_pieces numeric;
  v_delta numeric;
  v_current_balance numeric;
begin
  select sb.id,sbi.item_id,sb.outlet_id,sb.supplied_at,sbi.base_quantity,
         fsri.id,fsri.quantity
  into v_bill_id,v_item_id,v_outlet_id,v_supplied_at,v_old_base,
       v_request_line_id,v_corrected_pieces
  from public.supply_bills sb
  join public.supply_bill_items sbi on sbi.bill_id=sb.id
  join public.inventory_items item on item.id=sbi.item_id
  join public.franchise_stock_requests fsr on fsr.bill_id=sb.id
  join public.franchise_stock_request_items fsri
    on fsri.request_id=fsr.id and fsri.item_id=sbi.item_id
  where sb.bill_number='OHHO-SUP-20260925-00001'
    and item.name='Crispy Chicken Patty'
    and item.measurement_type='PIECE_KG'
    and sbi.unit='KG'
    and sbi.quantity=2.5
    and sbi.base_quantity=2500
    and fsri.quantity=30
  for update of sbi,fsri;

  if not found then
    return;
  end if;

  select quantity_on_hand into v_current_balance
  from public.outlet_inventory
  where outlet_id=v_outlet_id and item_id=v_item_id
  for update;

  v_delta:=v_corrected_pieces-v_old_base;
  if v_current_balance+v_delta<0 then
    raise exception 'Patty correction would create a negative balance';
  end if;

  update public.outlet_inventory
  set quantity_on_hand=quantity_on_hand+v_delta,updated_at=now()
  where outlet_id=v_outlet_id and item_id=v_item_id;

  update public.inventory_movements
  set balance_after=balance_after+v_delta
  where outlet_id=v_outlet_id and item_id=v_item_id and occurred_at>=v_supplied_at;

  update public.inventory_movements
  set quantity_delta=v_corrected_pieces
  where reference_type='SUPPLY_BILL' and reference_id=v_bill_id
    and item_id=v_item_id and movement_type='STOCK_RECEIVED';

  update public.supply_bill_items
  set base_quantity=v_corrected_pieces
  where bill_id=v_bill_id and item_id=v_item_id;

  update public.franchise_stock_request_items
  set unit='PIECE'
  where id=v_request_line_id;
end $$;
