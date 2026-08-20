export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { sql } from '../../../../lib/db';

export async function GET(req) {
  const pin = new URL(req.url).searchParams.get('pin');
  if (pin !== process.env.ADMIN_PIN) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const ev = (await sql`select id, name from events order by created_at desc limit 1`)[0];
  if (!ev) return Response.json({ error: 'no_event' }, { status: 404 });

  const g = (await sql`select
      (select count(*) from orders where event_id=${ev.id})::int registrations,
      coalesce(sum(t.qty*tt.admits),0)::int guests,
      coalesce(sum(case when t.status='checked_in' then t.qty*tt.admits else 0 end),0)::int checked_in_guests
    from tickets t join ticket_types tt on tt.id=t.ticket_type_id where t.event_id=${ev.id}`)[0];

  const rev = (await sql`select coalesce(sum(amount_cents),0)::int cents from orders where event_id=${ev.id} and status='paid'`)[0];

  const cp = (await sql`select
      count(*)::int issued,
      count(*) filter (where c.redeemed)::int redeemed,
      coalesce(sum(ct.value_cents),0)::int value_issued,
      coalesce(sum(case when c.redeemed then ct.value_cents else 0 end),0)::int value_redeemed
    from coupons c join coupon_types ct on ct.id=c.coupon_type_id join tickets t on t.id=c.ticket_id
    where t.event_id=${ev.id}`)[0];

  const tiers = await sql`select tt.name, tt.category,
      coalesce(sum(t.qty) filter (where t.status<>'void'),0)::int sold,
      coalesce(sum(t.qty*tt.price_cents) filter (where t.status<>'void'),0)::int revenue
    from ticket_types tt left join tickets t on t.ticket_type_id=tt.id
    where tt.event_id=${ev.id} group by tt.id, tt.name, tt.sort order by tt.sort, tt.name`;

  const recent = await sql`select o.buyer_name,
      string_agg(tt.name || (case when t.qty>1 then ' ×'||t.qty else '' end), ', ' order by tt.sort) as type,
      max(t.checked_in_at) as checked_in_at
    from tickets t join ticket_types tt on tt.id=t.ticket_type_id join orders o on o.id=t.order_id
    where t.event_id=${ev.id} and t.status='checked_in'
    group by o.id, o.buyer_name order by max(t.checked_in_at) desc limit 10`;

  return Response.json({ event: ev, ...g, revenue_cents: rev.cents, coupons: cp, tiers, recent }, { headers: { 'Cache-Control': 'no-store' } });
}
