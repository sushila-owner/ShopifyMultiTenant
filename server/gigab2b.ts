import type { InsertProduct } from "@shared/schema";
import crypto from "crypto";

interface GigaCloudProduct {
  sku: string;
  productName: string;
  productDescription?: string;
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
}

interface GigaCloudProductsResponse {
  code: number;
  message: string;
  data: {
    list: GigaCloudProduct[];
    total: number;
    page: number;
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
  private baseUrl: string = "https://www.gigab2b.com/openApi";
  
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

  private sign(params: Record<string, string>): string {
    const sortedStr = Object.keys(params)
      .sort()
      .map(k => `${k}=${params[k]}`)
      .join("&");
    
    return crypto
      .createHmac("sha256", this.clientSecret)
      .update(sortedStr)
      .digest("hex");
  }

  private async request<T>(path: string, additionalParams: Record<string, string> = {}): Promise<T> {
    const baseParams: Record<string, string> = {
      clientId: this.clientId,
      timestamp: String(Date.now()),
      ...additionalParams,
    };

    baseParams.sign = this.sign(baseParams);

    const queryString = new URLSearchParams(baseParams).toString();
    const url = `${this.baseUrl}${path}?${queryString}`;

    console.log(`[GigaB2B] Request: ${path}`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GigaB2B API error: ${response.status} - ${errorText}`);
    }

    return await response.json() as T;
  }

  async testConnection(): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const data = await this.request<{ code: number; message: string; data?: any }>("/product/list", {
        page: "1",
        pageSize: "1"
      });
      
      if (data.code === 0 || data.code === 200) {
        return { 
          success: true, 
          message: `Connected successfully. ${data.data?.total || 0} products available.`
        };
      } else {
        return { success: false, error: `API returned code ${data.code}: ${data.message}` };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getProductCount(): Promise<number> {
    try {
      const data = await this.request<GigaCloudProductsResponse>("/product/list", {
        page: "1",
        pageSize: "1"
      });
      return data.data?.total || 0;
    } catch {
      return 0;
    }
  }

  async getProducts(page: number = 1, pageSize: number = 50): Promise<GigaCloudProductsResponse> {
    return await this.request<GigaCloudProductsResponse>("/product/list", {
      page: String(page),
      pageSize: String(pageSize)
    });
  }

  async getProductDetail(sku: string): Promise<any> {
    return await this.request("/product/detail", { sku });
  }

  async getInventory(sku: string): Promise<any> {
    return await this.request("/product/inventory", { sku });
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

      const pageSize = 50;
      const totalPages = Math.ceil(productCount / pageSize);
      let page = 1;

      while (page <= totalPages && this.syncProgress.status === "running") {
        this.syncProgress.currentPage = page;
        console.log(`[GigaB2B] Fetching page ${page}/${totalPages}...`);

        try {
          const response = await this.getProducts(page, pageSize);
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
          
          await new Promise(resolve => setTimeout(resolve, 300));
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

    return {
      supplierId,
      supplierProductId: product.sku,
      supplierSku: product.sku,
      title: product.productName,
      description: product.productDescription || "",
      supplierPrice: product.price,
      category: product.category || "General",
      inventoryQuantity: product.inventory || 0,
      images,
      variants: null,
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
