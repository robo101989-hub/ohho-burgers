begin;

alter table public.inventory_packaging_rules
  add column if not exists maximum_order_item_count integer;

alter table public.inventory_packaging_rules
  drop constraint if exists inventory_packaging_rules_minimum_order_item_count_check;
alter table public.inventory_packaging_rules
  add constraint inventory_packaging_rules_minimum_order_item_count_check
  check ((consumption_type='PER_ORDER_SIZE' and packaging_group is not null
            and minimum_order_item_count >= 1
            and (maximum_order_item_count is null or maximum_order_item_count >= minimum_order_item_count))
      or (consumption_type='PER_ORDER_SIZE' and packaging_group is null
            and minimum_order_item_count is null and maximum_order_item_count is null)
      or (consumption_type<>'PER_ORDER_SIZE'
            and minimum_order_item_count is null and maximum_order_item_count is null));

-- Allow multiple rules for the same package size when their item-count bands differ.
drop index if exists public.inventory_packaging_group_scope_unique;
create unique index inventory_packaging_group_scope_unique
  on public.inventory_packaging_rules(packaging_group,consumption_type,coalesce(order_size_tier,''),
    coalesce(minimum_order_item_count,0),coalesce(maximum_order_item_count,0),
    coalesce(menu_item_id,'00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(menu_category_id,'00000000-0000-0000-0000-000000000000'::uuid))
  where packaging_group is not null;

-- Pick the largest package whose item-count band matches. Item/category size
-- minimums can raise that selection; if they do, use the nearest configured
-- band for that larger package.
do $$
declare
  function_definition text;
  old_selection text := $old$
        select candidate.*
        from public.inventory_packaging_rules candidate
        where candidate.packaging_group=package_groups.packaging_group
          and candidate.consumption_type='PER_ORDER_SIZE' and candidate.active and new.order_type=any(candidate.order_types)
        order by case when case candidate.order_size_tier when 'SMALL' then 1 when 'MEDIUM' then 2 else 3 end >= greatest(
            coalesce((select max(case pr.order_size_tier when 'SMALL' then 1 when 'MEDIUM' then 2 else 3 end)
              from public.inventory_packaging_rules pr
              where pr.active and pr.packaging_group=package_groups.packaging_group
                and pr.consumption_type='PER_ORDER_SIZE' and new.order_type=any(pr.order_types)
                and pr.minimum_order_item_count<=v_item_count),1),coalesce(overrides.minimum_rank,1)) then 0 else 1 end,
          abs(case candidate.order_size_tier when 'SMALL' then 1 when 'MEDIUM' then 2 else 3 end - greatest(
            coalesce((select max(case pr.order_size_tier when 'SMALL' then 1 when 'MEDIUM' then 2 else 3 end)
              from public.inventory_packaging_rules pr
              where pr.active and pr.packaging_group=package_groups.packaging_group
                and pr.consumption_type='PER_ORDER_SIZE' and new.order_type=any(pr.order_types)
                and pr.minimum_order_item_count<=v_item_count),1),coalesce(overrides.minimum_rank,1))),
          case candidate.order_size_tier when 'LARGE' then 3 when 'MEDIUM' then 2 else 1 end desc
        limit 1
$old$;
  new_selection text := $new$
        select candidate.*
        from public.inventory_packaging_rules candidate
        cross join lateral (
          select greatest(
            coalesce((select max(case pr.order_size_tier when 'SMALL' then 1 when 'MEDIUM' then 2 else 3 end)
              from public.inventory_packaging_rules pr
              where pr.active and pr.packaging_group=package_groups.packaging_group
                and pr.consumption_type='PER_ORDER_SIZE' and new.order_type=any(pr.order_types)
                and pr.minimum_order_item_count<=v_item_count
                and (pr.maximum_order_item_count is null or pr.maximum_order_item_count>=v_item_count)),1),
            coalesce(overrides.minimum_rank,1)) target_rank
        ) desired
        where candidate.packaging_group=package_groups.packaging_group
          and candidate.consumption_type='PER_ORDER_SIZE' and candidate.active and new.order_type=any(candidate.order_types)
        order by case when case candidate.order_size_tier when 'SMALL' then 1 when 'MEDIUM' then 2 else 3 end >= desired.target_rank then 0 else 1 end,
          case when candidate.minimum_order_item_count<=v_item_count
            and (candidate.maximum_order_item_count is null or candidate.maximum_order_item_count>=v_item_count) then 0 else 1 end,
          abs(case candidate.order_size_tier when 'SMALL' then 1 when 'MEDIUM' then 2 else 3 end - desired.target_rank),
          case candidate.order_size_tier when 'LARGE' then 3 when 'MEDIUM' then 2 else 1 end desc,
          abs(candidate.minimum_order_item_count-v_item_count)
        limit 1
$new$;
begin
  select pg_get_functiondef('public.apply_completed_order_inventory()'::regprocedure)
  into function_definition;
  if position(old_selection in function_definition)=0 then
    raise exception 'Could not locate the current package-size selection logic';
  end if;
  execute replace(function_definition,old_selection,new_selection);
end;
$$;

commit;
