export const dynamic = 'force-dynamic';

import { sql } from '../../../../lib/db';

// Admin: create or update the event details.
export async function POST(req) {
  const { adminPin, name, date, venue, tagline, details } = await req.json().catch(() => ({}));
  if (adminPin !== process.env.ADMIN_PIN) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!name) return Response.json({ error: 'name_required' }, { status: 400 });

  const existing = (await sql`select id from events order by created_at desc limit 1`)[0];
  let row;
  if (existing) {
    row = (await sql`update events set name=${name}, event_date=${date || null}, venue=${venue || null},
                     tagline=${tagline || null}, details=${details || null}
                     where id=${existing.id} returning id`)[0];
  } else {
    row = (await sql`insert into events (name, event_date, venue, tagline, details)
                     values (${name}, ${date || null}, ${venue || null}, ${tagline || null}, ${details || null})
                     returning id`)[0];
  }
  return Response.json({ ok: true, id: row.id });
}
