REVOKE EXECUTE ON FUNCTION public.is_ohho_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_ohho_outlet_manager(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_ohho_outlet_user(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_ohho_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_ohho_outlet_manager(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_ohho_outlet_user(uuid) TO authenticated, service_role;
