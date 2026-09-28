-- One recipe now describes food, takeaway/delivery packaging, and dine-in service items.
alter table public.menu_item_recipes
  add column if not exists usage_type text not null default 'FOOD';

update public.menu_item_recipes
set usage_type = case when is_packaging then 'TAKEAWAY_DELIVERY' else 'FOOD' end
where usage_type is null or usage_type = 'FOOD';

alter table public.menu_item_recipes drop constraint if exists menu_item_recipes_usage_type_check;
alter table public.menu_item_recipes add constraint menu_item_recipes_usage_type_check
  check (usage_type in ('FOOD','TAKEAWAY_DELIVERY','DINE_IN'));

create or replace function public.sync_recipe_usage_type()
returns trigger language plpgsql set search_path=public as $$
begin
  new.usage_type := coalesce(new.usage_type, case when new.is_packaging then 'TAKEAWAY_DELIVERY' else 'FOOD' end);
  new.is_packaging := new.usage_type <> 'FOOD';
  return new;
end;$$;

drop trigger if exists sync_recipe_usage_type_before_write on public.menu_item_recipes;
create trigger sync_recipe_usage_type_before_write
before insert or update on public.menu_item_recipes
for each row execute function public.sync_recipe_usage_type();

create or replace function public.apply_completed_order_inventory()
returns trigger language plpgsql security definer set search_path=public as $$
declare r record; v_balance numeric(14,3);
begin
  if new.status <> 'COMPLETED' or old.status = 'COMPLETED' then return new; end if;
  if exists (
    select 1 from public.order_items ol where ol.order_id=new.id and not exists (
      select 1 from public.menu_item_recipes recipe
      where recipe.menu_item_id=ol.menu_item_id and recipe.usage_type='FOOD'
    )
  ) then raise exception 'Configure food recipes for every menu item before completing this order'; end if;

  insert into public.inventory_order_effects(order_id,outlet_id) values(new.id,new.outlet_id) on conflict(order_id) do nothing;
  if not found then return new; end if;

  for r in
    with effects as (
      select recipe.inventory_item_id item_id,
        case when recipe.usage_type='FOOD' then 'SALE_DEDUCTION' else 'PACKAGING_CONSUMPTION' end movement_type,
        sum(recipe.base_quantity*ol.quantity)::numeric(14,3) used_quantity,
        jsonb_build_object('type','RECIPE','usageType',recipe.usage_type,'orderType',new.order_type) rule_snapshot
      from public.order_items ol join public.menu_item_recipes recipe on recipe.menu_item_id=ol.menu_item_id
      where ol.order_id=new.id and (
        recipe.usage_type='FOOD'
        or (recipe.usage_type='DINE_IN' and new.order_type='DINE_IN')
        or (recipe.usage_type='TAKEAWAY_DELIVERY' and new.order_type in ('TAKEAWAY','DELIVERY','PICKUP'))
      )
      group by recipe.inventory_item_id,recipe.usage_type
      union all
      select pr.item_id,'PACKAGING_CONSUMPTION',
        case pr.consumption_type
          when 'PER_ORDER' then pr.consumption_quantity
          when 'PER_MENU_ITEM' then pr.consumption_quantity*coalesce((select sum(ol.quantity) from public.order_items ol where ol.order_id=new.id and ol.menu_item_id=pr.menu_item_id),0)
          when 'PER_MENU_CATEGORY' then pr.consumption_quantity*coalesce((select sum(ol.quantity) from public.order_items ol join public.menu_items mi on mi.id=ol.menu_item_id where ol.order_id=new.id and mi.category_id=pr.menu_category_id),0)
        end,
        jsonb_build_object('type',pr.consumption_type,'orderTypes',pr.order_types,'quantity',pr.consumption_quantity,'menuItemId',pr.menu_item_id,'menuCategoryId',pr.menu_category_id)
      from public.inventory_packaging_rules pr
      where pr.active and new.order_type=any(pr.order_types)
        and not (
          pr.consumption_type='PER_MENU_ITEM' and exists (
            select 1 from public.menu_item_recipes recipe
            where recipe.menu_item_id=pr.menu_item_id and recipe.inventory_item_id=pr.item_id and recipe.usage_type<>'FOOD'
          )
        )
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
      case when r.movement_type='PACKAGING_CONSUMPTION' then 'Order-type item for '||new.order_type||' order ' else 'Recipe deduction for order ' end||coalesce(new.order_number::text,new.id::text),
      auth.uid(),now(),r.item_name,r.inventory_unit,r.rule_snapshot);
  end loop;
  return new;
end;$$;

revoke all on function public.sync_recipe_usage_type() from public,anon,authenticated;
revoke all on function public.apply_completed_order_inventory() from public,anon,authenticated;
grant execute on function public.apply_completed_order_inventory() to service_role;
