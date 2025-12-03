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

  private async fetch<T>(endpoint: string): Promise<T> {
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

    return response.json() as T;
  }

  async testConnection(): Promise<{ success: boolean; shopName?: string; error?: string }> {
    try {
      const response = await this.fetch<{ shop: { name: string; domain: string } }>("/shop.json");
      return { success: true, shopName: response.shop.name };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getProducts(limit: number = 250): Promise<ShopifyProduct[]> {
    const allProducts: ShopifyProduct[] = [];
    let pageInfo: string | null = null;
    
    do {
      const endpoint = pageInfo 
        ? `/products.json?limit=${limit}&page_info=${pageInfo}`
        : `/products.json?limit=${limit}`;
      
      const response = await this.fetch<ShopifyProductsResponse>(endpoint);
      allProducts.push(...response.products);
      
      pageInfo = null;
    } while (pageInfo);

    return allProducts;
  }

  async getProductCount(): Promise<number> {
    const response = await this.fetch<{ count: number }>("/products/count.json");
    return response.count;
  }

  transformToProduct(shopifyProduct: ShopifyProduct, supplierId: number): InsertProduct {
    const primaryVariant = shopifyProduct.variants[0];
    const supplierPriceDollars = parseFloat(primaryVariant?.price || "0");
    const supplierPriceCents = Math.round(supplierPriceDollars * 100);
    
    const images = shopifyProduct.images.map((img) => ({
      url: img.src,
      alt: img.alt || shopifyProduct.title,
      position: img.position,
    }));

    const variants = shopifyProduct.variants.map((v) => ({
      id: v.id.toString(),
      title: v.title,
      price: Math.round(parseFloat(v.price) * 100),
      sku: v.sku || "",
      inventoryQuantity: v.inventory_quantity,
      compareAtPrice: v.compare_at_price ? Math.round(parseFloat(v.compare_at_price) * 100) : null,
      option1: v.option1,
      option2: v.option2,
      option3: v.option3,
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
      supplierPrice: supplierPriceCents,
      merchantPrice: supplierPriceCents,
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
