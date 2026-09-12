DROP POLICY IF EXISTS outlet_menu_items_admin_owner_all ON public.outlet_menu_items;

CREATE POLICY outlet_menu_items_admin_all
  ON public.outlet_menu_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND p.role = 'ADMIN'::public.user_role
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND p.role = 'ADMIN'::public.user_role
    )
  );

CREATE POLICY outlet_menu_items_owner_all
  ON public.outlet_menu_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND p.role = 'OWNER'::public.user_role
    )
    AND EXISTS (
      SELECT 1
      FROM public.outlet_users ou
      WHERE ou.user_id = auth.uid()
        AND ou.outlet_id = outlet_menu_items.outlet_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND p.role = 'OWNER'::public.user_role
    )
    AND EXISTS (
      SELECT 1
      FROM public.outlet_users ou
      WHERE ou.user_id = auth.uid()
        AND ou.outlet_id = outlet_menu_items.outlet_id
    )
  );
