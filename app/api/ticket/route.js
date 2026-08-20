export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { sql } from '../../../lib/db';

export async function POST(req) {
  const { orderId, staffPin } = await req.json().catch(() => ({}));
  if (staffPin !== process.env.STAFF_PIN) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!orderId) return Response.json({ error: 'missing' }, { status: 400 });

  const info = (await sql`select o.id, o.buyer_name, o.code,
      count(t.id)::int ticket_count,
      coalesce(sum(case when t.status='checked_in' then 1 else 0 end),0)::int checked_count,
      string_agg(tt.name || (case when t.qty>1 then ' ×'||t.qty else '' end), ', ' order by tt.sort) as items
    from orders o join tickets t on t.order_id=o.id join ticket_types tt on tt.id=t.ticket_type_id
    where o.id=${orderId} group by o.id, o.buyer_name, o.code`)[0];
  if (!info) return Response.json({ order: null });

  const coupons = await sql`select c.id, ct.name, ct.value_cents, c.redeemed
    from coupons c join tickets t on t.id=c.ticket_id join coupon_types ct on ct.id=c.coupon_type_id
    where t.order_id=${orderId} order by ct.sort`;
  const checked_in = Number(info.ticket_count) > 0 && Number(info.checked_count) >= Number(info.ticket_count);
  return Response.json({ order: { ...info, checked_in }, coupons });
}
