begin;

-- Master Item is the source of truth for all three units.  Older rows can have
-- supply_unit and billing_unit out of sync, which made a normal one-save edit
-- look like two unit changes and forced Admin through an unnecessary two-step
-- save.  Convert current operational quantities from the configured factors
-- and keep historical bill/movement snapshots unchanged.
create or replace function public.update_inventory_master_item(p_item_id uuid,p_values jsonb,p_user uuid)
returns public.inventory_items language plpgsql security definer set search_path=public as $$
declare
  old_item public.inventory_items%rowtype;
  new_item public.inventory_items%rowtype;
  factor numeric;
  old_billing_unit text;
  new_billing_unit text;
  new_inventory_unit text;
  old_billing_scale numeric;
  new_billing_scale numeric;
  old_billing_dimension text;
  new_billing_dimension text;
  conversion_basis text;
  r record;
  v_new numeric(14,3);
begin
  select * into old_item from public.inventory_items where id=p_item_id for update;
  if not found then raise exception 'Master Item not found';end if;

  old_billing_unit:=coalesce(old_item.supply_unit,old_item.billing_unit);
  new_billing_unit:=p_values->>'billing_unit';
  new_inventory_unit:=p_values->>'inventory_unit';
  factor:=1;
  conversion_basis:='inventory unit unchanged';

  if old_item.inventory_unit<>new_inventory_unit then
    -- Prefer an unchanged business unit as the physical anchor.  This also
    -- repairs legacy rows whose billing_unit differs from supply_unit.
    if old_billing_unit=new_billing_unit then
      factor:=(p_values->>'billing_to_inventory')::numeric/old_item.billing_to_inventory;
      conversion_basis:='unchanged billing unit';
    elsif old_item.request_unit=(p_values->>'request_unit') then
      factor:=(p_values->>'request_to_inventory')::numeric/old_item.request_to_inventory;
      conversion_basis:='unchanged request unit';
    else
      old_billing_dimension:=case
        when old_billing_unit in ('KG','G') then 'MASS'
        when old_billing_unit in ('L','ML') then 'VOLUME'
        when old_billing_unit in ('PIECE','EACH') then 'COUNT'
        else old_billing_unit end;
      new_billing_dimension:=case
        when new_billing_unit in ('KG','G') then 'MASS'
        when new_billing_unit in ('L','ML') then 'VOLUME'
        when new_billing_unit in ('PIECE','EACH') then 'COUNT'
        else new_billing_unit end;
      old_billing_scale:=case when old_billing_unit in ('KG','L') then 1000 else 1 end;
      new_billing_scale:=case when new_billing_unit in ('KG','L') then 1000 else 1 end;

      if old_billing_dimension=new_billing_dimension then
        factor:=(old_billing_scale/new_billing_scale)
          *(p_values->>'billing_to_inventory')::numeric/old_item.billing_to_inventory;
        conversion_basis:='compatible billing units';
      else
        -- For a deliberate cross-dimension edit, the Admin-entered old and new
        -- conversion values are the only available relationship.  Record that
        -- basis in the audit trail so a later physical count remains traceable.
        factor:=(p_values->>'billing_to_inventory')::numeric/old_item.billing_to_inventory;
        conversion_basis:='configured billing conversion';
      end if;
    end if;

    if factor is null or factor<=0 then
      raise exception 'Enter valid conversion quantities before changing the inventory unit';
    end if;
  end if;

  update public.inventory_items set
    name=p_values->>'name',category_id=(p_values->>'category_id')::uuid,
    request_unit=p_values->>'request_unit',supply_unit=new_billing_unit,billing_unit=new_billing_unit,
    base_unit=new_inventory_unit,inventory_unit=new_inventory_unit,display_unit=new_inventory_unit,
    request_to_inventory=(p_values->>'request_to_inventory')::numeric,
    billing_to_inventory=(p_values->>'billing_to_inventory')::numeric,
    default_supply_price=(p_values->>'default_supply_price')::numeric,
    low_stock_threshold=(p_values->>'low_stock_threshold')::numeric,
    target_stock_level=(p_values->>'target_stock_level')::numeric,
    active=coalesce((p_values->>'active')::boolean,true),updated_at=now()
  where id=p_item_id returning * into new_item;

  if old_item.inventory_unit<>new_item.inventory_unit then
    update public.menu_item_recipes set base_quantity=round(base_quantity*factor,3)
      where inventory_item_id=p_item_id;
    update public.inventory_packaging_rules
      set consumption_quantity=round(consumption_quantity*factor,3),updated_at=now()
      where item_id=p_item_id;

    for r in select * from public.outlet_inventory where item_id=p_item_id order by outlet_id for update loop
      v_new:=round(r.quantity_on_hand*factor,3);
      update public.outlet_inventory set quantity_on_hand=v_new,updated_at=now()
        where outlet_id=r.outlet_id and item_id=p_item_id;
      if v_new<>r.quantity_on_hand then
        insert into public.inventory_movements(
          outlet_id,item_id,movement_type,quantity_delta,balance_after,reference_type,notes,created_by,
          item_name_snapshot,inventory_unit_snapshot,rule_snapshot
        ) values(
          r.outlet_id,p_item_id,'ADJUSTMENT',v_new-r.quantity_on_hand,v_new,'MASTER_ITEM_EDIT',
          'Master Item inventory unit converted',p_user,old_item.name,old_item.inventory_unit,
          jsonb_build_object(
            'oldQuantity',r.quantity_on_hand,'oldUnit',old_item.inventory_unit,
            'newQuantity',v_new,'newUnit',new_item.inventory_unit,
            'factor',factor,'conversionBasis',conversion_basis,
            'oldBillingUnit',old_billing_unit,'newBillingUnit',new_billing_unit
          )
        );
      end if;
    end loop;
  end if;

  return new_item;
end;$$;

revoke all on function public.update_inventory_master_item(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.update_inventory_master_item(uuid,jsonb,uuid) to service_role;

commit;
