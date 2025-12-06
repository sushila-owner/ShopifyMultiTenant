import type { InsertProduct } from "@shared/schema";

// GigaCloud Open API 2.0 Types
interface GigaCloudProduct {
  productId: string;
  productName: string;
  productDescription?: string;
  sku: string;
  price: number;
  msrp?: number;
  category?: string;
  brand?: string;
  images?: { url: string; isPrimary?: boolean }[];
  inventory?: number;
  weight?: number;
  dimensions?: {
    length: number;
    width: number;
    height: number;
  };
  variants?: GigaCloudVariant[];
}

interface GigaCloudVariant {
  variantId: string;
  sku: string;
  name: string;
  price: number;
  inventory: number;
  attributes?: Record<string, string>;
}

interface GigaCloudAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface GigaCloudProductsResponse {
  code: number;
  message: string;
  data: {
    list: GigaCloudProduct[];
    total: number;
    pageNo: number;
    pageSize: number;
  };
}

export interface GigaB2BSyncProgress {
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

export class GigaB2BService {
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private baseUrl: string = "https://openapi.gigacloudtech.com/v2";
  
  private syncProgress: GigaB2BSyncProgress = {
    status: "idle",
    totalProducts: 0,
    fetchedProducts: 0,
    savedProducts: 0,
    createdProducts: 0,
    updatedProducts: 0,
    errors: 0,
    currentPage: 0,
  };

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  private async authenticate(): Promise<void> {
    if (this.accessToken && this.tokenExpiresAt && new Date() < this.tokenExpiresAt) {
      return;
    }

    const response = await fetch(`${this.baseUrl}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GigaB2B authentication failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as GigaCloudAuthResponse;
    this.accessToken = data.access_token;
    this.tokenExpiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000);
  }

  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    await this.authenticate();

    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        "Authorization": `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GigaB2B API error: ${response.status} - ${errorText}`);
    }

    return await response.json() as T;
  }

  async testConnection(): Promise<{ success: boolean; accountName?: string; error?: string }> {
    try {
      await this.authenticate();
      const data = await this.fetch<{ account: { name: string } }>("/account");
      return { success: true, accountName: data.account?.name || "GigaB2B Account" };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getProductCount(): Promise<number> {
    try {
      const data = await this.fetch<{ count: number }>("/products/count");
      return data.count;
    } catch {
      return 0;
    }
  }

  async getProducts(page: number = 1, limit: number = 100): Promise<GigaCloudProductsResponse> {
    return await this.fetch<GigaCloudProductsResponse>(`/product/list?pageNo=${page}&pageSize=${limit}`);
  }

  getSyncProgress(): GigaB2BSyncProgress {
    return { ...this.syncProgress };
  }

  async syncAllProducts(
    supplierId: number,
    batchSaveCallback: (products: InsertProduct[]) => Promise<{ created: number; updated: number }>
  ): Promise<GigaB2BSyncProgress> {
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
      const productCount = await this.getProductCount();
      this.syncProgress.totalProducts = productCount;
      console.log(`[GigaB2B] Starting sync of ${productCount} products...`);

      const limit = 100;
      const totalPages = Math.ceil(productCount / limit);
      let page = 1;

      while (page <= totalPages && this.syncProgress.status === "running") {
        this.syncProgress.currentPage = page;
        console.log(`[GigaB2B] Fetching page ${page}/${totalPages}...`);

        try {
          const response = await this.getProducts(page, limit);
          const products = response.data?.list || [];
          
          if (products.length === 0) break;

          this.syncProgress.fetchedProducts += products.length;

          const productsToSave: InsertProduct[] = products.map(product => 
            this.transformProduct(product, supplierId)
          );

          const result = await batchSaveCallback(productsToSave);
          this.syncProgress.savedProducts += productsToSave.length;
          this.syncProgress.createdProducts += result.created;
          this.syncProgress.updatedProducts += result.updated;

          console.log(`[GigaB2B] Page ${page}: saved ${productsToSave.length} products (${result.created} new, ${result.updated} updated)`);
          
          page++;
          
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (pageError: any) {
          console.error(`[GigaB2B] Error on page ${page}:`, pageError.message);
          this.syncProgress.errors++;
          page++;
        }
      }

      this.syncProgress.status = "completed";
      this.syncProgress.completedAt = new Date();
      console.log(`[GigaB2B] Sync completed: ${this.syncProgress.savedProducts} products saved`);

    } catch (error: any) {
      console.error("[GigaB2B] Sync error:", error.message);
      this.syncProgress.status = "error";
      this.syncProgress.errorMessage = error.message;
      this.syncProgress.completedAt = new Date();
    }

    return this.syncProgress;
  }

  private transformProduct(product: GigaCloudProduct, supplierId: number): InsertProduct {
    const images = (product.images || []).map((img, index) => ({
      url: img.url,
      alt: product.productName,
      position: index,
    }));

    const variants = product.variants?.map(v => ({
      id: v.variantId,
      title: v.name,
      inventoryQuantity: v.inventory,
      sku: v.sku,
      price: v.price,
      cost: v.price * 0.7,
      options: v.attributes,
    })) || null;

    return {
      supplierId,
      supplierProductId: product.productId,
      supplierSku: product.sku || `GC-${product.productId}`,
      title: product.productName,
      description: product.productDescription || "",
      supplierPrice: product.price,
      category: product.category || "General",
      inventoryQuantity: product.inventory || 0,
      images,
      variants,
      isGlobal: true,
      status: "active",
    };
  }
}

let gigab2bServiceInstance: GigaB2BService | null = null;

export function getGigaB2BService(): GigaB2BService | null {
  if (gigab2bServiceInstance) return gigab2bServiceInstance;

  const clientId = process.env.GIGAB2B_CLIENT_ID;
  const clientSecret = process.env.GIGAB2B_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.log("[GigaB2B] Missing credentials - service not available");
    return null;
  }

  gigab2bServiceInstance = new GigaB2BService(clientId, clientSecret);
  return gigab2bServiceInstance;
}
