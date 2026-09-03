import { neon } from '@neondatabase/serverless';

// Force the DIRECT (non-pooled) Neon endpoint.
//
// The pooled endpoint ("-pooler" in the host) returned STALE data on a read taken
// immediately after a write for this workload — the write committed (RETURNING
// showed the new value) but the next read still saw the old value, so admin edits
// looked like they never saved. The direct compute endpoint is strongly
// consistent. We strip "-pooler" here so this holds no matter what DATABASE_URL is
// set to in the deployment. We also disable HTTP response caching on the driver.
//
// The neon() HTTP driver is stateless (no held connections), so the direct
// endpoint's lower connection ceiling is not a concern at this volume.
const rawUrl = process.env.DATABASE_URL || '';
const directUrl = rawUrl.replace(/-pooler\./, '.');

export const sql = neon(directUrl, { fetchOptions: { cache: 'no-store' } });

// --- self-healing schema guard ---------------------------------------------
// Recent features added columns via migration files. If the operator hasn't run
// a migration yet, reads/writes that reference the new column would 500 (e.g.
// "column category does not exist"), which shows up as "admin edit not saving".
// ensureSchema() applies the additive, idempotent ALTERs once per warm instance
// so a missing migration can't break the app. `add column if not exists` is a
// cheap no-op when the column already exists.
let _ensured = false;
export async function ensureSchema() {
  if (_ensured) return;
  try {
    await sql`alter table events add column if not exists details text`;
    await sql`alter table events add column if not exists start_date text`;
    await sql`alter table events add column if not exists end_date text`;
    await sql`alter table events add column if not exists food_tip text`;
    await sql`alter table events add column if not exists start_time text`;
    await sql`alter table events add column if not exists end_time text`;
    await sql`alter table events add column if not exists food_note text`;
    await sql`alter table events add column if not exists flyer_url text`;
    await sql`alter table events add column if not exists pricing_note text`;
    await sql`alter table events add column if not exists pricing_deadline text`;
    await sql`alter table events add column if not exists email_subject text`;
    await sql`alter table events add column if not exists email_body text`;
    await sql`alter table orders add column if not exists buyer_country text`;
    await sql`alter table orders add column if not exists buyer_zip text`;
    await sql`alter table orders add column if not exists code text`;
    await sql`alter table ticket_types add column if not exists category text not null default 'entry'`;
    _ensured = true;
  } catch (e) {
    console.error('ensureSchema failed (non-fatal):', e?.message || e);
  }
}
