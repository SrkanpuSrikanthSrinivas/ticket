export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { sql } from '../../../../lib/db';
import { ensureExtSchema, staffOk } from '../../../../lib/extCheckin';

// Staff: list imported check-in events with live counts.
export async function GET(req) {
  if (!staffOk(new URL(req.url).searchParams.get('pin'))) return Response.json({ error: 'unauthorized' }, { status: 401 });
  try {
    await ensureExtSchema();
    const events = await sql`
      select e.id, e.name, e.updated_at,
        count(a.id)::int as registrations,
        coalesce(sum(a.adults), 0)::int as adults,
        coalesce(sum(a.children), 0)::int as children,
        count(a.checked_in_at)::int as checked_in,
        coalesce(sum(case when a.checked_in_at is not null then a.adults + a.children else 0 end), 0)::int as people_in
      from ext_events e left join ext_attendees a on a.event_id = e.id
      group by e.id order by e.updated_at desc`;
    return Response.json({ events }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: 'db_error', message: String(e?.message || e) }, { status: 500 });
  }
}
