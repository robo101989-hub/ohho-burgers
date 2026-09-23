create table if not exists public.customer_reviews (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (char_length(trim(customer_name)) between 2 and 80),
  location text,
  review_text text not null check (char_length(trim(review_text)) between 10 and 600),
  rating smallint not null default 5 check (rating between 1 and 5),
  is_visible boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists customer_reviews_visible_created_idx
  on public.customer_reviews (is_visible, created_at desc);

alter table public.customer_reviews enable row level security;
revoke all on public.customer_reviews from anon, authenticated;
