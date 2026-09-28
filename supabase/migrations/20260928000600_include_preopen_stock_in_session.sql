-- Stock received while an outlet is closed belongs to the next session. This
-- repairs open sessions created after that receipt and keeps the outlet's
-- session boundary aligned with the session ledger.
with corrected as (
  select
    session.id as session_id,
    session.outlet_id,
    min(bill.received_at) as opened_at
  from public.outlet_sales_sessions session
  join public.supply_bills bill
    on bill.outlet_id = session.outlet_id
   and bill.receipt_status = 'RECEIVED'
   and bill.received_at < session.opened_at
   and (bill.received_at at time zone 'Asia/Kolkata')::date = (session.opened_at at time zone 'Asia/Kolkata')::date
   and bill.received_at > coalesce((
     select max(previous.closed_at)
     from public.outlet_sales_sessions previous
     where previous.outlet_id = session.outlet_id
       and previous.closed_at is not null
       and previous.closed_at <= session.opened_at
   ), '-infinity'::timestamptz)
  where session.closed_at is null
  group by session.id, session.outlet_id
), updated_sessions as (
  update public.outlet_sales_sessions session
  set opened_at = corrected.opened_at
  from corrected
  where session.id = corrected.session_id
  returning session.outlet_id, session.opened_at
)
update public.outlets outlet
set current_session_started_at = updated.opened_at,
    updated_at = now()
from updated_sessions updated
where outlet.id = updated.outlet_id;

-- This requirement was intentionally completed with 20 supplied items; Tissue
-- was omitted from the final bill. Preserve the bill audit and close the queue.
update public.franchise_stock_requests
set status = 'FULFILLED', updated_at = now()
where id = '614d1bab-56d0-4278-b673-efc039f194f9'
  and bill_id = 'c2071cc9-c6cc-4bbb-8306-56368a7aa7d1'
  and status = 'PARTIAL';
