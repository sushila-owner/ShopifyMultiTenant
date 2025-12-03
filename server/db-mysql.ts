import { drizzle } from 'drizzle-orm/planetscale-serverless';
import { Client } from '@planetscale/database';
import * as schema from "@shared/schema-mysql";

if (!process.env.PLANETSCALE_DATABASE_URL) {
  throw new Error(
    "PLANETSCALE_DATABASE_URL must be set. Please add your PlanetScale connection string.",
  );
}

const client = new Client({
  url: process.env.PLANETSCALE_DATABASE_URL,
});

export const db = drizzle(client, { schema });
