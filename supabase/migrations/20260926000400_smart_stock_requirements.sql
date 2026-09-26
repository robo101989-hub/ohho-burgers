alter table public.inventory_items add column if not exists target_stock_level numeric(14,3) not null default 0 check(target_stock_level>=0);

alter table public.franchise_stock_requests drop constraint if exists franchise_stock_requests_status_check;
alter table public.franchise_stock_requests add constraint franchise_stock_requests_status_check
  check(status in ('DRAFT','SUBMITTED','PARTIAL','FULFILLED','CANCELLED'));

create unique index if not exists franchise_one_draft_per_owner_outlet
on public.franchise_stock_requests(created_by,outlet_id) where status='DRAFT';

create or replace function public.save_franchise_stock_request(
  p_request_id uuid,p_outlet_id uuid,p_required_for date,p_items jsonb,
  p_notes text,p_status text,p_user uuid
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_request_id uuid:=p_request_id;r record;v_existing record;
begin
  if p_status not in ('DRAFT','SUBMITTED') or p_required_for<current_date or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Select a valid date and at least one item';
  end if;
  if v_request_id is null and p_status='DRAFT' then
    select id into v_request_id from public.franchise_stock_requests
    where outlet_id=p_outlet_id and created_by=p_user and status='DRAFT' limit 1 for update;
  end if;
  if v_request_id is null then
    v_request_id:=gen_random_uuid();
    insert into public.franchise_stock_requests(id,outlet_id,required_for,status,notes,created_by)
    values(v_request_id,p_outlet_id,p_required_for,p_status,nullif(trim(p_notes),''),p_user);
  else
    select id,status,outlet_id,created_by into v_existing from public.franchise_stock_requests where id=v_request_id for update;
    if not found or v_existing.status<>'DRAFT' or v_existing.outlet_id<>p_outlet_id or v_existing.created_by<>p_user then
      raise exception 'This requirement can no longer be edited';
    end if;
    update public.franchise_stock_requests set required_for=p_required_for,status=p_status,notes=nullif(trim(p_notes),''),updated_at=now() where id=v_request_id;
    delete from public.franchise_stock_request_items where request_id=v_request_id;
  end if;
  for r in select * from jsonb_to_recordset(p_items) x(item_id uuid,item_name text,unit text,quantity numeric,fixed_unit_price numeric) loop
    if r.quantity<=0 or r.unit not in ('KG','PIECE') then raise exception 'Invalid request item';end if;
    insert into public.franchise_stock_request_items(request_id,item_id,item_name,unit,quantity,fixed_unit_price)
    values(v_request_id,r.item_id,r.item_name,r.unit,r.quantity,r.fixed_unit_price);
  end loop;
  return v_request_id;
end;$$;

revoke all on function public.save_franchise_stock_request(uuid,uuid,date,jsonb,text,text,uuid) from public,anon,authenticated;
grant execute on function public.save_franchise_stock_request(uuid,uuid,date,jsonb,text,text,uuid) to service_role;
