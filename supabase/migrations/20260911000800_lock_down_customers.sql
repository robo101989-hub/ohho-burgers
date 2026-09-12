ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.customers FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.customers TO service_role;
