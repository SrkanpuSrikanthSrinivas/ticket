export const dynamic = 'force-dynamic';

import { sql } from '../../../lib/db';

export async function GET(req) {
  const pin = new URL(req.url).searchParams.get('pin');
  if (pin !== process.env.STAFF_PIN && pin !== process.env.ADMIN_PIN) return new Response('unauthorized', { status: 401 });

  const rows = await sql`
    select o.code, o.buyer_name, o.buyer_email, o.buyer_phone as mobile, o.buyer_country as country,
      string_agg(tt.name || ' x' || t.qty, '; ' order by tt.sort) as items,
      coalesce(sum(t.qty*tt.admits),0)::int guests,
      case when sum(case when t.status='checked_in' then 1 else 0 end) = count(*) then 'checked_in'
           when sum(case when t.status='checked_in' then 1 else 0 end) > 0 then 'partial' else 'valid' end as status,
      to_char(max(t.checked_in_at),'YYYY-MM-DD HH24:MI') as checked_in
    from orders o join tickets t on t.order_id=o.id join ticket_types tt on tt.id=t.ticket_type_id
    group by o.id order by o.buyer_name`;

  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = 'code,name,email,mobile,country,items,guests,status,checked_in';
  const csv = [header, ...rows.map((r) => [r.code, r.buyer_name, r.buyer_email, r.mobile, r.country, r.items, r.guests, r.status, r.checked_in].map(esc).join(','))].join('\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="mkant-checkin-list.csv"' } });
}
