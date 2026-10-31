export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { sql } from '../../../../lib/db';
import { ensureExtSchema, normalizeRow } from '../../../../lib/extCheckin';

// Admin: import an exported registration sheet into a separate check-in event.
// Upserts on (event, email + registration time): re-importing a newer export adds
// new people and refreshes details, but NEVER resets anyone's check-in.
export async function POST(req) {
  const { adminPin, eventName, rows } = await req.json().catch(() => ({}));
  if (adminPin !== process.env.ADMIN_PIN) return Response.json({ error: 'unauthorized', message: 'Wrong admin PIN.' }, { status: 401 });
  if (!Array.isArray(rows) || rows.length === 0) return Response.json({ error: 'no_rows', message: 'No rows found in the file.' }, { status: 400 });

  try {
    await ensureExtSchema();
    const recs = rows.map(normalizeRow).filter((r) => r.first_name || r.last_name || r.email);
    const name = String(eventName || recs.find((r) => r.event_name)?.event_name || '').trim();
    if (!name) return Response.json({ error: 'no_event', message: 'Enter an event name.' }, { status: 400 });

    // collapse exact duplicate keys inside one file (last row wins)
    const byKey = new Map(); for (const r of recs) byKey.set(r.reg_key, r);
    const payload = JSON.stringify([...byKey.values()]);

    const ev = (await sql`insert into ext_events (name) values (${name})
      on conflict (name) do update set updated_at = now() returning id`)[0];

    const res = await sql`
      insert into ext_attendees (event_id, reg_key, member_id, member_expiry, first_name, last_name, email, city, state,
        mobile, mobile_digits, txn_id, payment_method, payment_status, membership_type, amount_paid, registered_at,
        reg_status, comment, adults, children, raw)
      select ${ev.id}, x.reg_key, x.member_id, x.member_expiry, x.first_name, x.last_name, x.email, x.city, x.state,
        x.mobile, x.mobile_digits, x.txn_id, x.payment_method, x.payment_status, x.membership_type, x.amount_paid, x.registered_at,
        x.reg_status, x.comment, x.adults, x.children, x.raw
      from json_to_recordset(${payload}::json) as x(reg_key text, member_id text, member_expiry text, first_name text, last_name text,
        email text, city text, state text, mobile text, mobile_digits text, txn_id text, payment_method text, payment_status text,
        membership_type text, amount_paid numeric, registered_at timestamp, reg_status text, comment text, adults int, children int, raw jsonb)
      on conflict (event_id, reg_key) do update set
        member_id = excluded.member_id, member_expiry = excluded.member_expiry, first_name = excluded.first_name,
        last_name = excluded.last_name, email = excluded.email, city = excluded.city, state = excluded.state,
        mobile = excluded.mobile, mobile_digits = excluded.mobile_digits, txn_id = excluded.txn_id,
        payment_method = excluded.payment_method, payment_status = excluded.payment_status,
        membership_type = excluded.membership_type, amount_paid = excluded.amount_paid,
        registered_at = excluded.registered_at, reg_status = excluded.reg_status, comment = excluded.comment,
        adults = excluded.adults, children = excluded.children, raw = excluded.raw, updated_at = now()
      returning (xmax = 0) as inserted`;

    const added = res.filter((r) => r.inserted).length;
    return Response.json({ ok: true, event: name, eventId: ev.id, rows: byKey.size, added, updated: res.length - added });
  } catch (e) {
    console.error('ext import failed:', e);
    return Response.json({ error: 'db_error', message: String(e?.message || e) }, { status: 500 });
  }
}
