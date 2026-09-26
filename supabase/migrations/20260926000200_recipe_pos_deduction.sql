create table if not exists public.inventory_order_effects (
  order_id uuid primary key references public.orders(id) on delete restrict,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  applied_at timestamptz not null default now()
);

alter table public.inventory_order_effects enable row level security;
revoke all on public.inventory_order_effects from anon,authenticated;
grant select on public.inventory_order_effects to authenticated;

drop policy if exists inventory_order_effects_read on public.inventory_order_effects;
create policy inventory_order_effects_read on public.inventory_order_effects for select to authenticated
using (public.inventory_scope_allowed(outlet_id));

create unique index if not exists inventory_movement_order_item_unique
on public.inventory_movements(reference_id,item_id)
where reference_type='ORDER' and movement_type='SALE_DEDUCTION';

create or replace function public.apply_completed_order_inventory()
returns trigger language plpgsql security definer set search_path=public as $$
declare r record; v_balance numeric(14,3);
begin
  if new.status <> 'COMPLETED' or old.status = 'COMPLETED' then return new; end if;

  if exists (
    select 1 from public.order_items order_line
    where order_line.order_id=new.id
      and not exists (
        select 1 from public.menu_item_recipes recipe
        where recipe.menu_item_id=order_line.menu_item_id
      )
  ) then
    raise exception 'Configure recipes for every menu item before completing this order';
  end if;

  insert into public.inventory_order_effects(order_id,outlet_id)
  values(new.id,new.outlet_id)
  on conflict(order_id) do nothing;
  if not found then return new; end if;

  for r in
    select recipe.inventory_item_id as item_id,
           sum(recipe.base_quantity * order_line.quantity)::numeric(14,3) as used_quantity
    from public.order_items order_line
    join public.menu_item_recipes recipe on recipe.menu_item_id=order_line.menu_item_id
    where order_line.order_id=new.id
    group by recipe.inventory_item_id
    order by recipe.inventory_item_id
  loop
    update public.outlet_inventory
    set quantity_on_hand=quantity_on_hand-r.used_quantity,updated_at=now()
    where outlet_id=new.outlet_id and item_id=r.item_id and quantity_on_hand>=r.used_quantity
    returning quantity_on_hand into v_balance;
    if not found then raise exception 'Insufficient stock to complete this order'; end if;

    insert into public.inventory_movements(
      outlet_id,item_id,movement_type,quantity_delta,balance_after,
      reference_type,reference_id,notes,created_by,occurred_at
    ) values(
      new.outlet_id,r.item_id,'SALE_DEDUCTION',-r.used_quantity,v_balance,
      'ORDER',new.id,'Recipe deduction for order ' || coalesce(new.order_number::text,new.id::text),auth.uid(),now()
    );
  end loop;
  return new;
end; $$;

drop trigger if exists apply_completed_order_inventory_trigger on public.orders;
create trigger apply_completed_order_inventory_trigger
after update of status on public.orders
for each row execute function public.apply_completed_order_inventory();

revoke all on function public.apply_completed_order_inventory() from public,anon,authenticated;
grant execute on function public.apply_completed_order_inventory() to service_role;
