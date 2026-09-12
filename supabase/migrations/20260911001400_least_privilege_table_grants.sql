-- OHHO BURGERS
-- Remove excessive anon/authenticated table privileges.
-- RLS remains the row-level authorization boundary.

REVOKE ALL ON TABLE public.profiles,
  public.outlet_users,
  public.outlets,
  public.menu_categories,
  public.menu_items,
  public.outlet_menu_items,
  public.orders,
  public.order_items,
  public.customers,
  public.order_status_history
FROM anon, authenticated;

-- Public website: only read active outlets.
GRANT SELECT ON TABLE public.outlets TO anon;

-- Authenticated dashboard access.
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT SELECT ON TABLE public.outlet_users TO authenticated;
GRANT SELECT ON TABLE public.outlets TO authenticated;

GRANT SELECT ON TABLE public.menu_categories TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.menu_items TO authenticated;

GRANT SELECT, INSERT, UPDATE
  ON TABLE public.outlet_menu_items TO authenticated;

GRANT SELECT, UPDATE ON TABLE public.orders TO authenticated;
GRANT SELECT ON TABLE public.order_items TO authenticated;

-- Sensitive customer/order-history tables remain service-role only.
REVOKE ALL ON TABLE public.customers,
  public.order_status_history
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON TABLE public.customers, public.order_status_history
  TO service_role;
