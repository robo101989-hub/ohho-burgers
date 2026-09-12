ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.order_status_history FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.order_status_history TO service_role;
