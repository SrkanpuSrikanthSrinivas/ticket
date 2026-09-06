export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { sql, ensureSchema } from '../../../../lib/db';

export async function GET(req) {
  await ensureSchema();
  const url = new URL(req.url);
  const pin = url.searchParams.get('pin');
  if (pin !== process.env.ADMIN_PIN) return new Response('unauthorized', { status: 401 });

  const rows = await sql`select txn_ref, event_name, items, guests, amount_cents, fee_cents,
      braintree_txn_id, status, to_char(created_at,'YYYY-MM-DD HH24:MI:SS') as timestamp
    from audit_log order by id desc limit 5000`;

  if (url.searchParams.get('format') === 'csv') {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = 'txn_ref,event,items,guests,amount_usd,fee_usd,braintree_txn_id,status,timestamp';
    const csv = [header, ...rows.map((r) => [r.txn_ref, r.event_name, r.items, r.guests,
      (r.amount_cents / 100).toFixed(2), (r.fee_cents / 100).toFixed(2), r.braintree_txn_id, r.status, r.timestamp].map(esc).join(','))].join('\n');
    return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="audit-log.csv"' } });
  }
  return Response.json({ count: rows.length, records: rows }, { headers: { 'Cache-Control': 'no-store' } });
}
