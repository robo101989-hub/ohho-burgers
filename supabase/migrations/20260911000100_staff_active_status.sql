-- OHHO BURGERS
-- Staff active/inactive access status

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS profiles_role_active_idx
  ON public.profiles(role, is_active);
