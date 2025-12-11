import { Redis } from "@upstash/redis";

let redisClient: Redis | null = null;

export function getRedisClient(): Redis | null {
  let url = process.env.UPSTASH_REDIS_REST_URL;
  let token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.log("[Redis] No Upstash REST credentials configured, using in-memory storage");
    return null;
  }

  // Auto-detect if values are swapped (URL should start with https://, token should not)
  if (!url.startsWith("https://") && token.startsWith("https://")) {
    console.log("[Redis] Detected swapped URL/Token values, auto-correcting...");
    [url, token] = [token, url];
  }

  if (!redisClient) {
    console.log("[Redis] Connecting to Upstash Redis (REST API)...");
    redisClient = new Redis({
      url,
      token,
    });
    console.log("[Redis] Upstash Redis client initialized");
  }

  return redisClient;
}

const NONCE_PREFIX = "shopify_nonce:";
const PENDING_PREFIX = "shopify_pending:";
const AUTH_CODE_PREFIX = "auth_code:";
const NONCE_TTL = 600; // 10 minutes
const PENDING_TTL = 300; // 5 minutes
const AUTH_CODE_TTL = 300; // 5 minutes for auth codes (strict)

export interface OAuthNonce {
  shop: string;
  merchantId: number | null;
  isAppStoreInstall?: boolean;
  timestamp: number;
}

export interface PendingConnection {
  domain: string;
  accessToken: string;
  scopes: string[];
  shopName: string;
  shopEmail?: string;
  merchantId: number | null;
  isAppStoreInstall?: boolean;
  timestamp: number;
}

// Auth code for secure auto-login after Shopify App Store install
export interface AuthCode {
  shop: string;
  merchantId: number;
  userId: number;
  userRole: string;
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

// ==================== AUTH CODE STORAGE (Dedicated with strict 5-min TTL) ====================
// In-memory fallback for auth codes with automatic cleanup
const authCodeStore = new Map<string, { data: AuthCode; expiresAt: number }>();

// Cleanup expired auth codes every 30 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of authCodeStore) {
    if (now > value.expiresAt) {
      authCodeStore.delete(key);
    }
  }
}, 30000);

export async function setAuthCode(code: string, data: AuthCode): Promise<void> {
  const client = getRedisClient();
  if (client) {
    try {
      await client.setex(`${AUTH_CODE_PREFIX}${code}`, AUTH_CODE_TTL, JSON.stringify(data));
      return;
    } catch (error) {
      console.error("[Redis] Failed to set auth code, falling back to memory:", error);
    }
  }
  // In-memory fallback with strict 5-minute expiry
  authCodeStore.set(code, {
    data,
    expiresAt: Date.now() + AUTH_CODE_TTL * 1000,
  });
}

// Result type for auth code operations that need to track Redis availability
export interface AuthCodeResult<T> {
  success: boolean;
  data?: T;
  usedRedis: boolean;
  error?: string;
}

export async function getAuthCode(code: string): Promise<AuthCodeResult<AuthCode>> {
  const client = getRedisClient();
  
  // Try Redis first if available
  if (client) {
    try {
      const data = await client.get<string>(`${AUTH_CODE_PREFIX}${code}`);
      if (data) {
        const parsed = typeof data === "string" ? JSON.parse(data) : data;
        return { success: true, data: parsed, usedRedis: true };
      }
      // Code not found in Redis
      return { success: true, data: undefined, usedRedis: true };
    } catch (error: any) {
      console.error("[Redis] Failed to get auth code - ABORTING (no fallback for security):", error);
      // DO NOT fall back to memory when Redis fails - this prevents false negatives
      return { success: false, usedRedis: true, error: error.message };
    }
  }
  
  // No Redis configured - use in-memory only
  const entry = authCodeStore.get(code);
  if (entry && Date.now() < entry.expiresAt) {
    return { success: true, data: entry.data, usedRedis: false };
  }
  return { success: true, data: undefined, usedRedis: false };
}

export async function deleteAuthCode(code: string): Promise<AuthCodeResult<boolean>> {
  const client = getRedisClient();
  
  // Try Redis first if available
  if (client) {
    try {
      const result = await client.del(`${AUTH_CODE_PREFIX}${code}`);
      // Also delete from memory just in case
      authCodeStore.delete(code);
      return { success: true, data: result > 0, usedRedis: true };
    } catch (error: any) {
      console.error("[Redis] Failed to delete auth code - ABORTING:", error);
      // DO NOT fall back to memory-only delete when Redis fails
      return { success: false, usedRedis: true, error: error.message };
    }
  }
  
  // No Redis configured - use in-memory only
  const existed = authCodeStore.has(code);
  authCodeStore.delete(code);
  return { success: true, data: existed, usedRedis: false };
}

// Verify auth code was actually deleted (for replay protection)
export async function verifyAuthCodeDeleted(code: string): Promise<AuthCodeResult<boolean>> {
  const result = await getAuthCode(code);
  if (!result.success) {
    // Redis error - cannot verify
    return { success: false, usedRedis: result.usedRedis, error: result.error };
  }
  return { success: true, data: result.data === undefined, usedRedis: result.usedRedis };
}
