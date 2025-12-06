import { pool } from "../server/db";

async function addColumn() {
  const client = await pool.connect();
  try {
    console.log('Adding connection_error column...');
    await client.query(`
      ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS connection_error text;
    `);
    console.log('Added connection_error column');
    console.log('Done!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

addColumn();
