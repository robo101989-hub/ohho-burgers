insert into public.outlet_sales_sessions(outlet_id,opened_at)
select outlet.id,coalesce(outlet.current_session_started_at,outlet.updated_at,now())
from public.outlets outlet
where outlet.status='ACTIVE'
  and not exists(
    select 1 from public.outlet_sales_sessions session
    where session.outlet_id=outlet.id and session.closed_at is null
  )
on conflict do nothing;
