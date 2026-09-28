alter table public.staff_consumable_rules
  add column if not exists consumption_basis text not null default 'PER_STAFF';

alter table public.staff_consumable_rules
  drop constraint if exists staff_consumable_rules_consumption_basis_check;
alter table public.staff_consumable_rules
  add constraint staff_consumable_rules_consumption_basis_check
  check (consumption_basis in ('PER_STAFF','PER_SESSION'));

create or replace function public.confirm_staff_consumption(p_outlet_id uuid,p_staff_count integer,p_user uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_event_id uuid:=gen_random_uuid();v_session_id uuid;r record;v_total numeric(14,3);v_balance numeric(14,3);
begin
  if p_staff_count is null or p_staff_count<=0 or p_staff_count>100 then raise exception 'Enter a valid working staff count';end if;
  select id into v_session_id from public.outlet_sales_sessions where outlet_id=p_outlet_id and closed_at is null order by opened_at desc limit 1;
  if v_session_id is null then raise exception 'Open the outlet session before confirming staff consumption';end if;
  perform pg_advisory_xact_lock(hashtext(v_session_id::text));
  if exists(select 1 from public.staff_consumption_events where session_id=v_session_id) then raise exception 'Staff consumption is already confirmed for this session';end if;
  if not exists(select 1 from public.staff_consumable_rules where active) then raise exception 'Configure at least one active staff consumable';end if;
  insert into public.staff_consumption_events(id,outlet_id,session_id,staff_count,confirmed_by) values(v_event_id,p_outlet_id,v_session_id,p_staff_count,p_user);
  for r in select rule.item_id,rule.quantity_per_staff,rule.consumption_basis,item.name,item.inventory_unit from public.staff_consumable_rules rule join public.inventory_items item on item.id=rule.item_id where rule.active and item.active order by item.name,item.id loop
    v_total:=round(r.quantity_per_staff*(case when r.consumption_basis='PER_SESSION' then 1 else p_staff_count end),3);
    update public.outlet_inventory set quantity_on_hand=quantity_on_hand-v_total,updated_at=now()
      where outlet_id=p_outlet_id and item_id=r.item_id and quantity_on_hand>=v_total returning quantity_on_hand into v_balance;
    if not found then raise exception 'Insufficient stock for staff consumable: %',r.name;end if;
    insert into public.staff_consumption_event_items(event_id,item_id,quantity_per_staff,total_quantity,balance_after) values(v_event_id,r.item_id,r.quantity_per_staff,v_total,v_balance);
    insert into public.inventory_movements(outlet_id,item_id,movement_type,quantity_delta,balance_after,reference_type,reference_id,notes,created_by,occurred_at,item_name_snapshot,inventory_unit_snapshot,rule_snapshot)
    values(p_outlet_id,r.item_id,'STAFF_CONSUMPTION',-v_total,v_balance,'STAFF_CONSUMPTION',v_event_id,'Daily-use consumable for '||p_staff_count||' working staff',p_user,now(),r.name,r.inventory_unit,jsonb_build_object('source','STAFF_CONSUMPTION','sessionId',v_session_id,'staffCount',p_staff_count,'consumptionBasis',r.consumption_basis,'configuredQuantity',r.quantity_per_staff));
  end loop;
  return v_event_id;
end;$$;

revoke all on function public.confirm_staff_consumption(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.confirm_staff_consumption(uuid,integer,uuid) to service_role;
