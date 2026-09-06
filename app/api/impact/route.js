export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { sql, ensureSchema } from '../../../lib/db';

// Public adoption/impact metrics. AGGREGATE ONLY — never returns buyer PII.
// Every number is derived from the production transaction database at request time.
export async function GET() {
  await ensureSchema();
  const r = (await sql`
    select
      (select count(*) from orders where status='paid')::int transactions,
      (select coalesce(sum(qty),0) from tickets)::int tickets_sold,
      (select coalesce(sum(t.qty*tt.admits),0)
         from tickets t join ticket_types tt on tt.id = t.ticket_type_id)::int guests,
      (select count(distinct event_id) from orders)::int events_supported,
      (select count(distinct lower(buyer_email))
         from orders where buyer_email is not null and buyer_email <> '')::int users_served,
      (select min(created_at) from orders) as first_order,
      (select max(created_at) from orders) as last_order,
      (select coalesce(sum(amount_cents),0) from orders where status='paid')::int revenue_cents,
      (select coalesce(sum(fee_cents),0) from orders where status='paid')::int fees_cents
  `)[0];

  const om = await sql`select to_char(date_trunc('month', created_at),'YYYY-MM') as m,
      count(*)::int transactions, coalesce(sum(amount_cents),0)::int value_cents
    from orders where status='paid' group by 1 order by 1`;
  const tm = await sql`select to_char(date_trunc('month', created_at),'YYYY-MM') as m,
      coalesce(sum(qty),0)::int tickets from tickets group by 1 order by 1`;
  const tmap = Object.fromEntries(tm.map((x) => [x.m, x.tickets]));
  const monthly = om.map((x) => ({ month: x.m, transactions: x.transactions, tickets: tmap[x.m] || 0, value_usd: +(x.value_cents / 100).toFixed(2) }));

  const first = r.first_order ? new Date(r.first_order) : null;
  const now = new Date();
  const months = first
    ? (now.getFullYear() - first.getFullYear()) * 12 + (now.getMonth() - first.getMonth()) + 1
    : 0;

  return Response.json({
    organization: process.env.ORG_NAME || 'Community organization',
    platform: process.env.PLATFORM_NAME || 'Community Ticketing Platform',
    transactions_processed: r.transactions,
    tickets_processed: r.tickets_sold,
    guests_served: r.guests,
    events_supported: r.events_supported,
    users_served: r.users_served,
    months_in_production: Math.max(0, months),
    production_since: first ? first.toISOString().slice(0, 10) : null,
    last_transaction: r.last_order ? new Date(r.last_order).toISOString().slice(0, 10) : null,
    value_processed_usd: +(r.revenue_cents / 100).toFixed(2),
    monthly,
    data_source: 'Production transaction database',
    updated_at: now.toISOString(),
  }, { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } });
}
