export const dynamic = 'force-dynamic';

import { sql } from '../../../lib/db';

// Staff: full detail for one ticket incl. its coupons (used by the stall screen
// and the "already checked in" view).
export async function POST(req) {
  const { ticketId, staffPin } = await req.json().catch(() => ({}));
  if (staffPin !== process.env.STAFF_PIN) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!ticketId) return Response.json({ error: 'missing' }, { status: 400 });

  const rows = await sql`
    select t.id, t.code, t.qty, t.status, t.checked_in_at,
           tt.name as type_name, o.buyer_name,
           coalesce(json_agg(json_build_object('id', c.id, 'name', ct.name, 'redeemed', c.redeemed))
                    filter (where c.id is not null), '[]') as coupons
    from tickets t
    join ticket_types tt on tt.id=t.ticket_type_id
    join orders o on o.id=t.order_id
    left join coupons c on c.ticket_id=t.id
    left join coupon_types ct on ct.id=c.coupon_type_id
    where t.id=${ticketId}
    group by t.id, tt.name, o.buyer_name`;
  return Response.json({ ticket: rows[0] || null });
}
