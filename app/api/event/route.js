export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { sql } from '../../../lib/db';

// Public: the current event + its active ticket tiers with remaining capacity.
// The embedded buyer flow renders from this.
export async function GET() {
  const ev = (await sql`select id, name, event_date, venue, tagline
                        from events order by created_at desc limit 1`)[0];
  if (!ev) return Response.json({ error: 'no_event' }, { status: 404 });

  const tiers = await sql`
    select tt.id, tt.name, tt.description, tt.price_cents, tt.admits, tt.is_comp, tt.max_qty,
           coalesce((select sum(qty) from tickets t
                     where t.ticket_type_id=tt.id and t.status <> 'void'),0)::int as sold
    from ticket_types tt
    where tt.event_id=${ev.id} and tt.active=true
    order by tt.sort, tt.name`;

  const ticketTypes = tiers.map((t) => ({
    id: t.id, name: t.name, description: t.description,
    price_cents: t.price_cents, is_comp: t.is_comp, admits: t.admits,
    remaining: t.max_qty == null ? null : Math.max(0, t.max_qty - t.sold),
    soldOut: t.max_qty != null && t.sold >= t.max_qty,
  }));

  return Response.json({ id: ev.id, name: ev.name, date: ev.event_date, venue: ev.venue, tagline: ev.tagline, ticketTypes }, { headers: { 'Cache-Control': 'no-store' } });
}
