export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { sql } from '../../../../lib/db';
import { ensureExtSchema, staffOk, decorate } from '../../../../lib/extCheckin';

// Staff: check in one registration (all its adults + children). Atomic: a second
// tap returns "already checked in" with the original time.
export async function POST(req) {
  const { staffPin, id, staff = 'gate' } = await req.json().catch(() => ({}));
  if (!staffOk(staffPin)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!id) return Response.json({ error: 'missing_id' }, { status: 400 });
  try {
    await ensureExtSchema();
    const done = await sql`update ext_attendees set checked_in_at = now(), checked_in_by = ${staff}
      where id = ${id} and checked_in_at is null returning *, to_char(registered_at, 'YYYY-MM-DD"T"HH24:MI:SS') as registered_text`;
    const row = done[0] || (await sql`select *, to_char(registered_at, 'YYYY-MM-DD"T"HH24:MI:SS') as registered_text from ext_attendees where id = ${id}`)[0];
    if (!row) return Response.json({ error: 'not_found' }, { status: 404 });
    const reg_count = (await sql`select count(*)::int c from ext_attendees
      where event_id = ${row.event_id} and lower(coalesce(email, id::text)) = lower(coalesce(${row.email}, ${row.id}::text))`)[0].c;
    return Response.json({ ok: done.length > 0, already: done.length === 0, attendee: decorate({ ...row, reg_count }) });
  } catch (e) {
    return Response.json({ error: 'db_error', message: String(e?.message || e) }, { status: 500 });
  }
}
