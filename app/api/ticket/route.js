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

  // What coupons WOULD be issued for this order (from allotments) — grouped by denomination.
  const couponPreview = await sql`
    select ct.name, ct.value_cents, coalesce(sum(a.qty_per_guest * t.qty),0)::int qty
    from tickets t
    join ticket_coupon_allotments a on a.ticket_type_id = t.ticket_type_id
    join coupon_types ct on ct.id = a.coupon_type_id
    where t.order_id=${orderId}
    group by ct.id, ct.name, ct.value_cents order by ct.sort`;

  // Ticket breakdown (type × qty) for a table anywhere it's shown.
  const ticketRows = await sql`
    select tt.name, tt.category, coalesce(sum(t.qty),0)::int qty
    from tickets t join ticket_types tt on tt.id=t.ticket_type_id
    where t.order_id=${orderId} group by tt.id, tt.name, tt.category, tt.sort order by tt.sort`;

  const checked_in = Number(info.ticket_count) > 0 && Number(info.checked_count) >= Number(info.ticket_count);
  return Response.json({ order: { ...info, checked_in }, coupons, couponPreview, ticketRows });
}
