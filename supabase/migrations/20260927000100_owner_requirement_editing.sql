begin;
alter table public.franchise_stock_requests add column if not exists processing_started_at timestamptz;

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
    select id,status,outlet_id,created_by,bill_id,processing_started_at into v_existing from public.franchise_stock_requests where id=v_request_id for update;
    if not found or v_existing.status not in ('DRAFT','SUBMITTED') or v_existing.bill_id is not null or v_existing.processing_started_at is not null or v_existing.outlet_id<>p_outlet_id or v_existing.created_by<>p_user then raise exception 'This requirement can no longer be edited';end if;
    if v_existing.status='SUBMITTED' and p_status<>'SUBMITTED' then raise exception 'Use Save Changes for a sent requirement';end if;
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

create or replace function public.set_stock_request_processing(p_request_id uuid,p_start boolean,p_expected_updated_at timestamptz default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare r record;
begin
  select * into r from public.franchise_stock_requests where id=p_request_id for update;
  if not found or r.status not in ('SUBMITTED','PARTIAL') then raise exception 'Requirement is no longer available for processing';end if;
  if p_expected_updated_at is not null and r.updated_at is distinct from p_expected_updated_at then raise exception 'Requirement changed. Reload it before billing';end if;
  update public.franchise_stock_requests set processing_started_at=case when p_start then coalesce(processing_started_at,now()) else null end where id=p_request_id;
  return p_request_id;
end;$$;
revoke all on function public.set_stock_request_processing(uuid,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.set_stock_request_processing(uuid,boolean,timestamptz) to service_role;
commit;
