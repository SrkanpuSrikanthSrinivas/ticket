import { sql } from './db';

// Self-healing schema. Every column any recent migration adds is (re)ensured here
// with "add column if not exists" — idempotent and a no-op once present. Runs at
// most once per serverless instance (module-scoped flag), so admin/buyer flows
// keep working even if a SQL migration file wasn't run by hand.
let ensured = false;
export async function ensureSchema() {
  if (ensured) return;
  try {
    await sql`alter table events add column if not exists tagline text`;
    await sql`alter table events add column if not exists details text`;
    await sql`alter table events add column if not exists flyer_url text`;
    await sql`alter table events add column if not exists pricing_note text`;
    await sql`alter table events add column if not exists email_subject text`;
    await sql`alter table events add column if not exists email_body text`;
    await sql`alter table orders add column if not exists buyer_country text`;
    await sql`alter table orders add column if not exists buyer_zip text`;
    await sql`alter table orders add column if not exists code text`;
    await sql`alter table ticket_types add column if not exists admits int not null default 1`;
    await sql`alter table ticket_types add column if not exists category text not null default 'entry'`;
    await sql`alter table coupon_types add column if not exists value_cents int not null default 0`;
    ensured = true;
  } catch (e) {
    console.error('ensureSchema failed (will retry next request):', e?.message || e);
  }
}
