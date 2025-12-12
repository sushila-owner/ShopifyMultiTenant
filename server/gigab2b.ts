import type { InsertProduct } from "@shared/schema";
import crypto from "crypto";

interface GigaB2BProductSku {
  sku: string;
  productName?: string;
  updateTime: string;
  firstArrivalDate: string;
}

interface GigaB2BProductListResponse {
  success: boolean;
  code: string;
  data: {
    pageInfo: {
      page: number;
      totalPage: number;
      pageSize: number;
      totalNum: number;
    };
    records: GigaB2BProductSku[];
  };
  requestId: string;
  msg: string;
}

interface GigaB2BPriceData {
  sku: string;
  currency: string;
  price: number;
  shippingFee?: number;
  shippingFeeRange?: {
    minAmount: number;
    maxAmount: number;
  };
  exclusivePrice?: number;
  discountedPrice?: number;
  promotionFrom?: string;
  promotionTo?: string;
  mapPrice?: number;
  sellerInfo?: {
    sellerStore: string;
    sellerType: string;
    gigaIndex: string;
    sellerCode: string;
  };
  spotPrice?: Array<{
    minQuantity: number;
    maxQuantity: number;
    price: number;
    discountedSpotPrice?: number;
  }>;
  skuAvailable: boolean;
}

interface GigaB2BPriceResponse {
  success: boolean;
  code: string;
  data: GigaB2BPriceData[];
  requestId: string;
  msg: string;
}

interface GigaB2BOrderSyncResponse {
  success: boolean;
  code: string;
  data: null;
  requestId: string;
  msg: string;
  subMsg?: string;
}

interface GigaB2BTrackingResponse {
  success: boolean;
  code: string;
  data: Array<{
    orderNo: string;
    shipTrackInfo: Array<{
      sku: string;
      skuQty: number;
      isCombo: boolean;
      comboSku?: string;
      trackingNum: string;
      carrierName: string;
    }>;
    returnTrackInfo: any[];
  }>;
  requestId: string;
  msg: string;
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
  accountName?: string;
}

export class GigaB2BService {
  private clientId: string;
  private clientSecret: string;
  private baseUrl: string = "https://openapi.gigab2b.com";
  
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

  private generateNonce(): string {
    return Math.random().toString(36).substring(2, 12);
  }

  private generateSignature(uri: string, timestamp: number, nonce: string): string {
    const message = `${this.clientId}&${uri}&${timestamp}&${nonce}`;
    const secretKey = `${this.clientId}&${this.clientSecret}&${nonce}`;
    
    return crypto.createHmac("sha256", secretKey).update(message).digest("base64");
  }

  private async request<T>(endpoint: string, body?: any): Promise<T> {
    const timestamp = Date.now();
    const nonce = this.generateNonce();
    const sign = this.generateSignature(endpoint, timestamp, nonce);

    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "client-id": this.clientId,
      "timestamp": timestamp.toString(),
      "nonce": nonce,
      "sign": sign,
    };

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    
    if (!response.ok) {
      throw new Error(`GigaB2B API error: ${response.status} - ${text.substring(0, 200)}`);
    }

