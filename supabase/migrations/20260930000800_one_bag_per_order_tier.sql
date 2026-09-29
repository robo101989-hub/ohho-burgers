begin;

-- Order item count selects the bag size. The current policy uses one bag per
-- order; admins can change these quantities later if an outlet needs more.
update public.inventory_packaging_rules
set consumption_quantity=1,updated_at=now()
where active and packaging_group in ('BROWN_BAG','CARRY_BAG')
  and consumption_type='PER_ORDER_SIZE' and consumption_quantity<>1;

commit;
