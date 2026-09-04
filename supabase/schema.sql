create extension if not exists "pgcrypto";

create type outlet_status as enum ('ACTIVE', 'INACTIVE');
create type order_type as enum ('DELIVERY', 'PICKUP');
create type order_status as enum ('NEW', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED');
create type payment_status as enum ('PENDING', 'PAID', 'FAILED', 'REFUNDED');
create type payment_method as enum ('COD', 'ONLINE');

create table outlets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  address text not null,
  phone text,
  opening_time time,
  closing_time time,
  maps_url text,
  zomato_url text,
  swiggy_url text,
  status outlet_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table menu_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text unique not null,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references menu_categories(id) on delete restrict,
  name text not null,
  slug text unique not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  image_url text,
  is_veg boolean not null default false,
  is_available boolean not null default true,
  is_favourite boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  outlet_id uuid not null references outlets(id) on delete restrict,
  customer_id uuid not null references customers(id) on delete restrict,
  order_type order_type not null,
  status order_status not null default 'NEW',
  payment_method payment_method not null default 'COD',
  payment_status payment_status not null default 'PENDING',
  subtotal numeric(10,2) not null check (subtotal >= 0),
  delivery_fee numeric(10,2) not null default 0 check (delivery_fee >= 0),
  discount numeric(10,2) not null default 0 check (discount >= 0),
  total numeric(10,2) not null check (total >= 0),
  delivery_address text,
  customer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id) on delete restrict,
  item_name text not null,
  unit_price numeric(10,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(10,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create table order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  status order_status not null,
  note text,
  created_at timestamptz not null default now()
);

create index idx_orders_outlet_status on orders(outlet_id, status);
create index idx_orders_created_at on orders(created_at desc);
create index idx_order_items_order_id on order_items(order_id);
create index idx_menu_items_category on menu_items(category_id);
create index idx_menu_items_available on menu_items(is_available);

insert into outlets (name, slug, address, phone, opening_time, closing_time)
values
  ('Shamli', 'shamli', 'OHHO BURGERS, Taimurshah Delhi Road, Shamli, Uttar Pradesh 247776', '9650443642', '17:00', '01:00'),
  ('Kairana', 'kairana', 'OHHO BURGERS, besides Nawab Market, Panipat Road, Kairana, Uttar Pradesh 247774', '9650443642', '17:00', '01:00')
on conflict (slug) do nothing;

insert into menu_categories (name, slug, display_order)
values
  ('BURGERS', 'burgers', 1),
  ('PIZZAS', 'pizzas', 2),
  ('SANDWICHES', 'sandwiches', 3),
  ('OHHO SPECIAL BUCKETS', 'ohho-special-buckets', 4),
  ('FRIES', 'fries', 5),
  ('SIPS & ADDONS', 'sips-addons', 6)
on conflict (slug) do nothing;
