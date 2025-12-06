import { pool } from "../server/db";

async function addColumns() {
  const client = await pool.connect();
  try {
    console.log('Adding missing columns to suppliers table...');
    await client.query(`
      ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS capabilities jsonb DEFAULT '{"readProducts": true, "readInventory": true, "createOrders": true, "readOrders": true, "getTracking": true}'::jsonb;
    `);
    console.log('Added capabilities column');
    
    await client.query(`
      ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS connection_status text DEFAULT 'unknown';
    `);
    console.log('Added connection_status column');
    
    await client.query(`
      ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS last_connection_test timestamp;
    `);
    console.log('Added last_connection_test column');
    
    console.log('All columns added successfully!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

addColumns();