    try {
      const data = JSON.parse(text) as T & { success?: boolean; code?: string; msg?: string; subMsg?: string };
      if (data.success === false) {
        throw new Error(`GigaB2B API error: ${data.code} - ${data.msg}${data.subMsg ? ` (${data.subMsg})` : ""}`);
      }
      return data;
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error(`GigaB2B returned invalid JSON: ${text.substring(0, 200)}`);
      }
      throw err;
    }
  }

  async testConnection(): Promise<{ success: boolean; message?: string; error?: string; accountName?: string }> {
    try {
      const data = await this.request<GigaB2BProductListResponse>(
        "/b2b-overseas-api/v1/buyer/product/skus/v1",
        { page: 1, pageSize: 100 }
      );
      
      const totalProducts = data.data?.pageInfo?.totalNum || 0;
      return { 
        success: true, 
        message: `Connected to GigaB2B Open API 2.0. ${totalProducts} products available.`,
        accountName: "GigaB2B"
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getProductSkus(page: number = 1, pageSize: number = 1000): Promise<{
    skus: string[];
    total: number;
    hasMore: boolean;
  }> {
    const response = await this.request<GigaB2BProductListResponse>(
      "/b2b-overseas-api/v1/buyer/product/skus/v1",
      { page, pageSize, sort: 2 }
    );

    return {
      skus: response.data.records.map(r => r.sku),
      total: response.data.pageInfo.totalNum,
      hasMore: page < response.data.pageInfo.totalPage,
    };
  }

  async getProductPrices(skus: string[]): Promise<GigaB2BPriceData[]> {
    if (skus.length === 0) return [];
    
    const batchSize = 200;
    const results: GigaB2BPriceData[] = [];
    
    for (let i = 0; i < skus.length; i += batchSize) {
      const batch = skus.slice(i, i + batchSize);
      const response = await this.request<GigaB2BPriceResponse>(
        "/b2b-overseas-api/v1/buyer/product/price/v1",
        { skus: batch }
      );
      results.push(...response.data);
      
      if (i + batchSize < skus.length) {
        await new Promise(resolve => setTimeout(resolve, 1100));
      }
    }
    
    return results;
  }

  async getProductCount(): Promise<number> {
    try {
      const data = await this.getProductSkus(1, 100);
      return data.total;
    } catch {
      return 0;
    }
  }

  async getTracking(orderNo: string): Promise<GigaB2BTrackingResponse["data"] | null> {
    try {
      const response = await this.request<GigaB2BTrackingResponse>(
        "/b2b-overseas-api/v1/buyer/order/track-no/v1",
        { orderNo: [orderNo] }
      );
      return response.data || null;
    } catch {
      return null;
    }
  }

  async syncOrder(order: {
    orderNo: string;
    orderDate: string;
    shipName: string;
    shipPhone: string;
    shipEmail?: string;
    shipAddress1: string;
    shipAddress2?: string;
    shipCity: string;
    shipCountry: string;
    shipState: string;
    shipZipCode: string;
    salesChannel: string;
    orderLines: Array<{
      sku: string;
      qty: number;
      itemPrice: number;
      productName?: string;
    }>;
    orderTotal: number;
    customerComments?: string;
  }): Promise<GigaB2BOrderSyncResponse> {
    return await this.request<GigaB2BOrderSyncResponse>(
      "/b2b-overseas-api/v1/buyer/order/dropShip-sync/v1",
      {
        ...order,
        hasOtherLabel: false,
        valueAddedServices: {
          returnLabelService: false,
          deliveryService: "DSR",
        },
      }
    );
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

      const pageSize = 1000;
      const totalPages = Math.ceil(productCount / pageSize);
      let page = 1;

      while (page <= totalPages && this.syncProgress.status === "running") {
        this.syncProgress.currentPage = page;
        console.log(`[GigaB2B] Fetching page ${page}/${totalPages}...`);

        try {
          const skuData = await this.getProductSkus(page, pageSize);
          const skus = skuData.skus;
          
          if (skus.length === 0) break;

          const priceData = await this.getProductPrices(skus);
          this.syncProgress.fetchedProducts += priceData.length;

          const productsToSave: InsertProduct[] = priceData
            .filter(p => p.skuAvailable)
            .map(product => this.transformProduct(product, supplierId));

          if (productsToSave.length > 0) {
            const result = await batchSaveCallback(productsToSave);
            this.syncProgress.savedProducts += productsToSave.length;
            this.syncProgress.createdProducts += result.created;
            this.syncProgress.updatedProducts += result.updated;

            console.log(`[GigaB2B] Page ${page}: saved ${productsToSave.length} products (${result.created} new, ${result.updated} updated)`);
          }
          
          page++;
          
          await new Promise(resolve => setTimeout(resolve, 500));
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

  private transformProduct(product: GigaB2BPriceData, supplierId: number): InsertProduct {
    const basePrice = product.discountedPrice || product.exclusivePrice || product.price;
    const sellerName = product.sellerInfo?.sellerStore || "GigaB2B";

    return {
      supplierId,
      supplierProductId: product.sku,
      supplierSku: product.sku,
      title: `${sellerName} - ${product.sku}`,
      description: `Product SKU: ${product.sku}\nSeller: ${sellerName}\nCurrency: ${product.currency}`,
      supplierPrice: basePrice,
      category: "GigaB2B Products",
      inventoryQuantity: product.skuAvailable ? 100 : 0,
      images: [],
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
