export const dynamic = 'force-dynamic';

import { sql } from '../../../../lib/db';

async function eventId() {
  return (await sql`select id from events order by created_at desc limit 1`)[0]?.id;
}

// Admin: create/rename a coupon type.
export async function POST(req) {
  const { adminPin, id, name } = await req.json().catch(() => ({}));
  if (adminPin !== process.env.ADMIN_PIN) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!name) return Response.json({ error: 'name_required' }, { status: 400 });

  if (id) {
    await sql`update coupon_types set name=${name} where id=${id}`;
    return Response.json({ ok: true, id });
  }
  const ev = await eventId();
  if (!ev) return Response.json({ error: 'no_event' }, { status: 400 });
  const row = (await sql`insert into coupon_types (event_id, name) values (${ev}, ${name}) returning id`)[0];
  return Response.json({ ok: true, id: row.id });
}

// Admin: remove a coupon type (blocked if coupons of this type were already issued).
export async function DELETE(req) {
  const { adminPin, id } = await req.json().catch(() => ({}));
  if (adminPin !== process.env.ADMIN_PIN) return Response.json({ error: 'unauthorized' }, { status: 401 });
  try {
    await sql`delete from coupon_types where id=${id}`;
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: 'in_use', message: 'Coupons of this type were already issued.' }, { status: 409 });
  }
}
