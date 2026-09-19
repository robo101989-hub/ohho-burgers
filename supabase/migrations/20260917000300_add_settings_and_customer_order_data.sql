-- Business-wide POS settings and basic customer details for POS orders.
CREATE TABLE IF NOT EXISTS public.business_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  business_name text NOT NULL DEFAULT 'OHHO BURGERS',
  phone text,
  address text,
  gst_number text,
  receipt_footer text NOT NULL DEFAULT 'Thank you! Happiness in Every Bite.',
  default_order_type text NOT NULL DEFAULT 'TAKEAWAY'
    CHECK (default_order_type IN ('TAKEAWAY', 'DINE_IN')),
  allow_cash boolean NOT NULL DEFAULT true,
  allow_upi boolean NOT NULL DEFAULT true,
  allow_card boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.business_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY business_settings_authenticated_select
  ON public.business_settings
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY business_settings_admin_update
  ON public.business_settings
  FOR UPDATE TO authenticated
  USING (public.is_ohho_admin())
  WITH CHECK (public.is_ohho_admin());

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_phone text;
