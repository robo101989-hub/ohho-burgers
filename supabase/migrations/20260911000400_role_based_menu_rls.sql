DROP POLICY IF EXISTS menu_categories_admin_all ON public.menu_categories;

CREATE POLICY menu_categories_admin_owner
  ON public.menu_categories
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND p.role IN ('ADMIN'::public.user_role, 'OWNER'::public.user_role)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND p.role IN ('ADMIN'::public.user_role, 'OWNER'::public.user_role)
    )
  );

DROP POLICY IF EXISTS menu_items_admin_all ON public.menu_items;

CREATE POLICY menu_items_admin_owner
  ON public.menu_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND p.role IN ('ADMIN'::public.user_role, 'OWNER'::public.user_role)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND p.role IN ('ADMIN'::public.user_role, 'OWNER'::public.user_role)
    )
  );

DROP POLICY IF EXISTS outlet_menu_items_admin_all ON public.outlet_menu_items;
DROP POLICY IF EXISTS outlet_menu_items_update_assigned ON public.outlet_menu_items;

CREATE POLICY outlet_menu_items_admin_owner_all
  ON public.outlet_menu_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND p.role IN ('ADMIN'::public.user_role, 'OWNER'::public.user_role)
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND p.role = 'MANAGER'::public.user_role
        AND EXISTS (
          SELECT 1
          FROM public.outlet_users ou
          WHERE ou.user_id = auth.uid()
            AND ou.outlet_id = outlet_menu_items.outlet_id
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND p.role IN ('ADMIN'::public.user_role, 'OWNER'::public.user_role)
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND p.role = 'MANAGER'::public.user_role
        AND EXISTS (
          SELECT 1
          FROM public.outlet_users ou
          WHERE ou.user_id = auth.uid()
            AND ou.outlet_id = outlet_menu_items.outlet_id
        )
    )
  );
