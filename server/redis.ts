import { Redis } from "@upstash/redis";

let redisClient: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.log("[Redis] No Upstash REST credentials configured, using in-memory storage");
    return null;
  }

  if (!redisClient) {
    console.log("[Redis] Connecting to Upstash Redis (REST API)...");
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    console.log("[Redis] Upstash Redis client initialized");
  }

  return redisClient;
}

const NONCE_PREFIX = "shopify_nonce:";
const PENDING_PREFIX = "shopify_pending:";
const NONCE_TTL = 600; // 10 minutes
const PENDING_TTL = 300; // 5 minutes

export interface OAuthNonce {
  shop: string;
  merchantId: number;
  timestamp: number;
}

export interface PendingConnection {
  domain: string;
  accessToken: string;
  scopes: string[];
  shopName: string;
  merchantId: number;
  timestamp: number;
}

export async function setOAuthNonce(nonce: string, data: OAuthNonce): Promise<void> {
  const client = getRedisClient();
  if (client) {
    await client.setex(`${NONCE_PREFIX}${nonce}`, NONCE_TTL, JSON.stringify(data));
  }
}

export async function getOAuthNonce(nonce: string): Promise<OAuthNonce | null> {
  const client = getRedisClient();
  if (client) {
    const data = await client.get<string>(`${NONCE_PREFIX}${nonce}`);
    if (data) {
      return typeof data === 'string' ? JSON.parse(data) : data;
    }
  }
  return null;
}

export async function deleteOAuthNonce(nonce: string): Promise<void> {
  const client = getRedisClient();
  if (client) {
    await client.del(`${NONCE_PREFIX}${nonce}`);
  }
}

export async function setPendingConnection(code: string, data: PendingConnection): Promise<void> {
  const client = getRedisClient();
  if (client) {
    await client.setex(`${PENDING_PREFIX}${code}`, PENDING_TTL, JSON.stringify(data));
  }
}

export async function getPendingConnection(code: string): Promise<PendingConnection | null> {
  const client = getRedisClient();
  if (client) {
    const data = await client.get<string>(`${PENDING_PREFIX}${code}`);
    if (data) {
      return typeof data === 'string' ? JSON.parse(data) : data;
    }
  }
  return null;
}

export async function deletePendingConnection(code: string): Promise<void> {
  const client = getRedisClient();
  if (client) {
    await client.del(`${PENDING_PREFIX}${code}`);
  }
}

export function isRedisAvailable(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN && redisClient !== null);
}

// Test Redis connection
export async function testRedisConnection(): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;
  
  try {
    await client.ping();
    console.log("[Redis] Connection test successful");
    return true;
  } catch (error: any) {
    console.error("[Redis] Connection test failed:", error.message);
    return false;
  }
}
