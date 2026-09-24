create table if not exists public.stock_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stock_categories enable row level security;
alter table public.expense_categories enable row level security;
revoke all on public.stock_categories,public.expense_categories from anon,authenticated;

insert into public.stock_categories(name,sort_order) values
  ('Chicken & Protein',10),
  ('Bread & Dough',20),
  ('Sauces & Cheese',30),
  ('Vegetables & Sides',40),
  ('Spices & Cooking',50),
  ('Packaging',60),
  ('Beverages',70),
  ('Other Items',80)
on conflict(name) do nothing;

insert into public.expense_categories(name,sort_order) values
  ('Local Stock Purchase',10),
  ('Transport',20),
  ('Electricity & Utilities',30),
  ('Salary & Labour',40),
  ('Maintenance',50),
  ('Cleaning',60),
  ('Other Expense',70)
on conflict(name) do nothing;

alter table public.inventory_items add column if not exists category_id uuid references public.stock_categories(id) on delete restrict;
alter table public.inventory_items add column if not exists request_unit text;

update public.inventory_items
set request_unit=case when display_unit='EACH' then 'PIECE' else 'KG' end
where request_unit is null;

update public.inventory_items set category_id=(select id from public.stock_categories where name='Chicken & Protein') where category_id is null and sku in ('CHICKEN','CHICKEN-PATTY');
update public.inventory_items set category_id=(select id from public.stock_categories where name='Bread & Dough') where category_id is null and sku in ('BURGER-BUN','PIZZA-DOUGH');
update public.inventory_items set category_id=(select id from public.stock_categories where name='Sauces & Cheese') where category_id is null and sku in ('SECRET-SAUCE','MAYONNAISE','CHEESE-SLICE');
update public.inventory_items set category_id=(select id from public.stock_categories where name='Vegetables & Sides') where category_id is null and sku in ('FRENCH-FRIES','LETTUCE','ONION','TOMATO');
update public.inventory_items set category_id=(select id from public.stock_categories where name='Spices & Cooking') where category_id is null and sku in ('CRISPY-MASALA','COOKING-OIL');
update public.inventory_items set category_id=(select id from public.stock_categories where name='Packaging') where category_id is null and sku in ('BURGER-WRAPPER','BURGER-BOX','PIZZA-BOX','CARRY-BAG');
update public.inventory_items set category_id=(select id from public.stock_categories where name='Beverages') where category_id is null and sku in ('COLD-DRINK-CAN','WATER-BOTTLE');
update public.inventory_items set category_id=(select id from public.stock_categories where name='Other Items') where category_id is null;

alter table public.inventory_items alter column category_id set not null;
alter table public.inventory_items alter column request_unit set not null;
alter table public.inventory_items drop constraint if exists inventory_items_request_unit_check;
alter table public.inventory_items add constraint inventory_items_request_unit_check check (request_unit in ('KG','PIECE'));

alter table public.daily_expenses add column if not exists category_id uuid references public.expense_categories(id) on delete restrict;

update public.daily_expenses set category_id=(select id from public.expense_categories where name='Local Stock Purchase') where category_id is null and category='LOCAL_STOCK';
update public.daily_expenses set category_id=(select id from public.expense_categories where name='Transport') where category_id is null and category='TRANSPORT';
update public.daily_expenses set category_id=(select id from public.expense_categories where name='Electricity & Utilities') where category_id is null and category='UTILITIES';
update public.daily_expenses set category_id=(select id from public.expense_categories where name='Salary & Labour') where category_id is null and category='SALARY';
update public.daily_expenses set category_id=(select id from public.expense_categories where name='Maintenance') where category_id is null and category='MAINTENANCE';
update public.daily_expenses set category_id=(select id from public.expense_categories where name='Other Expense') where category_id is null;
alter table public.daily_expenses alter column category_id set not null;

alter table public.franchise_stock_request_items drop constraint if exists franchise_stock_request_items_unit_check;
update public.franchise_stock_request_items set unit='PIECE' where unit='EACH';
alter table public.franchise_stock_request_items add constraint franchise_stock_request_items_unit_check check (unit in ('KG','PIECE'));

create or replace function public.submit_franchise_stock_request(
  p_outlet_id uuid,p_required_for date,p_items jsonb,p_notes text,p_user uuid
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_request_id uuid:=gen_random_uuid();r record;
begin
  if p_required_for<current_date or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Select a valid date and at least one item';end if;
  insert into public.franchise_stock_requests(id,outlet_id,required_for,notes,created_by)
  values(v_request_id,p_outlet_id,p_required_for,nullif(trim(p_notes),''),p_user);
  for r in select * from jsonb_to_recordset(p_items) x(item_id uuid,item_name text,unit text,quantity numeric,fixed_unit_price numeric) loop
    if r.quantity<=0 or r.unit not in ('KG','PIECE') then raise exception 'Invalid request item';end if;
    insert into public.franchise_stock_request_items(request_id,item_id,item_name,unit,quantity,fixed_unit_price)
    values(v_request_id,r.item_id,r.item_name,r.unit,r.quantity,r.fixed_unit_price);
  end loop;
  return v_request_id;
end; $$;

revoke all on function public.submit_franchise_stock_request(uuid,date,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.submit_franchise_stock_request(uuid,date,jsonb,text,uuid) to service_role;
