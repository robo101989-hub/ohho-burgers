-- OHHO BURGERS
-- Restore INSERT for authenticated users because ADMIN/OWNER menu creation
-- creates outlet_menu_items mappings. RLS restricts INSERT to ADMIN/OWNER.

GRANT INSERT ON TABLE public.outlet_menu_items TO authenticated;
