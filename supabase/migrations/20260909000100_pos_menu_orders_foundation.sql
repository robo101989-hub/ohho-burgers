-- OHHO BURGERS
-- POS + Menu Management + Orders foundation
-- Captures the live database changes made before migration tracking was established.

-- ============================================================
-- 1. POS enums
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'user_role'
    AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.user_role AS ENUM ('ADMIN', 'OWNER', 'MANAGER', 'STAFF');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'pos_order_source'
    AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.pos_order_source AS ENUM ('POS', 'ONLINE');
  END IF;
END
$$;

-- ============================================================
-- 2. Staff profiles
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  role public.user_role NOT NULL DEFAULT 'STAFF',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. Outlet assignments
-- ============================================================

CREATE TABLE IF NOT EXISTS public.outlet_users (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, outlet_id)
);

-- ============================================================
-- 4. Outlet-specific menu availability
-- ============================================================

CREATE TABLE IF NOT EXISTS public.outlet_menu_items (
  outlet_id uuid NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (outlet_id, menu_item_id)
);

-- ============================================================
-- 5. Menu archive support
-- ============================================================

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

-- ============================================================
-- 6. POS fields on orders
-- ============================================================

ALTER TABLE public.orders
  ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE public.orders
  ALTER COLUMN order_type TYPE text USING order_type::text;

ALTER TABLE public.orders
  ALTER COLUMN payment_method TYPE text USING payment_method::text;

ALTER TABLE public.orders
  ALTER COLUMN order_type SET DEFAULT 'TAKEAWAY';

ALTER TABLE public.orders
  ALTER COLUMN payment_method SET DEFAULT 'CASH';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_source public.pos_order_source
    NOT NULL DEFAULT 'ONLINE';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS table_number integer;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS token_number integer;

-- ============================================================
-- 7. POS validation
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_order_type_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_order_type_check
      CHECK (order_type IN ('DINE_IN', 'TAKEAWAY', 'DELIVERY', 'PICKUP'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_payment_method_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_method_check
      CHECK (payment_method IN ('CASH', 'UPI', 'CARD', 'ONLINE', 'COD'));
  END IF;
END
$$;

-- ============================================================
-- 8. Helpful indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_outlet_users_user
  ON public.outlet_users(user_id);

CREATE INDEX IF NOT EXISTS idx_outlet_users_outlet
  ON public.outlet_users(outlet_id);

CREATE INDEX IF NOT EXISTS idx_outlet_menu_items_outlet
  ON public.outlet_menu_items(outlet_id);

CREATE INDEX IF NOT EXISTS idx_outlet_menu_items_menu_item
  ON public.outlet_menu_items(menu_item_id);

CREATE INDEX IF NOT EXISTS idx_orders_order_source
  ON public.orders(order_source);

CREATE INDEX IF NOT EXISTS idx_orders_table_number
  ON public.orders(outlet_id, table_number);

-- ============================================================
-- 9. Admin helper
-- ============================================================

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
      AND role = 'ADMIN'::public.user_role
  );
$$;

-- ============================================================
-- 10. RLS
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlet_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlet_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Profiles
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;
CREATE POLICY profiles_admin_all
  ON public.profiles
  FOR ALL
  TO authenticated
  USING (public.is_ohho_admin())
  WITH CHECK (public.is_ohho_admin());

-- Outlet users
DROP POLICY IF EXISTS outlet_users_select_own ON public.outlet_users;
CREATE POLICY outlet_users_select_own
  ON public.outlet_users
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS outlet_users_admin_all ON public.outlet_users;
CREATE POLICY outlet_users_admin_all
  ON public.outlet_users
  FOR ALL
  TO authenticated
  USING (public.is_ohho_admin())
  WITH CHECK (public.is_ohho_admin());

-- Outlet menu availability
DROP POLICY IF EXISTS outlet_menu_items_select_assigned ON public.outlet_menu_items;
CREATE POLICY outlet_menu_items_select_assigned
  ON public.outlet_menu_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.outlet_users ou
      WHERE ou.user_id = auth.uid()
        AND ou.outlet_id = outlet_menu_items.outlet_id
    )
  );

DROP POLICY IF EXISTS outlet_menu_items_admin_all ON public.outlet_menu_items;
CREATE POLICY outlet_menu_items_admin_all
  ON public.outlet_menu_items
  FOR ALL
  TO authenticated
  USING (public.is_ohho_admin())
  WITH CHECK (public.is_ohho_admin());

DROP POLICY IF EXISTS outlet_menu_items_update_assigned ON public.outlet_menu_items;
CREATE POLICY outlet_menu_items_update_assigned
  ON public.outlet_menu_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.outlet_users ou
      WHERE ou.user_id = auth.uid()
        AND ou.outlet_id = outlet_menu_items.outlet_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.outlet_users ou
      WHERE ou.user_id = auth.uid()
        AND ou.outlet_id = outlet_menu_items.outlet_id
    )
  );

-- Public outlet visibility
DROP POLICY IF EXISTS outlets_public_select ON public.outlets;
CREATE POLICY outlets_public_select
  ON public.outlets
  FOR SELECT
  TO anon, authenticated
  USING (status = 'ACTIVE'::public.outlet_status);

DROP POLICY IF EXISTS outlets_admin_all ON public.outlets;
CREATE POLICY outlets_admin_all
  ON public.outlets
  FOR ALL
  TO authenticated
  USING (public.is_ohho_admin())
  WITH CHECK (public.is_ohho_admin());

-- Menu categories
DROP POLICY IF EXISTS menu_categories_authenticated_select ON public.menu_categories;
CREATE POLICY menu_categories_authenticated_select
  ON public.menu_categories
  FOR SELECT
  TO authenticated
  USING (active = true);

DROP POLICY IF EXISTS menu_categories_admin_all ON public.menu_categories;
CREATE POLICY menu_categories_admin_all
  ON public.menu_categories
  FOR ALL
  TO authenticated
  USING (public.is_ohho_admin())
  WITH CHECK (public.is_ohho_admin());

-- Menu items
DROP POLICY IF EXISTS menu_items_authenticated_select ON public.menu_items;
CREATE POLICY menu_items_authenticated_select
  ON public.menu_items
  FOR SELECT
  TO authenticated
  USING (is_available = true);

DROP POLICY IF EXISTS menu_items_admin_all ON public.menu_items;
CREATE POLICY menu_items_admin_all
  ON public.menu_items
  FOR ALL
  TO authenticated
  USING (public.is_ohho_admin())
  WITH CHECK (public.is_ohho_admin());

-- Orders
DROP POLICY IF EXISTS orders_admin_select ON public.orders;
CREATE POLICY orders_admin_select
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (public.is_ohho_admin());

DROP POLICY IF EXISTS orders_admin_update ON public.orders;
CREATE POLICY orders_admin_update
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (public.is_ohho_admin())
  WITH CHECK (public.is_ohho_admin());

-- Order items
DROP POLICY IF EXISTS order_items_admin_select ON public.order_items;
CREATE POLICY order_items_admin_select
  ON public.order_items
  FOR SELECT
  TO authenticated
  USING (public.is_ohho_admin());

-- ============================================================
-- 11. Seed outlet/menu availability for existing outlets/items
-- ============================================================

INSERT INTO public.outlet_menu_items (outlet_id, menu_item_id, is_available)
SELECT o.id, m.id, m.is_available
FROM public.outlets o
CROSS JOIN public.menu_items m
ON CONFLICT (outlet_id, menu_item_id) DO NOTHING;
