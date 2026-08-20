export const dynamic = 'force-dynamic';

import { sql } from '../../../lib/db';
import { verifyTicket } from '../../../lib/token';

// Staff lookup: accepts a scanned signed token, a human code, or a name/email.
export async function POST(req) {
  const { q, staffPin } = await req.json().catch(() => ({}));
  if (staffPin !== process.env.STAFF_PIN) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!q) return Response.json({ matches: [] });

  const asId = verifyTicket(q);
  let rows;
  if (asId) {
    rows = await sql`
      select t.id, t.code, t.qty, t.status, t.checked_in_at, tt.name as type_name, o.buyer_name
      from tickets t join ticket_types tt on tt.id=t.ticket_type_id
      join orders o on o.id=t.order_id where t.id=${asId}`;
  } else {
    const like = `%${q}%`;
    rows = await sql`
      select t.id, t.code, t.qty, t.status, t.checked_in_at, tt.name as type_name, o.buyer_name
      from tickets t join ticket_types tt on tt.id=t.ticket_type_id
      join orders o on o.id=t.order_id
      where t.code ilike ${like} or o.buyer_name ilike ${like} or o.buyer_email ilike ${like}
      order by o.buyer_name limit 51`;
  }
  const truncated = rows.length > 50; return Response.json({ matches: rows.slice(0, 50), truncated });
}
