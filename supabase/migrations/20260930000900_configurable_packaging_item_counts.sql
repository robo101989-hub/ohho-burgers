begin;

alter table public.inventory_packaging_rules
  add column if not exists minimum_order_item_count integer;

-- Keep current production behavior as editable defaults. Admins can now set
-- the item-count threshold for every bag size independently.
update public.inventory_packaging_rules
set minimum_order_item_count = case order_size_tier
      when 'SMALL' then 1
      when 'MEDIUM' then 2
      when 'LARGE' then 3
    end
where consumption_type='PER_ORDER_SIZE' and packaging_group is not null
  and minimum_order_item_count is null;

update public.inventory_packaging_rules
set minimum_order_item_count = null
where consumption_type<>'PER_ORDER_SIZE' and minimum_order_item_count is not null;

alter table public.inventory_packaging_rules
  drop constraint if exists inventory_packaging_rules_minimum_order_item_count_check;
alter table public.inventory_packaging_rules
  add constraint inventory_packaging_rules_minimum_order_item_count_check
  check ((consumption_type='PER_ORDER_SIZE' and packaging_group is not null and minimum_order_item_count >= 1)
      or (consumption_type='PER_ORDER_SIZE' and packaging_group is null and minimum_order_item_count is null)
      or (consumption_type<>'PER_ORDER_SIZE' and minimum_order_item_count is null));

-- Update the existing order completion trigger without duplicating its other
-- inventory behavior. Select the size using admin-configured item thresholds,
-- then honor any item/category minimum size rule.
do $$
declare
  function_definition text;
  old_ordering text := $old$
        order by case when case candidate.order_size_tier when 'SMALL' then 1 when 'MEDIUM' then 2 else 3 end >= greatest(
            case when v_item_count<=1 then 1 when v_item_count=2 then 2 else 3 end,coalesce(overrides.minimum_rank,1)) then 0 else 1 end,
          abs(case candidate.order_size_tier when 'SMALL' then 1 when 'MEDIUM' then 2 else 3 end - greatest(
            case when v_item_count<=1 then 1 when v_item_count=2 then 2 else 3 end,coalesce(overrides.minimum_rank,1))),
          case candidate.order_size_tier when 'LARGE' then 3 when 'MEDIUM' then 2 else 1 end desc
        limit 1
$old$;
  new_ordering text := $new$
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
$new$;
begin
  select pg_get_functiondef('public.apply_completed_order_inventory()'::regprocedure)
  into function_definition;
  if position(old_ordering in function_definition)=0 then
    raise exception 'Could not locate the current order-size selection logic';
  end if;
  execute replace(function_definition,old_ordering,new_ordering);
end;
$$;

commit;
