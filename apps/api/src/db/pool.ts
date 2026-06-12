import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Neon requires SSL. The connection string already has sslmode=require.
// We just need to not override it with conflicting options.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Don't add ssl: {} here — Neon's connection string handles it
});

pool.on('connect', () => {
  console.log('PostgreSQL connected');
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
  // Don't exit — let it reconnect
});
