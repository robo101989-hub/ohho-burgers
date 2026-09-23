create table if not exists public.inventory_notifications (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  bill_id uuid not null references public.supply_bills(id) on delete cascade,
  title text not null,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (bill_id)
);

create index if not exists inventory_notifications_outlet_date_idx
  on public.inventory_notifications(outlet_id,created_at desc);

alter table public.inventory_notifications enable row level security;
revoke all on public.inventory_notifications from anon,authenticated;
grant select on public.inventory_notifications to authenticated;

drop policy if exists inventory_notifications_read on public.inventory_notifications;
create policy inventory_notifications_read on public.inventory_notifications for select to authenticated
  using (public.inventory_scope_allowed(outlet_id));
create or replace function public.notify_supply_bill()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.inventory_notifications(outlet_id,bill_id,title,message)
  values(new.outlet_id,new.id,'New stock received',new.bill_number || ' · Supply bill ₹' || to_char(new.total_amount,'FM999999990.00'))
  on conflict(bill_id) do nothing;
  return new;
end; $$;

drop trigger if exists supply_bill_notification_trigger on public.supply_bills;
create trigger supply_bill_notification_trigger after insert on public.supply_bills
for each row execute function public.notify_supply_bill();

revoke all on function public.notify_supply_bill() from public,anon,authenticated;

insert into public.inventory_items(sku,name,base_unit,display_unit,low_stock_threshold,default_supply_price)
values
  ('CHICKEN','Chicken','G','KG',5,0),
  ('CHICKEN-PATTY','Chicken Patty','EACH','EACH',50,0),
  ('BURGER-BUN','Burger Bun','EACH','EACH',50,0),
  ('PIZZA-DOUGH','Pizza Dough','G','KG',5,0),
  ('SECRET-SAUCE','Secret Sauce','G','KG',3,0),
  ('CRISPY-MASALA','Crispy Masala','G','KG',2,0),
  ('CHEESE-SLICE','Cheese Slice','EACH','EACH',50,0),
  ('FRENCH-FRIES','French Fries','G','KG',5,0),
  ('COOKING-OIL','Cooking Oil','ML','L',5,0),
  ('MAYONNAISE','Mayonnaise','G','KG',3,0),
  ('LETTUCE','Lettuce','G','KG',2,0),
  ('ONION','Onion','G','KG',3,0),
  ('TOMATO','Tomato','G','KG',3,0),
  ('BURGER-WRAPPER','Burger Wrapper','EACH','EACH',100,0),
  ('BURGER-BOX','Burger Box','EACH','EACH',100,0),
  ('PIZZA-BOX','Pizza Box','EACH','EACH',50,0),
  ('CARRY-BAG','Carry Bag','EACH','EACH',100,0),
  ('COLD-DRINK-CAN','Cold Drink Can','EACH','EACH',24,0),
  ('WATER-BOTTLE','Water Bottle','EACH','EACH',24,0)
on conflict(sku) do nothing;
