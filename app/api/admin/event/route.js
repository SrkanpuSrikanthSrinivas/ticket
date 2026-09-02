export const dynamic = 'force-dynamic';

import { sql, ensureSchema } from '../../../../lib/db';

// Admin: create or update the event details.
export async function POST(req) {
  await ensureSchema();
  const { adminPin, name, date, start_time, end_time, venue, tagline, details, flyer_url, pricing_note, pricing_deadline, food_note } = await req.json().catch(() => ({}));
  if (adminPin !== process.env.ADMIN_PIN) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!name) return Response.json({ error: 'name_required' }, { status: 400 });

  const existing = (await sql`select id from events order by created_at desc, id desc limit 1`)[0];
  let row;
  if (existing) {
    row = (await sql`update events set name=${name}, event_date=${date || null}, start_time=${start_time || null}, end_time=${end_time || null}, venue=${venue || null},
                     tagline=${tagline || null}, details=${details || null},
                     flyer_url=${flyer_url || null}, pricing_note=${pricing_note || null}, pricing_deadline=${pricing_deadline || null}, food_note=${food_note || null}
                     where id=${existing.id} returning id`)[0];
  } else {
    row = (await sql`insert into events (name, event_date, start_time, end_time, venue, tagline, details, flyer_url, pricing_note, pricing_deadline, food_note)
                     values (${name}, ${date || null}, ${start_time || null}, ${end_time || null}, ${venue || null}, ${tagline || null}, ${details || null}, ${flyer_url || null}, ${pricing_note || null}, ${pricing_deadline || null}, ${food_note || null})
                     returning id`)[0];
  }
  return Response.json({ ok: true, id: row.id });
}
