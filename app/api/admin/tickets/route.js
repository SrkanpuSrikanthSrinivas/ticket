export const dynamic = 'force-dynamic';

import { randomUUID } from 'crypto';
import { sql } from '../../../../lib/db';

// Create or update a ticket type + its coupon allotments atomically over HTTP.
export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  if (b.adminPin !== process.env.ADMIN_PIN) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!b.name || !b.name.trim()) return Response.json({ error: 'name_required', message: 'Ticket needs a name.' }, { status: 400 });

  const evRow = (await sql`select id from events order by created_at desc limit 1`)[0];
  if (!evRow) return Response.json({ error: 'no_event', message: 'Create the event details first.' }, { status: 400 });
  const ev = evRow.id;

  const name = b.name.trim();
  const description = b.description || null;
  const priceCents = b.is_comp ? 0 : Math.max(0, Math.round(Number(b.price_cents) || 0));
  const admits = Math.max(1, parseInt(b.admits, 10) || 1);
  const maxQty = (b.max_qty === '' || b.max_qty == null) ? null : Math.max(0, parseInt(b.max_qty, 10));
  const isComp = !!b.is_comp;
  const active = b.active === false ? false : true;
  const sort = parseInt(b.sort, 10) || 0;
  const allot = b.allot || {};

  const ttId = b.id || randomUUID();
  const queries = [];
  if (b.id) {
    queries.push(sql`update ticket_types set name=${name}, description=${description}, price_cents=${priceCents},
                     admits=${admits}, max_qty=${maxQty}, is_comp=${isComp}, active=${active}, sort=${sort}
                     where id=${ttId} and event_id=${ev}`);
  } else {
    queries.push(sql`insert into ticket_types (id, event_id, name, description, price_cents, admits, max_qty, is_comp, active, sort)
                     values (${ttId}, ${ev}, ${name}, ${description}, ${priceCents}, ${admits}, ${maxQty}, ${isComp}, ${active}, ${sort})`);
  }
  queries.push(sql`delete from ticket_coupon_allotments where ticket_type_id=${ttId}`);
  for (const [cid, qty] of Object.entries(allot)) {
    const n = parseInt(qty, 10) || 0;
    if (n > 0) queries.push(sql`insert into ticket_coupon_allotments (ticket_type_id, coupon_type_id, qty_per_guest)
                                values (${ttId}, ${cid}, ${n})`);
  }

  try {
    await sql.transaction(queries);
    return Response.json({ ok: true, id: ttId }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('ticket save failed:', e);
    return Response.json({ error: 'db_error', message: String(e?.message || e) }, { status: 500 });
  }
}

export async function DELETE(req) {
  const { adminPin, id } = await req.json().catch(() => ({}));
  if (adminPin !== process.env.ADMIN_PIN) return Response.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const sold = (await sql`select count(*)::int c from tickets where ticket_type_id=${id}`)[0].c;
    if (sold > 0) {
      await sql`update ticket_types set active=false where id=${id}`;
      return Response.json({ ok: true, deactivated: true });
    }
    await sql`delete from ticket_types where id=${id}`;
    return Response.json({ ok: true, deleted: true });
  } catch (e) {
    return Response.json({ error: 'db_error', message: String(e?.message || e) }, { status: 500 });
  }
}
