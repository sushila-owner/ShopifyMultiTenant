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

export interface SyncProgress {
  status: "idle" | "running" | "completed" | "error";
  totalProducts: number;
  fetchedProducts: number;
  savedProducts: number;
  createdProducts: number;
  updatedProducts: number;
  errors: number;
  currentPage: number;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
}

export class ShopifyService {
  private storeUrl: string;
  private accessToken: string;
  private apiVersion: string = "2024-01";
  
  private syncProgress: SyncProgress = {
    status: "idle",
    totalProducts: 0,
    fetchedProducts: 0,
    savedProducts: 0,
    createdProducts: 0,
    updatedProducts: 0,
    errors: 0,
    currentPage: 0,
  };

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

  async getProductCount(): Promise<number> {
    const { data } = await this.fetch<{ count: number }>("/products/count.json");
    return data.count;
  }

  getSyncProgress(): SyncProgress {
    return { ...this.syncProgress };
  }

  async syncProductsStreaming(
    supplierId: number,
    existingProductIds: Set<string>,
    onSaveProduct: (product: InsertProduct, isUpdate: boolean) => Promise<void>,
    onProgress?: (progress: SyncProgress) => void
  ): Promise<SyncProgress> {
    this.syncProgress = {
      status: "running",
      totalProducts: 0,
      fetchedProducts: 0,
      savedProducts: 0,
      createdProducts: 0,
      updatedProducts: 0,
      errors: 0,
      currentPage: 0,
      startedAt: new Date(),
    };

    try {
      // Get total count first
      try {
        this.syncProgress.totalProducts = await this.getProductCount();
        console.log(`[Shopify] Starting streaming sync of ${this.syncProgress.totalProducts} products...`);
      } catch (e) {
        console.log(`[Shopify] Could not get product count, syncing without total...`);
      }

      let pageInfo: string | null = null;
      const limit = 250;

      do {
        const endpoint = pageInfo 
          ? `/products.json?limit=${limit}&page_info=${pageInfo}`
          : `/products.json?limit=${limit}`;
        
        const { data, linkHeader } = await this.fetch<ShopifyProductsResponse>(endpoint);
        this.syncProgress.currentPage++;
        this.syncProgress.fetchedProducts += data.products.length;
        
        console.log(`[Shopify] Page ${this.syncProgress.currentPage}: Fetched ${data.products.length} products (${this.syncProgress.fetchedProducts}/${this.syncProgress.totalProducts || '?'})`);

        // Process and save each product immediately
        for (const shopifyProduct of data.products) {
          try {
            const productData = this.transformToProduct(shopifyProduct, supplierId);
            const shopifyId = shopifyProduct.id.toString();
            const isUpdate = existingProductIds.has(shopifyId);
            
            await onSaveProduct(productData, isUpdate);
            
            this.syncProgress.savedProducts++;
            if (isUpdate) {
              this.syncProgress.updatedProducts++;
            } else {
              this.syncProgress.createdProducts++;
              existingProductIds.add(shopifyId);
            }
          } catch (err: any) {
            console.error(`[Shopify] Error saving product ${shopifyProduct.id}:`, err.message);
            this.syncProgress.errors++;
          }
        }

        // Report progress after each page
        if (onProgress) {
          onProgress({ ...this.syncProgress });
        }

        console.log(`[Shopify] Page ${this.syncProgress.currentPage}: Saved ${this.syncProgress.savedProducts} products, ${this.syncProgress.errors} errors`);

        // Get next page
        pageInfo = this.parseNextPageInfo(linkHeader);
        
        // Rate limiting: Shopify allows 2 requests per second
        if (pageInfo) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } while (pageInfo);

      this.syncProgress.status = "completed";
      this.syncProgress.completedAt = new Date();
      
      const duration = this.syncProgress.completedAt.getTime() - this.syncProgress.startedAt!.getTime();
      console.log(`[Shopify] Sync complete in ${Math.round(duration / 1000)}s: ${this.syncProgress.savedProducts} saved, ${this.syncProgress.createdProducts} created, ${this.syncProgress.updatedProducts} updated, ${this.syncProgress.errors} errors`);

    } catch (error: any) {
      this.syncProgress.status = "error";
      this.syncProgress.errorMessage = error.message;
      this.syncProgress.completedAt = new Date();
      console.error(`[Shopify] Sync failed:`, error.message);
    }

    if (onProgress) {
      onProgress({ ...this.syncProgress });
    }

    return this.syncProgress;
  }

