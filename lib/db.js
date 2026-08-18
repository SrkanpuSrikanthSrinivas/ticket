import { neon, Pool } from '@neondatabase/serverless';

// Tagged-template client for simple single-statement queries.
export const sql = neon(process.env.DATABASE_URL);

// Pool for real multi-statement transactions (checkout).
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
