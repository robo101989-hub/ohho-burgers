alter table public.menu_item_recipes add column if not exists is_packaging boolean not null default false;

create table if not exists public.kitchen_wastage (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  wastage_type text not null check (wastage_type in ('MENU_ITEM','STOCK_ITEM')),
  menu_item_id uuid references public.menu_items(id) on delete restrict,
  stock_item_id uuid references public.inventory_items(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity>0),
  reason text not null check (reason in ('BURNT','DAMAGED_DROPPED','SPOILED_EXPIRED','PREPARATION_WASTE','OTHER')),
  packaging_used boolean not null default false,
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check ((wastage_type='MENU_ITEM' and menu_item_id is not null and stock_item_id is null) or
         (wastage_type='STOCK_ITEM' and stock_item_id is not null and menu_item_id is null))
);

alter table public.kitchen_wastage enable row level security;
revoke all on public.kitchen_wastage from anon,authenticated;
grant select on public.kitchen_wastage to authenticated;
create policy kitchen_wastage_read on public.kitchen_wastage for select to authenticated
using (public.inventory_scope_allowed(outlet_id));

create or replace function public.record_kitchen_wastage(
  p_outlet_id uuid,p_type text,p_menu_item_id uuid,p_stock_item_id uuid,
  p_quantity numeric,p_base_quantity numeric,p_reason text,p_packaging_used boolean,p_note text,p_user uuid
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid:=gen_random_uuid(); r record; v_balance numeric(14,3);
begin
  if p_quantity<=0 or p_type not in ('MENU_ITEM','STOCK_ITEM') or p_reason not in ('BURNT','DAMAGED_DROPPED','SPOILED_EXPIRED','PREPARATION_WASTE','OTHER') then
    raise exception 'Invalid wastage entry';
  end if;
  if p_type='MENU_ITEM' and not exists(select 1 from public.menu_item_recipes where menu_item_id=p_menu_item_id) then
    raise exception 'Configure this menu item recipe before recording wastage';
  end if;
  if p_type='STOCK_ITEM' and (p_stock_item_id is null or p_base_quantity<=0) then raise exception 'Invalid stock wastage quantity'; end if;
  insert into public.kitchen_wastage(id,outlet_id,wastage_type,menu_item_id,stock_item_id,quantity,reason,packaging_used,note,created_by)
  values(v_id,p_outlet_id,p_type,p_menu_item_id,p_stock_item_id,p_quantity,p_reason,coalesce(p_packaging_used,false),nullif(trim(p_note),''),p_user);

  for r in
    select x.item_id,sum(x.used)::numeric(14,3) used from (
      select recipe.inventory_item_id item_id,recipe.base_quantity*p_quantity used
      from public.menu_item_recipes recipe
      where p_type='MENU_ITEM' and recipe.menu_item_id=p_menu_item_id
        and (not recipe.is_packaging or coalesce(p_packaging_used,false))
      union all
      select p_stock_item_id,p_base_quantity where p_type='STOCK_ITEM'
    ) x group by x.item_id order by x.item_id
  loop
    if r.item_id is null or r.used<=0 then raise exception 'Wastage item has no valid recipe or quantity'; end if;
    update public.outlet_inventory set quantity_on_hand=quantity_on_hand-r.used,updated_at=now()
    where outlet_id=p_outlet_id and item_id=r.item_id and quantity_on_hand>=r.used
    returning quantity_on_hand into v_balance;
    if not found then raise exception 'Wastage exceeds available stock'; end if;
    insert into public.inventory_movements(outlet_id,item_id,movement_type,quantity_delta,balance_after,reference_type,reference_id,notes,created_by)
    values(p_outlet_id,r.item_id,'WASTE',-r.used,v_balance,'KITCHEN_WASTAGE',v_id,p_reason || coalesce(' · '||nullif(trim(p_note),''),''),p_user);
  end loop;
  return v_id;
end; $$;

revoke all on function public.record_kitchen_wastage(uuid,text,uuid,uuid,numeric,numeric,text,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.record_kitchen_wastage(uuid,text,uuid,uuid,numeric,numeric,text,boolean,text,uuid) to service_role;
