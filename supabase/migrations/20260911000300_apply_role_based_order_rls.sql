DROP POLICY IF EXISTS orders_admin_select ON public.orders;
DROP POLICY IF EXISTS orders_admin_update ON public.orders;

CREATE POLICY orders_outlet_select
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (public.is_ohho_outlet_user(outlet_id));

CREATE POLICY orders_outlet_update
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (public.is_ohho_outlet_user(outlet_id))
  WITH CHECK (public.is_ohho_outlet_user(outlet_id));

DROP POLICY IF EXISTS order_items_admin_select ON public.order_items;

CREATE POLICY order_items_outlet_select
  ON public.order_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_items.order_id
        AND public.is_ohho_outlet_user(o.outlet_id)
    )
  );
