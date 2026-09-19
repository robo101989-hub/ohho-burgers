-- Track complimentary Family & Friends orders separately from paid POS sales.
ALTER TYPE public.pos_order_source
  ADD VALUE IF NOT EXISTS 'FAMILY_FRIENDS';

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_method_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('CASH', 'UPI', 'CARD', 'ONLINE', 'COD', 'COMPLIMENTARY'));