  async syncProductsBatch(
    supplierId: number,
    existingProductMap: Map<string, number>,
    onSaveBatch: (products: InsertProduct[]) => Promise<{ created: number; updated: number; errors: number }>,
    onProgress?: (progress: SyncProgress) => void
  ): Promise<SyncProgress> {
    this.syncProgress = {
      status: "running",
      totalProducts: 0,
      fetchedProducts: 0,
      savedProducts: 0,
      createdProducts: 0,
      updatedProducts: 0,
      errors: 0,
      currentPage: 0,
      startedAt: new Date(),
    };

    try {
      // Get total count first
      try {
        this.syncProgress.totalProducts = await this.getProductCount();
        console.log(`[Shopify] Starting BATCH sync of ${this.syncProgress.totalProducts} products...`);
      } catch (e) {
        console.log(`[Shopify] Could not get product count, syncing without total...`);
      }

      let pageInfo: string | null = null;
      const limit = 250;

      do {
        const endpoint = pageInfo 
          ? `/products.json?limit=${limit}&page_info=${pageInfo}`
          : `/products.json?limit=${limit}`;
        
        const { data, linkHeader } = await this.fetch<ShopifyProductsResponse>(endpoint);
        this.syncProgress.currentPage++;
        this.syncProgress.fetchedProducts += data.products.length;
        
        console.log(`[Shopify] Page ${this.syncProgress.currentPage}: Fetched ${data.products.length} products (${this.syncProgress.fetchedProducts}/${this.syncProgress.totalProducts || '?'})`);

        // Transform all products in this page
        const productsToSave: InsertProduct[] = [];
        for (const shopifyProduct of data.products) {
          const productData = this.transformToProduct(shopifyProduct, supplierId);
          productsToSave.push(productData);
        }

        // Batch save entire page at once
        try {
          const result = await onSaveBatch(productsToSave);
          this.syncProgress.savedProducts += result.created + result.updated;
          this.syncProgress.createdProducts += result.created;
          this.syncProgress.updatedProducts += result.updated;
          this.syncProgress.errors += result.errors;
        } catch (err: any) {
          console.error(`[Shopify] Batch save failed for page ${this.syncProgress.currentPage}:`, err.message);
          this.syncProgress.errors += data.products.length;
        }

        // Report progress after each page
        if (onProgress) {
          onProgress({ ...this.syncProgress });
        }

        console.log(`[Shopify] Page ${this.syncProgress.currentPage}: Saved ${this.syncProgress.savedProducts} products total (${this.syncProgress.createdProducts} new, ${this.syncProgress.updatedProducts} updated, ${this.syncProgress.errors} errors)`);

        // Get next page
        pageInfo = this.parseNextPageInfo(linkHeader);
        
        // Rate limiting: Shopify allows 2 requests per second
        if (pageInfo) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } while (pageInfo);

      this.syncProgress.status = "completed";
      this.syncProgress.completedAt = new Date();
      
      const duration = this.syncProgress.completedAt.getTime() - this.syncProgress.startedAt!.getTime();
      console.log(`[Shopify] BATCH Sync complete in ${Math.round(duration / 1000)}s: ${this.syncProgress.savedProducts} saved, ${this.syncProgress.createdProducts} created, ${this.syncProgress.updatedProducts} updated, ${this.syncProgress.errors} errors`);

    } catch (error: any) {
      this.syncProgress.status = "error";
      this.syncProgress.errorMessage = error.message;
      this.syncProgress.completedAt = new Date();
      console.error(`[Shopify] Sync failed:`, error.message);
    }

    if (onProgress) {
      onProgress({ ...this.syncProgress });
    }

    return this.syncProgress;
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
      cost: 0,
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

// Global sync state for background processing
let activeSyncProgress: SyncProgress | null = null;
let shopifyServiceInstance: ShopifyService | null = null;

export function getShopifyService(): ShopifyService | null {
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!storeUrl || !accessToken) {
    return null;
  }

  if (!shopifyServiceInstance) {
    shopifyServiceInstance = new ShopifyService(storeUrl, accessToken);
  }
  return shopifyServiceInstance;
}

export function getActiveSyncProgress(): SyncProgress | null {
  if (shopifyServiceInstance) {
    return shopifyServiceInstance.getSyncProgress();
  }
  return activeSyncProgress;
}

export function setActiveSyncProgress(progress: SyncProgress): void {
  activeSyncProgress = progress;
}
