-- Physical-cart Spin & Win: outlet-level prize settings and one-time rewards.
create table if not exists public.outlet_spin_settings (
  outlet_id uuid primary key references public.outlets(id) on delete cascade,
  enabled boolean not null default true,
  prizes jsonb not null default '[
    {"label":"5% OFF","type":"PERCENT","value":5},
    {"label":"10% OFF","type":"PERCENT","value":10},
    {"label":"₹20 OFF","type":"FLAT","value":20}
  ]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.outlet_spin_settings (outlet_id)
select id from public.outlets
on conflict (outlet_id) do nothing;

create table if not exists public.spin_rewards (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  code text not null unique,
  device_key text not null,
  label text not null,
  reward_type text not null check (reward_type in ('PERCENT','FLAT','FREE_ITEM')),
  reward_value numeric(10,2) not null default 0,
  status text not null default 'ISSUED' check (status in ('ISSUED','REDEEMED','EXPIRED')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_order_id uuid references public.orders(id) on delete set null
);

create index if not exists spin_rewards_outlet_status_idx on public.spin_rewards(outlet_id, status, expires_at desc);
create index if not exists spin_rewards_device_day_idx on public.spin_rewards(outlet_id, device_key, issued_at desc);

alter table public.outlet_spin_settings enable row level security;
alter table public.spin_rewards enable row level security;
revoke all on public.outlet_spin_settings from anon, authenticated;
revoke all on public.spin_rewards from anon, authenticated;
