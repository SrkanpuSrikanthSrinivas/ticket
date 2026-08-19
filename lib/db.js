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
