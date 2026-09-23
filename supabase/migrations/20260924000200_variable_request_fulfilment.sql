alter table public.franchise_stock_requests
  drop constraint if exists franchise_stock_requests_status_check;

alter table public.franchise_stock_requests
  add constraint franchise_stock_requests_status_check
  check (status in ('SUBMITTED','PARTIAL','FULFILLED','CANCELLED'));
