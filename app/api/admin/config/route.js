export const dynamic = 'force-dynamic';

import { sql } from '../../../../lib/db';

// Admin: full current setup for the console (event + coupon types + ticket types
// with their coupon allotments).
export async function GET(req) {
  const pin = new URL(req.url).searchParams.get('pin');
  if (pin !== process.env.ADMIN_PIN) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const event = (await sql`select id, name, event_date, venue, tagline
                           from events order by created_at desc limit 1`)[0] || null;
  if (!event) return Response.json({ event: null, couponTypes: [], ticketTypes: [] });

  const couponTypes = await sql`select id, name from coupon_types
                                where event_id=${event.id} order by sort, name`;

  const ticketTypes = await sql`
    select tt.id, tt.name, tt.description, tt.price_cents, tt.admits, tt.max_qty,
           tt.is_comp, tt.active, tt.sort,
           coalesce(json_object_agg(a.coupon_type_id::text, a.qty_per_guest)
                    filter (where a.coupon_type_id is not null), '{}'::json) as allot,
           coalesce((select sum(qty) from tickets t
                     where t.ticket_type_id=tt.id and t.status <> 'void'),0)::int as sold
    from ticket_types tt
    left join ticket_coupon_allotments a on a.ticket_type_id=tt.id
    where tt.event_id=${event.id}
    group by tt.id order by tt.sort, tt.name`;

  return Response.json({ event, couponTypes, ticketTypes }, { headers: { 'Cache-Control': 'no-store' } });
}
