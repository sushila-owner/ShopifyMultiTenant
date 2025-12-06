import { SupplierAdapter, SupplierCredentials, ShopifyCredentials, GigaB2BCredentials, WooCommerceCredentials, CustomApiCredentials } from "./types";
import { ShopifyAdapter } from "./shopifyAdapter";
import { GigaB2BAdapter } from "./gigab2bAdapter";
import { WooCommerceAdapter } from "./woocommerceAdapter";
import { CustomApiAdapter } from "./customApiAdapter";

export type SupplierType = "shopify" | "gigab2b" | "woocommerce" | "custom" | "amazon";

export function createSupplierAdapter(
  type: SupplierType,
  credentials: SupplierCredentials
): SupplierAdapter {
  switch (type) {
    case "shopify":
      return new ShopifyAdapter(credentials as ShopifyCredentials);
    case "gigab2b":
      return new GigaB2BAdapter(credentials as GigaB2BCredentials);
    case "woocommerce":
      return new WooCommerceAdapter(credentials as WooCommerceCredentials);
    case "custom":
    case "amazon":
      return new CustomApiAdapter(credentials as CustomApiCredentials);
    default:
      throw new Error(`Unsupported supplier type: ${type}`);
  }
}

export function getRequiredCredentialFields(type: SupplierType): string[] {
  switch (type) {
    case "shopify":
      return ["storeDomain", "accessToken"];
    case "gigab2b":
      return ["baseUrl", "clientId", "clientSecret"];
    case "woocommerce":
      return ["storeUrl", "consumerKey", "consumerSecret"];
    case "custom":
    case "amazon":
      return ["baseUrl"];
    default:
      return [];
  }
}

export function validateCredentials(
  type: SupplierType,
  credentials: SupplierCredentials
): { valid: boolean; missingFields: string[] } {
  const requiredFields = getRequiredCredentialFields(type);
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    if (!(credentials as any)[field]) {
      missingFields.push(field);
    }
  }

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}

export function getCredentialFieldLabels(type: SupplierType): Record<string, { label: string; placeholder: string; type: "text" | "password" }> {
  switch (type) {
    case "shopify":
      return {
        storeDomain: { label: "Store Domain", placeholder: "yourstore.myshopify.com", type: "text" },
        accessToken: { label: "Admin API Access Token", placeholder: "shpat_xxxxx", type: "password" },
      };
    case "gigab2b":
      return {
        baseUrl: { label: "API Base URL", placeholder: "https://api.gigab2b.com", type: "text" },
        clientId: { label: "Client ID", placeholder: "Your client ID", type: "text" },
        clientSecret: { label: "Client Secret", placeholder: "Your client secret", type: "password" },
      };
    case "woocommerce":
      return {
        storeUrl: { label: "Store URL", placeholder: "https://yourstore.com", type: "text" },
        consumerKey: { label: "Consumer Key", placeholder: "ck_xxxxx", type: "text" },
        consumerSecret: { label: "Consumer Secret", placeholder: "cs_xxxxx", type: "password" },
      };
    case "custom":
    case "amazon":
      return {
        baseUrl: { label: "API Base URL", placeholder: "https://api.example.com", type: "text" },
        apiKey: { label: "API Key (optional)", placeholder: "Your API key", type: "password" },
        apiToken: { label: "Bearer Token (optional)", placeholder: "Your bearer token", type: "password" },
      };
    default:
      return {};
  }
}

export * from "./types";
export { ShopifyAdapter } from "./shopifyAdapter";
export { GigaB2BAdapter } from "./gigab2bAdapter";
export { WooCommerceAdapter } from "./woocommerceAdapter";
export { CustomApiAdapter } from "./customApiAdapter";
