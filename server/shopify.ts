import type { InsertProduct } from "@shared/schema";

interface ShopifyProduct {
  id: number;
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  tags: string;
  status: string;
  variants: ShopifyVariant[];
  images: ShopifyImage[];
  created_at: string;
  updated_at: string;
}

interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  price: string;
  sku: string;
  inventory_quantity: number;
  compare_at_price: string | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
}

interface ShopifyImage {
  id: number;
  product_id: number;
  src: string;
  alt: string | null;
  position: number;
}

interface ShopifyProductsResponse {
  products: ShopifyProduct[];
}

export class ShopifyService {
  private storeUrl: string;
  private accessToken: string;
  private apiVersion: string = "2024-01";

  constructor(storeUrl: string, accessToken: string) {
    this.storeUrl = storeUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
    this.accessToken = accessToken;
  }

  private async fetch<T>(endpoint: string): Promise<{ data: T; linkHeader: string | null }> {
    const url = `https://${this.storeUrl}/admin/api/${this.apiVersion}${endpoint}`;
    
    const response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": this.accessToken,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shopify API error: ${response.status} - ${errorText}`);
    }

    const linkHeader = response.headers.get("Link");
    const data = await response.json() as T;
    
    return { data, linkHeader };
  }

  private parseNextPageInfo(linkHeader: string | null): string | null {
    if (!linkHeader) return null;
    
    // Parse Link header to find next page
    // Format: <url>; rel="next", <url>; rel="previous"
    const links = linkHeader.split(",");
    for (const link of links) {
      if (link.includes('rel="next"')) {
        const match = link.match(/page_info=([^>&]*)/);
        if (match) {
          return match[1];
        }
      }
    }
    return null;
  }

  async testConnection(): Promise<{ success: boolean; shopName?: string; error?: string }> {
    try {
      const { data } = await this.fetch<{ shop: { name: string; domain: string } }>("/shop.json");
      return { success: true, shopName: data.shop.name };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getProducts(limit: number = 250, onProgress?: (count: number, total?: number) => void): Promise<ShopifyProduct[]> {
    const allProducts: ShopifyProduct[] = [];
    let pageInfo: string | null = null;
    let pageCount = 0;
    
    // Get total count first for progress reporting
    let totalCount: number | undefined;
    try {
      totalCount = await this.getProductCount();
      console.log(`[Shopify] Starting sync of ${totalCount} products...`);
    } catch (e) {
      console.log(`[Shopify] Could not get product count, syncing without progress...`);
    }
    
    do {
      const endpoint = pageInfo 
        ? `/products.json?limit=${limit}&page_info=${pageInfo}`
        : `/products.json?limit=${limit}`;
      
      const { data, linkHeader } = await this.fetch<ShopifyProductsResponse>(endpoint);
      allProducts.push(...data.products);
      pageCount++;
      
      // Report progress
      if (onProgress) {
        onProgress(allProducts.length, totalCount);
      }
      console.log(`[Shopify] Fetched page ${pageCount}: ${allProducts.length}${totalCount ? ` / ${totalCount}` : ''} products`);
      
      // Get next page info from Link header
      pageInfo = this.parseNextPageInfo(linkHeader);
      
      // Rate limiting: Shopify allows 2 requests per second for REST API
      if (pageInfo) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } while (pageInfo);

    console.log(`[Shopify] Sync complete: ${allProducts.length} products fetched`);
    return allProducts;
  }

  async getProductCount(): Promise<number> {
    const { data } = await this.fetch<{ count: number }>("/products/count.json");
    return data.count;
  }

  transformToProduct(shopifyProduct: ShopifyProduct, supplierId: number): InsertProduct {
    const primaryVariant = shopifyProduct.variants[0];
    const supplierPrice = parseFloat(primaryVariant?.price || "0");
    
    const images = shopifyProduct.images.map((img) => ({
      url: img.src,
      alt: img.alt || shopifyProduct.title,
      position: img.position,
    }));

    const variants = shopifyProduct.variants.map((v) => ({
      id: v.id.toString(),
      title: v.title,
      price: parseFloat(v.price),
      cost: 0, // Cost will be set by supplier or calculated
      sku: v.sku || "",
      inventoryQuantity: v.inventory_quantity,
      compareAtPrice: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
    }));

    const tags = shopifyProduct.tags
      ? shopifyProduct.tags.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

    return {
      supplierId,
      title: shopifyProduct.title,
      description: shopifyProduct.body_html || "",
      category: shopifyProduct.product_type || "Uncategorized",
      tags,
      images,
      variants,
      supplierProductId: shopifyProduct.id.toString(),
      supplierSku: primaryVariant?.sku || "",
      supplierPrice,
      merchantPrice: supplierPrice,
      inventoryQuantity: primaryVariant?.inventory_quantity || 0,
      lowStockThreshold: 10,
      trackInventory: true,
      status: shopifyProduct.status === "active" ? "active" : "draft",
      isGlobal: true,
      syncStatus: "synced",
      lastSyncedAt: new Date(),
    };
  }
}

export function getShopifyService(): ShopifyService | null {
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!storeUrl || !accessToken) {
    return null;
  }

  return new ShopifyService(storeUrl, accessToken);
}
