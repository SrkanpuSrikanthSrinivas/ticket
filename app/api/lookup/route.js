export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { sql, ensureSchema } from '../../../lib/db';
import { verifyTicket } from '../../../lib/token';

function decorate(rows) {
  return rows.map((r) => ({ ...r, status: Number(r.ticket_count) > 0 && Number(r.checked_count) >= Number(r.ticket_count) ? 'checked_in' : (Number(r.checked_count) > 0 ? 'partial' : 'valid') }));
}

export async function POST(req) {
  await ensureSchema();
  const { q, staffPin } = await req.json().catch(() => ({}));
  if (staffPin !== process.env.STAFF_PIN) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!q) return Response.json({ matches: [] });

  const orderId = verifyTicket(q); // a scanned QR is a signed order id
  let rows;
  if (orderId) {
    rows = await sql`
      select o.id, o.buyer_name, o.buyer_email, o.code,
        count(t.id)::int ticket_count,
        coalesce(sum(case when t.status='checked_in' then 1 else 0 end),0)::int checked_count,
        coalesce(sum(t.qty*tt.admits),0)::int guests,
        string_agg(tt.name || (case when t.qty>1 then ' ×'||t.qty else '' end), ', ' order by tt.sort) as items,
        max(t.checked_in_at) as checked_in_at
      from orders o join tickets t on t.order_id=o.id join ticket_types tt on tt.id=t.ticket_type_id
      where o.id=${orderId} group by o.id`;
  } else {
    const like = `%${q}%`;
    rows = await sql`
      select o.id, o.buyer_name, o.buyer_email, o.code,
        count(t.id)::int ticket_count,
        coalesce(sum(case when t.status='checked_in' then 1 else 0 end),0)::int checked_count,
        coalesce(sum(t.qty*tt.admits),0)::int guests,
        string_agg(tt.name || (case when t.qty>1 then ' ×'||t.qty else '' end), ', ' order by tt.sort) as items,
        max(t.checked_in_at) as checked_in_at
      from orders o join tickets t on t.order_id=o.id join ticket_types tt on tt.id=t.ticket_type_id
      where o.buyer_name ilike ${like} or o.buyer_email ilike ${like} or o.code ilike ${like}
         or o.id in (select order_id from tickets where code ilike ${like})
      group by o.id order by o.buyer_name limit 51`;
  }
  const decorated = decorate(rows);
  const truncated = decorated.length > 50;
  return Response.json({ matches: decorated.slice(0, 50), truncated });
}
