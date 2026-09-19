alter table public.outlets
  add column if not exists website_enabled boolean not null default true;

comment on column public.outlets.status is
  'Controls the POS sales session only. ACTIVE means the POS session is open.';

comment on column public.outlets.website_enabled is
  'Controls whether the outlet is visible and orderable on the customer website.';

drop policy if exists outlets_public_select on public.outlets;
create policy outlets_public_select
  on public.outlets
  for select
  to anon, authenticated
  using (website_enabled = true);
