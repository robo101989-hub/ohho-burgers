CREATE OR REPLACE FUNCTION public.validate_ohho_order_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'NEW' AND NEW.status IN ('ACCEPTED', 'CANCELLED') THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'ACCEPTED' AND NEW.status IN ('PREPARING', 'CANCELLED') THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'PREPARING' AND NEW.status IN ('READY', 'CANCELLED') THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'READY' AND NEW.status IN ('OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED') THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'OUT_FOR_DELIVERY' AND NEW.status IN ('COMPLETED', 'CANCELLED') THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('COMPLETED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Order status cannot be changed after %', OLD.status;
  END IF;

  RAISE EXCEPTION 'Invalid order status transition: % -> %', OLD.status, NEW.status;
END;
$$;

DROP TRIGGER IF EXISTS validate_ohho_order_status_transition ON public.orders;

CREATE TRIGGER validate_ohho_order_status_transition
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_ohho_order_status_transition();

REVOKE EXECUTE ON FUNCTION public.validate_ohho_order_status_transition() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_ohho_order_status_transition() FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_ohho_order_status_transition() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_ohho_order_status_transition() TO service_role;
