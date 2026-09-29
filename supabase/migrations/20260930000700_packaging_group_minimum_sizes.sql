begin;

alter table public.inventory_packaging_rules
  add column if not exists packaging_group text;

-- Move the existing owner-configured size-specific bag stock items into the
-- order tier rule, preserving their quantities and selected order types. The
-- previous PER_ORDER rows all fired together for each order.
update public.inventory_packaging_rules pr
set consumption_type='PER_ORDER_SIZE',
    packaging_group=case when i.sku like 'BROWN-BAG-%' then 'BROWN_BAG' else 'CARRY_BAG' end,
    order_size_tier=case
      when i.sku like '%-SMALL' then 'SMALL'
      when i.sku like '%-MEDIUM' then 'MEDIUM'
      when i.sku like '%-LARGE' then 'LARGE'
    end,
    updated_at=now()
from public.inventory_items i
where i.id=pr.item_id and pr.consumption_type='PER_ORDER'
  and i.sku in ('BROWN-BAG-SMALL','BROWN-BAG-MEDIUM','BROWN-BAG-LARGE',
                'CARRY-BAG-SMALL','CARRY-BAG-MEDIUM','CARRY-BAG-LARGE');

-- Carry Bag-small exists in stock but did not yet have its own order-tier row.
insert into public.inventory_packaging_rules
  (item_id,order_types,consumption_type,consumption_quantity,order_size_tier,packaging_group)
select i.id,array['TAKEAWAY','DELIVERY']::text[],'PER_ORDER_SIZE',1,'SMALL','CARRY_BAG'
from public.inventory_items i
where i.sku='CARRY-BAG-SMALL'
  and not exists (select 1 from public.inventory_packaging_rules pr
    where pr.item_id=i.id and pr.consumption_type='PER_ORDER_SIZE' and pr.order_size_tier='SMALL');

-- Bag stock belongs to order-level packaging. Remove its old recipe mappings
-- so the same bag is never charged as a menu ingredient as well.
delete from public.menu_item_recipes recipe
using public.inventory_items i
where i.id=recipe.inventory_item_id
  and i.sku in ('BROWN-BAG-SMALL','BROWN-BAG-MEDIUM','BROWN-BAG-LARGE',
                'CARRY-BAG-SMALL','CARRY-BAG-MEDIUM','CARRY-BAG-LARGE');

alter table public.inventory_packaging_rules
  drop constraint if exists inventory_packaging_rules_consumption_type_check;
alter table public.inventory_packaging_rules
  add constraint inventory_packaging_rules_consumption_type_check
  check (consumption_type in ('PER_ORDER','PER_MENU_ITEM','PER_MENU_CATEGORY','PER_ORDER_SIZE','MINIMUM_ITEM_SIZE','MINIMUM_CATEGORY_SIZE'));

alter table public.inventory_packaging_rules
  drop constraint if exists inventory_packaging_rules_scope_check;
alter table public.inventory_packaging_rules
  add constraint inventory_packaging_rules_scope_check
  check ((consumption_type='PER_ORDER' and menu_item_id is null and menu_category_id is null)
      or (consumption_type='PER_MENU_ITEM' and menu_item_id is not null and menu_category_id is null)
      or (consumption_type='PER_MENU_CATEGORY' and menu_item_id is null and menu_category_id is not null)
      or (consumption_type='PER_ORDER_SIZE' and menu_item_id is null and menu_category_id is null)
      or (consumption_type='MINIMUM_ITEM_SIZE' and menu_item_id is not null and menu_category_id is null)
      or (consumption_type='MINIMUM_CATEGORY_SIZE' and menu_item_id is null and menu_category_id is not null));

alter table public.inventory_packaging_rules
  drop constraint if exists inventory_packaging_rules_order_size_tier_check;
alter table public.inventory_packaging_rules
  add constraint inventory_packaging_rules_order_size_tier_check
  check (((consumption_type in ('PER_ORDER_SIZE','MINIMUM_ITEM_SIZE','MINIMUM_CATEGORY_SIZE'))
          and order_size_tier is not null and order_size_tier in ('SMALL','MEDIUM','LARGE'))
      or (consumption_type not in ('PER_ORDER_SIZE','MINIMUM_ITEM_SIZE','MINIMUM_CATEGORY_SIZE') and order_size_tier is null));

alter table public.inventory_packaging_rules
  drop constraint if exists inventory_packaging_rules_packaging_group_check;
alter table public.inventory_packaging_rules
  add constraint inventory_packaging_rules_packaging_group_check
  check ((packaging_group is null and consumption_type not in ('MINIMUM_ITEM_SIZE','MINIMUM_CATEGORY_SIZE'))
      or (packaging_group in ('BROWN_BAG','CARRY_BAG')
          and consumption_type in ('PER_ORDER_SIZE','MINIMUM_ITEM_SIZE','MINIMUM_CATEGORY_SIZE')));

