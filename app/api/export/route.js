export const dynamic = 'force-dynamic';

import { sql } from '../../../lib/db';

// Printable / offline backup: CSV of every ticket. Print this before doors open
// in case venue wifi drops mid-event.
export async function GET(req) {
  const pin = new URL(req.url).searchParams.get('pin');
  if (pin !== process.env.STAFF_PIN) return new Response('unauthorized', { status: 401 });

  const rows = await sql`
    select t.code, o.buyer_name, o.buyer_email, tt.name as type, t.qty, t.status,
           to_char(t.checked_in_at,'YYYY-MM-DD HH24:MI') as checked_in
    from tickets t join ticket_types tt on tt.id=t.ticket_type_id
    join orders o on o.id=t.order_id order by o.buyer_name`;

  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = 'code,name,email,type,qty,status,checked_in';
  const csv = [header, ...rows.map((r) =>
    [r.code, r.buyer_name, r.buyer_email, r.type, r.qty, r.status, r.checked_in].map(esc).join(','))].join('\n');

  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="mkant-checkin-list.csv"' },
  });
}
