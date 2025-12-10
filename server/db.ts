import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

// Check if using PlanetScale or local Postgres
const usePlanetScale = !!process.env.PLANETSCALE_HOST;

const host = process.env.PLANETSCALE_HOST || process.env.PGHOST;
const port = parseInt(process.env.PLANETSCALE_PORT || process.env.PGPORT || '5432');
const database = process.env.PLANETSCALE_DATABASE || process.env.PGDATABASE;
const user = process.env.PLANETSCALE_USERNAME || process.env.PGUSER;
const password = process.env.PLANETSCALE_PASSWORD || process.env.PGPASSWORD;

if (!host || !database || !user || !password) {
  throw new Error(
    "Database credentials must be set. Required: PLANETSCALE_HOST, PLANETSCALE_DATABASE, PLANETSCALE_USERNAME, PLANETSCALE_PASSWORD (or PG* equivalents)"
  );
}

// Configure SSL based on database type
const sslConfig = usePlanetScale ? { rejectUnauthorized: true } : { rejectUnauthorized: false };

export const pool = new Pool({
  host,
  port,
  database,
  user,
  password,
  ssl: sslConfig,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export const db = drizzle(pool, { schema });

export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('Database connection successful');
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}
