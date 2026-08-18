export const dynamic = 'force-dynamic';

import { randomUUID } from 'crypto';
import { sql } from '../../../../lib/db';

const BUILD = 'save-fix-3';

// One-shot diagnostic: proves whether THIS deployment can write to THIS database.
// Visit /api/admin/selftest?pin=YOURADMINPIN and read the JSON.
export async function GET(req) {
  const pin = new URL(req.url).searchParams.get('pin');
  if (pin !== process.env.ADMIN_PIN) return Response.json({ error: 'unauthorized', hint: 'ADMIN_PIN missing or wrong in this deployment' }, { status: 401 });

  const out = { build: BUILD, db_url_set: !!process.env.DATABASE_URL, steps: {} };
  const url = process.env.DATABASE_URL || '';
  out.db_host = (url.match(/@([^/]+)\//) || [])[1] || 'unknown';
  out.using_pooled_endpoint = /-pooler\./.test(url);

  // READ
  try {
    const ev = await sql`select id, name, created_at from events order by created_at desc`;
    out.events_count = ev.length;
    out.current_event = ev[0] ? { id: ev[0].id, name: ev[0].name } : null;
    out.ticket_types_count = (await sql`select count(*)::int c from ticket_types`)[0].c;
    out.steps.read = 'ok';
  } catch (e) { out.steps.read = 'FAIL: ' + String(e?.message || e); return Response.json(out, { status: 500 }); }

  if (!out.current_event) { out.steps.write = 'skipped — no event exists yet (create one in /admin)'; return Response.json(out); }

  // WRITE round-trip (insert -> read back -> delete)
  try {
    const id = randomUUID();
    const probe = 'selftest-' + Date.now();
    await sql`insert into ticket_types (id, event_id, name, description, price_cents, admits, max_qty, is_comp, active, sort)
              values (${id}, ${out.current_event.id}, ${probe}, 'diagnostic', 111, 1, null, false, false, 999)`;
    const back = await sql`select price_cents from ticket_types where id=${id}`;
    if (back[0]?.price_cents === 111) {
      out.steps.write = 'ok — a row was written and read back. WRITES WORK.';
      const upd = await sql`update ticket_types set price_cents=222 where id=${id} returning id`;
      const re = await sql`select price_cents from ticket_types where id=${id}`;
      out.steps.update = (upd.length === 1 && re[0]?.price_cents === 222) ? 'ok — update persisted' : 'FAIL — update did not persist';
      await sql`delete from ticket_types where id=${id}`;
      out.steps.cleanup = 'ok';
    } else {
      out.steps.write = 'FAIL — inserted a row but could not read it back (write did not persist)';
    }
  } catch (e) { out.steps.write = 'FAIL: ' + String(e?.message || e); }

  out.verdict = out.steps.write?.startsWith('ok')
    ? 'This deployment CAN write to this database. If the admin still looks unsaved, the issue is deployment freshness or you are viewing a different event.'
    : 'This deployment CANNOT write to this database — see steps.write for the exact reason.';
  return Response.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