drop index if exists public.inventory_packaging_group_scope_unique;
create unique index inventory_packaging_group_scope_unique
  on public.inventory_packaging_rules(packaging_group,consumption_type,coalesce(order_size_tier,''),coalesce(menu_item_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(menu_category_id,'00000000-0000-0000-0000-000000000000'::uuid))
  where packaging_group is not null;

-- The live menu has a PIZZAS category without separate size variants, so all
-- pizzas require at least a Medium carry bag. Larger order tiers still win.
insert into public.inventory_packaging_rules
  (item_id,order_types,consumption_type,consumption_quantity,order_size_tier,packaging_group,menu_category_id)
select i.id,array['TAKEAWAY','DELIVERY']::text[],'MINIMUM_CATEGORY_SIZE',1,'MEDIUM','CARRY_BAG',c.id
from public.inventory_items i cross join public.menu_categories c
where i.sku='CARRY-BAG-MEDIUM' and upper(c.name)='PIZZAS'
  and not exists (select 1 from public.inventory_packaging_rules pr
    where pr.packaging_group='CARRY_BAG' and pr.consumption_type='MINIMUM_CATEGORY_SIZE'
      and pr.order_size_tier='MEDIUM' and pr.menu_category_id=c.id);

create or replace function public.apply_completed_order_inventory()
returns trigger language plpgsql security definer set search_path=public as $$
declare r record; v_balance numeric(14,3); v_item_count numeric;
begin
  if new.status <> 'COMPLETED' or old.status = 'COMPLETED' then return new; end if;
  if exists (
    select 1 from public.order_items ol where ol.order_id=new.id and not exists (
      select 1 from public.menu_item_recipes recipe
      where recipe.menu_item_id=ol.menu_item_id and recipe.usage_type='FOOD'
    )
  ) then raise exception 'Configure food recipes for every menu item before completing this order'; end if;

  select coalesce(sum(greatest(ol.quantity,0)),0) into v_item_count
    from public.order_items ol where ol.order_id=new.id;
  insert into public.inventory_order_effects(order_id,outlet_id) values(new.id,new.outlet_id) on conflict(order_id) do nothing;
  if not found then return new; end if;

  for r in
    with effects as (
      select recipe.inventory_item_id item_id,
        case when recipe.usage_type='FOOD' then 'SALE_DEDUCTION' else 'PACKAGING_CONSUMPTION' end movement_type,
        sum(recipe.base_quantity*ol.quantity)::numeric(14,3) used_quantity,
        jsonb_build_object('type','RECIPE','usageType',recipe.usage_type,'orderType',new.order_type) rule_snapshot
      from public.order_items ol
      join public.menu_item_recipes recipe on recipe.menu_item_id=ol.menu_item_id
      where ol.order_id=new.id and (
        recipe.usage_type='FOOD'
        or (
          (
            (recipe.usage_type='DINE_IN' and new.order_type='DINE_IN')
            or (recipe.usage_type='TAKEAWAY_DELIVERY' and new.order_type in ('TAKEAWAY','DELIVERY','PICKUP'))
          )
          and not exists (
            select 1 from public.inventory_packaging_rules pr
            where pr.active and pr.item_id=recipe.inventory_item_id and new.order_type=any(pr.order_types)
              and (
                pr.consumption_type='PER_ORDER'
                or (pr.consumption_type='PER_MENU_ITEM' and pr.menu_item_id=recipe.menu_item_id)
                or (pr.consumption_type='PER_MENU_CATEGORY' and exists (
                  select 1 from public.order_items scoped_ol
                  join public.menu_items scoped_menu on scoped_menu.id=scoped_ol.menu_item_id
                  where scoped_ol.order_id=new.id and scoped_ol.menu_item_id=recipe.menu_item_id and scoped_menu.category_id=pr.menu_category_id
                ))
                or pr.consumption_type='PER_ORDER_SIZE'
                or (pr.packaging_group is not null and pr.consumption_type in ('MINIMUM_ITEM_SIZE','MINIMUM_CATEGORY_SIZE'))
              )
          )
        )
      )
      group by recipe.inventory_item_id,recipe.usage_type
      union all
      select pr.item_id,'PACKAGING_CONSUMPTION',
        case pr.consumption_type
          when 'PER_ORDER' then pr.consumption_quantity
          when 'PER_MENU_ITEM' then pr.consumption_quantity*coalesce((select sum(ol.quantity) from public.order_items ol where ol.order_id=new.id and ol.menu_item_id=pr.menu_item_id),0)
          when 'PER_MENU_CATEGORY' then pr.consumption_quantity*coalesce((select sum(ol.quantity) from public.order_items ol join public.menu_items mi on mi.id=ol.menu_item_id where ol.order_id=new.id and mi.category_id=pr.menu_category_id),0)
          when 'PER_ORDER_SIZE' then pr.consumption_quantity
        end,
        jsonb_build_object('type',pr.consumption_type,'orderType',new.order_type,'orderTypes',pr.order_types,'quantity',pr.consumption_quantity,'menuItemId',pr.menu_item_id,'menuCategoryId',pr.menu_category_id,'orderSizeTier',pr.order_size_tier,'orderItemCount',v_item_count)
      from public.inventory_packaging_rules pr
      where pr.active and new.order_type=any(pr.order_types)
        and pr.consumption_type in ('PER_ORDER','PER_MENU_ITEM','PER_MENU_CATEGORY','PER_ORDER_SIZE')
        and (pr.consumption_type<>'PER_ORDER_SIZE' or (pr.packaging_group is null
          and pr.order_size_tier=case when v_item_count<=1 then 'SMALL' when v_item_count=2 then 'MEDIUM' else 'LARGE' end))
      union all
      select chosen.item_id,'PACKAGING_CONSUMPTION',
        greatest(chosen.consumption_quantity,coalesce(overrides.required_quantity,0)),
        jsonb_build_object('type','PACKAGING_GROUP','group',chosen.packaging_group,'orderType',new.order_type,
          'orderItemCount',v_item_count,'selectedTier',chosen.order_size_tier,
          'baseQuantity',chosen.consumption_quantity,'menuMinimumQuantity',coalesce(overrides.required_quantity,0))
      from (
        select distinct packaging_group
        from public.inventory_packaging_rules
        where active and consumption_type='PER_ORDER_SIZE' and packaging_group is not null and new.order_type=any(order_types)
      ) package_groups
      cross join lateral (
        select (select max(case pr.order_size_tier when 'SMALL' then 1 when 'MEDIUM' then 2 when 'LARGE' then 3 end)
          from public.inventory_packaging_rules pr
          where pr.active and pr.packaging_group=package_groups.packaging_group
            and pr.consumption_type in ('MINIMUM_ITEM_SIZE','MINIMUM_CATEGORY_SIZE') and new.order_type=any(pr.order_types)
            and ((pr.consumption_type='MINIMUM_ITEM_SIZE' and exists(select 1 from public.order_items ol where ol.order_id=new.id and ol.menu_item_id=pr.menu_item_id))
              or (pr.consumption_type='MINIMUM_CATEGORY_SIZE' and exists(select 1 from public.order_items ol join public.menu_items mi on mi.id=ol.menu_item_id where ol.order_id=new.id and mi.category_id=pr.menu_category_id)))) minimum_rank,
          coalesce((select sum(ol.quantity * coalesce((
            select max(pr.consumption_quantity)
            from public.inventory_packaging_rules pr
            where pr.active and pr.packaging_group=package_groups.packaging_group
              and pr.consumption_type in ('MINIMUM_ITEM_SIZE','MINIMUM_CATEGORY_SIZE') and new.order_type=any(pr.order_types)
              and ((pr.consumption_type='MINIMUM_ITEM_SIZE' and pr.menu_item_id=ol.menu_item_id)
                or (pr.consumption_type='MINIMUM_CATEGORY_SIZE' and pr.menu_category_id=mi.category_id))
          ),0)) from public.order_items ol join public.menu_items mi on mi.id=ol.menu_item_id where ol.order_id=new.id),0) required_quantity
      ) overrides
      join lateral (
        select candidate.*
        from public.inventory_packaging_rules candidate
        where candidate.packaging_group=package_groups.packaging_group
          and candidate.consumption_type='PER_ORDER_SIZE' and candidate.active and new.order_type=any(candidate.order_types)
        order by case when case candidate.order_size_tier when 'SMALL' then 1 when 'MEDIUM' then 2 else 3 end >= greatest(
            case when v_item_count<=1 then 1 when v_item_count=2 then 2 else 3 end,coalesce(overrides.minimum_rank,1)) then 0 else 1 end,
          abs(case candidate.order_size_tier when 'SMALL' then 1 when 'MEDIUM' then 2 else 3 end - greatest(
            case when v_item_count<=1 then 1 when v_item_count=2 then 2 else 3 end,coalesce(overrides.minimum_rank,1))),
          case candidate.order_size_tier when 'LARGE' then 3 when 'MEDIUM' then 2 else 1 end desc
        limit 1
      ) chosen on true
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
      case when r.movement_type='PACKAGING_CONSUMPTION' then 'Order-use rule for '||new.order_type||' order ' else 'Recipe deduction for order ' end||coalesce(new.order_number::text,new.id::text),
      auth.uid(),now(),r.item_name,r.inventory_unit,r.rule_snapshot);
  end loop;
  return new;
end;$$;

revoke all on function public.apply_completed_order_inventory() from public,anon,authenticated;
grant execute on function public.apply_completed_order_inventory() to service_role;
commit;
