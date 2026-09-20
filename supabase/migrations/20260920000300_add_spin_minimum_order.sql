alter table public.outlet_spin_settings
  add column if not exists minimum_order numeric(10,2) not null default 0;
