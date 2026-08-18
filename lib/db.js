import { neon } from '@neondatabase/serverless';

// One HTTP-based client. Works reliably on Vercel's serverless runtime with no
// WebSocket setup. Use sql`...` for single statements and sql.transaction([...])
// for atomic multi-statement writes.
export const sql = neon(process.env.DATABASE_URL);
