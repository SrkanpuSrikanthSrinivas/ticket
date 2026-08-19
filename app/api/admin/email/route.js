export const dynamic = 'force-dynamic';

import { sql } from '../../../../lib/db';

export async function POST(req) {
  const { adminPin, email_subject, email_body } = await req.json().catch(() => ({}));
  if (adminPin !== process.env.ADMIN_PIN) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const ev = (await sql`select id from events order by created_at desc limit 1`)[0];
  if (!ev) return Response.json({ error: 'no_event', message: 'Create the event first.' }, { status: 400 });
  try {
    await sql`update events set email_subject=${email_subject || null}, email_body=${email_body || null} where id=${ev.id}`;
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return Response.json({ error: 'db_error', message: String(e?.message || e) }, { status: 500 }); }
}
