export const dynamic = 'force-dynamic';

import { sql } from '../../../../lib/db';

async function eventId() {
  return (await sql`select id from events order by created_at desc limit 1`)[0]?.id;
}

// Create or update a food-coupon denomination (name + dollar value).
export async function POST(req) {
  const { adminPin, id, name, value_cents } = await req.json().catch(() => ({}));
  if (adminPin !== process.env.ADMIN_PIN) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!name || !name.trim()) return Response.json({ error: 'name_required', message: 'Coupon needs a label.' }, { status: 400 });
  const val = Math.max(0, Math.round(Number(value_cents) || 0));

  try {
    if (id) {
      await sql`update coupon_types set name=${name.trim()}, value_cents=${val} where id=${id}`;
      return Response.json({ ok: true, id });
    }
    const ev = await eventId();
    if (!ev) return Response.json({ error: 'no_event', message: 'Create the event first.' }, { status: 400 });
    const row = (await sql`insert into coupon_types (event_id, name, value_cents) values (${ev}, ${name.trim()}, ${val}) returning id`)[0];
    return Response.json({ ok: true, id: row.id });
  } catch (e) {
    return Response.json({ error: 'db_error', message: String(e?.message || e) }, { status: 500 });
  }
}

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
