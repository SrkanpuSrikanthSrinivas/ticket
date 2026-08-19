export const dynamic = 'force-dynamic';

import { randomUUID } from 'crypto';
import { sql } from '../../../../lib/db';

const BUILD = 'diag-2';

// Deep diagnostic: figures out WHY an UPDATE might not persist.
// Visit /api/admin/selftest?pin=YOURADMINPIN and send back the JSON.
export async function GET(req) {
  const pin = new URL(req.url).searchParams.get('pin');
  if (pin !== process.env.ADMIN_PIN) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const out = { build: BUILD, steps: {}, diag: {} };
  const url = process.env.DATABASE_URL || '';
  out.db_host = (url.match(/@([^/]+)\//) || [])[1] || 'unknown';
  out.using_pooled_endpoint = /-pooler\./.test(url);

  try {
    const ev = await sql`select id, name from events order by created_at desc`;
    out.events_count = ev.length;
    out.current_event = ev[0] || null;
    out.ticket_types_count = (await sql`select count(*)::int c from ticket_types`)[0].c;
    out.steps.read = 'ok';
  } catch (e) { out.steps.read = 'FAIL: ' + String(e?.message || e); return Response.json(out, { status: 500 }); }

  // --- catalog inspection: RLS, policies, triggers, privileges, role ---
  try {
    out.diag.rls_enabled = (await sql`select relrowsecurity as e from pg_class where relname='ticket_types'`)[0]?.e ?? null;
    out.diag.policies = await sql`select policyname, cmd, permissive, roles::text as roles, qual, with_check from pg_policies where tablename='ticket_types'`;
    out.diag.triggers = (await sql`select tgname from pg_trigger where tgrelid='ticket_types'::regclass and not tgisinternal`).map((r) => r.tgname);
    out.diag.role = (await sql`select current_user as current_user, session_user as session_user`)[0];
    out.diag.privileges = (await sql`select
        has_table_privilege(current_user,'ticket_types','SELECT') as can_select,
        has_table_privilege(current_user,'ticket_types','INSERT') as can_insert,
        has_table_privilege(current_user,'ticket_types','UPDATE') as can_update,
        has_table_privilege(current_user,'ticket_types','DELETE') as can_delete`)[0];
  } catch (e) { out.diag.catalog_error = String(e?.message || e); }

  // --- the actual update test, with every raw value exposed ---
  if (out.current_event) {
    try {
      const id = randomUUID();
      await sql`insert into ticket_types (id, event_id, name, price_cents, admits, active, sort)
                values (${id}, ${out.current_event.id}, ${'diag-' + Date.now()}, 100, 1, false, 999)`;
      const insBack = await sql`select price_cents from ticket_types where id=${id}`;
      out.diag.insert_reread = insBack[0]?.price_cents ?? null;

      const upd = await sql`update ticket_types set price_cents=222 where id=${id} returning id, price_cents`;
      out.diag.update_matched_rows = upd.length;
      out.diag.update_returned_value = upd[0]?.price_cents ?? null;

      const reread = await sql`select price_cents from ticket_types where id=${id}`;
      out.diag.reread_after_update = reread[0]?.price_cents ?? null;

      const persisted = upd.length === 1 && Number(reread[0]?.price_cents) === 222;
      out.steps.update = persisted ? 'ok — update persisted' : 'FAIL — update did not persist';
      await sql`delete from ticket_types where id=${id}`;
    } catch (e) { out.steps.update = 'ERROR: ' + String(e?.message || e); }
  }

  // --- verdict with the likely fix ---
  if (out.steps.update?.startsWith('ok')) {
    out.verdict = 'Updates persist. If the admin still looks unsaved, hard-refresh; the write is landing.';
  } else if (out.diag.rls_enabled === true) {
    out.verdict = 'ROW-LEVEL SECURITY is ON for ticket_types and is blocking updates. Fix: disable RLS (see message).';
  } else if (out.diag.privileges && out.diag.privileges.can_update === false) {
    out.verdict = 'The database role LACKS UPDATE privilege. Fix: grant update (see message).';
  } else if (out.diag.update_matched_rows === 1 && Number(out.diag.reread_after_update) !== 222) {
    out.verdict = 'Update matched the row but a fresh read saw stale data — pooled-endpoint read lag. Fix: use the DIRECT (non-pooler) connection string.';
  } else if (out.diag.update_matched_rows === 0) {
    out.verdict = 'Update matched ZERO rows on a row that exists — something is filtering updates (RLS/policy/trigger). See diag.';
  } else {
    out.verdict = 'Inconclusive — send this JSON over.';
  }

  return Response.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
