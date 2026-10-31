export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { sql } from '../../../../lib/db';
import { ensureExtSchema, staffOk, decorate } from '../../../../lib/extCheckin';

// Staff: search one imported event by name, email, phone, transaction id, or member id.
export async function POST(req) {
  const { staffPin, eventId, q } = await req.json().catch(() => ({}));
  if (!staffOk(staffPin)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const text = String(q || '').trim();
  if (!eventId || text.length < 2) return Response.json({ matches: [] });

  try {
    await ensureExtSchema();
    const like = `%${text}%`;
    const qDigits = text.replace(/\D/g, '');
    const digits = qDigits.length >= 3 ? `%${qDigits}%` : '%~nomatch~%';
    const rows = await sql`
      with e as (
        select a.*, count(*) over (partition by lower(coalesce(a.email, a.id::text)))::int as reg_count
        from ext_attendees a where a.event_id = ${eventId}
      )
      select *, to_char(registered_at, 'YYYY-MM-DD"T"HH24:MI:SS') as registered_text from e
      where coalesce(first_name,'') || ' ' || coalesce(last_name,'') ilike ${like}
         or coalesce(last_name,'') || ' ' || coalesce(first_name,'') ilike ${like}
         or email ilike ${like}
         or txn_id ilike ${like}
         or member_id ilike ${like}
         or mobile_digits like ${digits}
      order by last_name, first_name, registered_at
      limit 51`;
    const list = rows.map(decorate);
    return Response.json({ matches: list.slice(0, 50), truncated: list.length > 50 }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: 'db_error', message: String(e?.message || e) }, { status: 500 });
  }
}
