CREATE OR REPLACE FUNCTION public.is_ohho_outlet_user(target_outlet_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND (
        p.role = 'ADMIN'::public.user_role
        OR EXISTS (
          SELECT 1
          FROM public.outlet_users ou
          WHERE ou.user_id = auth.uid()
            AND ou.outlet_id = target_outlet_id
        )
      )
  );
$$;
