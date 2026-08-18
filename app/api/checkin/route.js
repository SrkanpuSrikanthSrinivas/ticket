export const dynamic = 'force-dynamic';

import { sql } from '../../../lib/db';
import { verifyTicket } from '../../../lib/token';

// Atomic check-in. A single CTE flips the ticket to checked_in ONLY if it is
// currently 'valid', and in the same statement issues the coupons. Two gate
// stations scanning the same ticket at once => exactly one wins, no double coupons.
export async function POST(req) {
  const { token, ticketId, staffPin, staff = 'gate' } = await req.json().catch(() => ({}));
  if (staffPin !== process.env.STAFF_PIN) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const id = ticketId || verifyTicket(token);
  if (!id) return Response.json({ error: 'invalid_ticket' }, { status: 400 });

  const rows = await sql`
    with upd as (
      update tickets set status='checked_in', checked_in_at=now(), checked_in_by=${staff}
      where id=${id} and status='valid'
      returning id, ticket_type_id, qty
    ),
    ins as (
      insert into coupons (ticket_id, coupon_type_id)
      select upd.id, a.coupon_type_id
      from upd
      join ticket_coupon_allotments a on a.ticket_type_id = upd.ticket_type_id
      cross join generate_series(1, a.qty_per_guest * upd.qty)
      returning 1
    )
    select (select count(*) from upd)::int as did, (select count(*) from ins)::int as coupons`;

  const { did, coupons } = rows[0];

  if (did === 0) {
    // Already checked in (or void). Return current state so staff can see it.
    const cur = await sql`
      select t.status, t.checked_in_at, tt.name as type_name, o.buyer_name,
             (select count(*) from coupons c where c.ticket_id=t.id) as total,
             (select count(*) from coupons c where c.ticket_id=t.id and c.redeemed) as used
      from tickets t join ticket_types tt on tt.id=t.ticket_type_id
      join orders o on o.id=t.order_id where t.id=${id}`;
    return Response.json({ ok: false, reason: 'already_checked_in', ticket: cur[0] || null });
  }

  const info = await sql`
    select t.checked_in_at, tt.name as type_name, o.buyer_name, t.qty,
      json_agg(json_build_object('id', c.id, 'name', ct.name, 'redeemed', c.redeemed)) as coupons
    from tickets t join ticket_types tt on tt.id=t.ticket_type_id
    join orders o on o.id=t.order_id
    left join coupons c on c.ticket_id=t.id
    left join coupon_types ct on ct.id=c.coupon_type_id
    where t.id=${id}
    group by t.checked_in_at, tt.name, o.buyer_name, t.qty`;

  return Response.json({ ok: true, issued: coupons, ticket: info[0] });
}
