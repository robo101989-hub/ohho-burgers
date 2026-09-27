begin;

-- The physical Master Item rule is one 80 g patty. Legacy receipt history
-- included an incorrect piece count and cannot be used to infer this factor.
update public.inventory_items
set request_to_inventory=1,
    billing_to_inventory=12.5,
    updated_at=now()
where name ilike '%Crispy Chicken Patty%'
  and request_unit='PIECE'
  and billing_unit='KG'
  and inventory_unit='EACH';

commit;
