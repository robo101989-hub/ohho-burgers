CREATE OR REPLACE FUNCTION public.is_ohho_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND is_active = true
      AND role = 'ADMIN'::public.user_role
  );
$$;
