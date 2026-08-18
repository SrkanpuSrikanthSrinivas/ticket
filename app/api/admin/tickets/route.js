export const dynamic = 'force-dynamic';

import { pool, sql } from '../../../../lib/db';

// Admin: create or update a ticket type together with its per-ticket coupon
// allotments, atomically. This is what the "create a ticket" form posts.
export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  if (b.adminPin !== process.env.ADMIN_PIN) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!b.name) return Response.json({ error: 'name_required' }, { status: 400 });

  const ev = (await sql`select id from events order by created_at desc limit 1`)[0]?.id;
  if (!ev) return Response.json({ error: 'no_event' }, { status: 400 });

  const priceCents = Math.max(0, Math.round((b.price_cents ?? 0)));
  const admits = Math.max(1, parseInt(b.admits, 10) || 1);
  const maxQty = (b.max_qty === '' || b.max_qty == null) ? null : Math.max(0, parseInt(b.max_qty, 10));
  const isComp = !!b.is_comp;
  const active = b.active === false ? false : true;
  const sort = parseInt(b.sort, 10) || 0;
  const allot = b.allot || {};

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let ttId = b.id;
    if (ttId) {
      await client.query(
        `update ticket_types set name=$2, description=$3, price_cents=$4, admits=$5,
         max_qty=$6, is_comp=$7, active=$8, sort=$9 where id=$1 and event_id=$10`,
        [ttId, b.name, b.description || null, priceCents, admits, maxQty, isComp, active, sort, ev]);
    } else {
      ttId = (await client.query(
        `insert into ticket_types (event_id, name, description, price_cents, admits, max_qty, is_comp, active, sort)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [ev, b.name, b.description || null, priceCents, admits, maxQty, isComp, active, sort])).rows[0].id;
    }
    await client.query('delete from ticket_coupon_allotments where ticket_type_id=$1', [ttId]);
    for (const [cid, qty] of Object.entries(allot)) {
      const n = parseInt(qty, 10) || 0;
      if (n > 0) await client.query(
        `insert into ticket_coupon_allotments (ticket_type_id, coupon_type_id, qty_per_guest) values ($1,$2,$3)`,
        [ttId, cid, n]);
    }
    await client.query('COMMIT');
    return Response.json({ ok: true, id: ttId });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error(e);
    return Response.json({ error: 'server_error' }, { status: 500 });
  } finally {
    client.release();
  }
}

// Admin: delete a ticket type. If tickets were already sold under it, we
// deactivate instead so historical orders stay intact.
export async function DELETE(req) {
  const { adminPin, id } = await req.json().catch(() => ({}));
  if (adminPin !== process.env.ADMIN_PIN) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const sold = (await sql`select count(*)::int c from tickets where ticket_type_id=${id}`)[0].c;
  if (sold > 0) {
    await sql`update ticket_types set active=false where id=${id}`;
    return Response.json({ ok: true, deactivated: true });
  }
  await sql`delete from ticket_types where id=${id}`;
  return Response.json({ ok: true, deleted: true });
}
