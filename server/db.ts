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

// Ensure wallet tables exist (for PlanetScale compatibility)
export async function ensureWalletTables(): Promise<void> {
  try {
    const client = await pool.connect();
    
    // Create wallet_balances table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS wallet_balances (
        id SERIAL PRIMARY KEY,
        merchant_id INTEGER NOT NULL UNIQUE,
        balance_cents INTEGER NOT NULL DEFAULT 0,
        pending_cents INTEGER NOT NULL DEFAULT 0,
        currency VARCHAR(3) NOT NULL DEFAULT 'USD',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Create wallet_transactions table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id SERIAL PRIMARY KEY,
        merchant_id INTEGER NOT NULL,
        type VARCHAR(20) NOT NULL,
        amount_cents INTEGER NOT NULL,
        balance_after_cents INTEGER NOT NULL,
        currency VARCHAR(3) NOT NULL DEFAULT 'USD',
        description TEXT,
        order_id INTEGER,
        stripe_payment_intent_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Create indexes if not exist
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_wallet_balances_merchant ON wallet_balances(merchant_id);
      CREATE INDEX IF NOT EXISTS idx_wallet_transactions_merchant ON wallet_transactions(merchant_id);
      CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created ON wallet_transactions(created_at);
    `);
    
    client.release();
    console.log('[DB] Wallet tables ensured');
  } catch (error) {
    console.error('[DB] Error ensuring wallet tables:', error);
  }
}
