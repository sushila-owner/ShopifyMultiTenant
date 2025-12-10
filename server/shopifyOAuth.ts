import crypto from "crypto";

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;

const SCOPES = [
  "read_products",
  "write_products",
  "read_orders",
  "write_orders",
  "read_customers",
  "read_inventory",
  "write_inventory",
  "read_fulfillments",
  "write_fulfillments",
].join(",");

export interface ShopifyOAuthConfig {
  apiKey: string;
  apiSecret: string;
  scopes: string;
  redirectUri: string;
}

export interface ShopifyAccessTokenResponse {
  access_token: string;
  scope: string;
}

export interface ShopifyShopInfo {
  shop: {
    id: number;
    name: string;
    email: string;
    domain: string;
    myshopify_domain: string;
    created_at: string;
    updated_at: string;
    country_name: string;
    currency: string;
    timezone: string;
    plan_name: string;
  };
}

export function isShopifyConfigured(): boolean {
  return !!(SHOPIFY_API_KEY && SHOPIFY_API_SECRET);
}

export function getShopifyConfig(appUrl: string): ShopifyOAuthConfig | null {
  if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET) {
    return null;
  }
  
  return {
    apiKey: SHOPIFY_API_KEY,
    apiSecret: SHOPIFY_API_SECRET,
    scopes: SCOPES,
    redirectUri: `${appUrl}/api/shopify/oauth/callback`,
  };
}

export function validateHmac(query: Record<string, string>, secret: string): boolean {
  const hmac = query.hmac;
  if (!hmac) return false;

  const params = { ...query };
  delete params.hmac;
  delete params.signature;

  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  const calculatedHmac = crypto
    .createHmac("sha256", secret)
    .update(sortedParams)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(hmac),
    Buffer.from(calculatedHmac)
  );
}

export function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function buildInstallUrl(shop: string, config: ShopifyOAuthConfig, nonce: string): string {
  const shopDomain = shop.includes(".myshopify.com") ? shop : `${shop}.myshopify.com`;
  
  const params = new URLSearchParams({
    client_id: config.apiKey,
    scope: config.scopes,
    redirect_uri: config.redirectUri,
    state: nonce,
  });

  return `https://${shopDomain}/admin/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(
  shop: string,
  code: string,
  config: ShopifyOAuthConfig
): Promise<ShopifyAccessTokenResponse> {
  const shopDomain = shop.includes(".myshopify.com") ? shop : `${shop}.myshopify.com`;
  
  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: config.apiKey,
      client_secret: config.apiSecret,
      code,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to exchange code for token: ${response.status} - ${errorText}`);
  }

  return response.json();
}

export async function getShopInfo(shop: string, accessToken: string): Promise<ShopifyShopInfo> {
  const shopDomain = shop.includes(".myshopify.com") ? shop : `${shop}.myshopify.com`;
  
  const response = await fetch(`https://${shopDomain}/admin/api/2024-01/shop.json`, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get shop info: ${response.status} - ${errorText}`);
  }

  return response.json();
}

export function validateShopDomain(shop: string): boolean {
  const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/;
  const normalizedShop = shop.includes(".myshopify.com") ? shop : `${shop}.myshopify.com`;
  return shopRegex.test(normalizedShop);
}
