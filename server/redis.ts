import Redis from "ioredis";

let redisClient: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (!process.env.REDIS_URL) {
    console.log("[Redis] No REDIS_URL configured, using in-memory storage");
    return null;
  }

  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    redisClient.on("connect", () => {
      console.log("[Redis] Connected successfully");
    });

    redisClient.on("error", (err) => {
      console.error("[Redis] Connection error:", err.message);
    });
  }

  return redisClient;
}

export async function connectRedis(): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await client.connect();
    return true;
  } catch (error: any) {
    console.error("[Redis] Failed to connect:", error.message);
    return false;
  }
}

const NONCE_PREFIX = "shopify_nonce:";
const PENDING_PREFIX = "shopify_pending:";
const NONCE_TTL = 600;
const PENDING_TTL = 300;

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
    const data = await client.get(`${NONCE_PREFIX}${nonce}`);
    return data ? JSON.parse(data) : null;
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
    const data = await client.get(`${PENDING_PREFIX}${code}`);
    return data ? JSON.parse(data) : null;
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
  return !!process.env.REDIS_URL && redisClient !== null;
}
