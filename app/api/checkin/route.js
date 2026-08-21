export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { sql, ensureSchema } from '../../../lib/db';
import { verifyTicket } from '../../../lib/token';

export async function POST(req) {
  await ensureSchema();
  const { token, orderId, staffPin, staff = 'gate' } = await req.json().catch(() => ({}));
  if (staffPin !== process.env.STAFF_PIN) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const id = orderId || verifyTicket(token);
  if (!id) return Response.json({ error: 'invalid_ticket' }, { status: 400 });

  // Atomically check in all still-valid tickets in the order and issue their coupons.
  const res = await sql`
    with upd as (
      update tickets set status='checked_in', checked_in_at=now(), checked_in_by=${staff}
      where order_id=${id} and status='valid'
      returning id, ticket_type_id, qty
    ),
    ins as (
      insert into coupons (ticket_id, coupon_type_id)
      select upd.id, a.coupon_type_id from upd
      join ticket_coupon_allotments a on a.ticket_type_id = upd.ticket_type_id
      cross join generate_series(1, a.qty_per_guest * upd.qty)
      returning 1
    )
    select (select count(*) from upd)::int did, (select count(*) from ins)::int coupons`;
  const { did } = res[0];

  const info = (await sql`select o.buyer_name, o.code,
      coalesce(sum(t.qty*tt.admits),0)::int guests,
      string_agg(tt.name || (case when t.qty>1 then ' ×'||t.qty else '' end), ', ' order by tt.sort) as items,
      min(t.checked_in_at) as checked_in_at
    from orders o join tickets t on t.order_id=o.id join ticket_types tt on tt.id=t.ticket_type_id
    where o.id=${id} group by o.id, o.buyer_name, o.code`)[0];

  const coupons = await sql`select c.id, ct.name, ct.value_cents, c.redeemed
    from coupons c join tickets t on t.id=c.ticket_id join coupon_types ct on ct.id=c.coupon_type_id
    where t.order_id=${id} order by ct.sort`;

  if (did === 0) return Response.json({ ok: false, reason: 'already_checked_in', order: info, coupons });
  return Response.json({ ok: true, order: info, coupons });
}
