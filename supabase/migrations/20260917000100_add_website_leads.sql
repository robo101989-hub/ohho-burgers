create type website_lead_type as enum ('CONTACT', 'FRANCHISE');
create type website_lead_status as enum ('NEW', 'CONTACTED', 'CLOSED');

create table website_leads (
  id uuid primary key default gen_random_uuid(),
  lead_type website_lead_type not null,
  name text not null check (char_length(name) <= 100),
  email text not null check (char_length(email) <= 254),
  phone text check (char_length(phone) <= 30),
  city text check (char_length(city) <= 100),
  state text check (char_length(state) <= 100),
  investment_range text check (char_length(investment_range) <= 100),
  outlet_format text check (char_length(outlet_format) <= 100),
  business_experience text check (char_length(business_experience) <= 500),
  message text check (char_length(message) <= 2000),
  status website_lead_status not null default 'NEW',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (lead_type = 'CONTACT' and message is not null and char_length(message) > 0)
    or (lead_type = 'FRANCHISE' and phone is not null and char_length(phone) > 0)
  )
);

create index idx_website_leads_status_created_at on website_leads(status, created_at desc);

alter table website_leads enable row level security;

-- Website visitors never access this table directly. The server endpoint uses the
-- Supabase service key, while dashboard access can be explicitly added later.
revoke all on table website_leads from anon, authenticated;
