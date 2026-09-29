-- Snapshot the exact free item when a reward is issued. Later campaign edits
-- must not change what an existing customer's code redeems.
alter table public.spin_rewards
  add column if not exists reward_details jsonb not null default '{}'::jsonb;
