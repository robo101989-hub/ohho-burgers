-- OHHO BURGERS
-- Managers may update outlet menu availability only.
-- ADMIN and OWNER permissions remain controlled by RLS policies.

REVOKE INSERT, DELETE ON TABLE public.outlet_menu_items FROM authenticated;
