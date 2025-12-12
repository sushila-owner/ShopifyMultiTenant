import crypto from "crypto";
import {
  BaseAdapter,
  NormalizedProduct,
  NormalizedInventory,
  NormalizedOrder,
  OrderCreateRequest,
  OrderCreateResponse,
  TrackingInfo,
  ConnectionTestResult,
  PaginatedResult,
  GigaB2BCredentials,
} from "./types";

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
    records: Array<{
      sku: string;
      productName?: string;
      updateTime: string;
      firstArrivalDate: string;
    }>;
  };
  requestId: string;
  msg: string;
}

interface GigaB2BPriceResponse {
  success: boolean;
  code: string;
  data: Array<{
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
  }>;
  requestId: string;
  msg: string;
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
    returnTrackInfo: Array<any>;
  }>;
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

export class GigaB2BAdapter extends BaseAdapter {
  readonly type = "gigab2b" as const;
  private baseUrl: string;
  private clientId: string;
  private clientSecret: string;

  constructor(credentials: GigaB2BCredentials) {
    super(credentials);
    this.baseUrl = credentials.baseUrl || "https://openapi.gigab2b.com";
    
    // Use environment variables as fallback for security (don't store secrets in DB)
    const envClientId = process.env.GIGAB2B_CLIENT_ID || "";
    const envClientSecret = process.env.GIGAB2B_CLIENT_SECRET || "";
    
    // Check if credentials are placeholders that indicate env vars should be used
    const dbClientId = credentials.clientId || credentials.apiKey || "";
    const dbClientSecret = credentials.clientSecret || credentials.apiSecret || "";
    
    this.clientId = (dbClientId === "FROM_ENV" || !dbClientId) ? envClientId : dbClientId;
    this.clientSecret = (dbClientSecret === "FROM_ENV" || !dbClientSecret) ? envClientSecret : dbClientSecret;
  }

  private generateNonce(): string {
    return Math.random().toString(36).substring(2, 12);
  }

  private generateSignature(uri: string, timestamp: number, nonce: string): string {
    const message = `${this.clientId}&${uri}&${timestamp}&${nonce}`;
    const secretKey = `${this.clientId}&${this.clientSecret}&${nonce}`;
    
    return crypto.createHmac("sha256", secretKey).update(message).digest("base64");
  }

  private async gigab2bRequest<T>(
    endpoint: string, 
    method: "GET" | "POST" = "POST",
    body?: any
  ): Promise<T> {
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

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && method === "POST") {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GigaB2B API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    
    if (data.success === false) {
      throw new Error(`GigaB2B API error: ${data.code} - ${data.msg}${data.subMsg ? ` (${data.subMsg})` : ""}`);
    }

    return data as T;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const response = await this.gigab2bRequest<GigaB2BProductListResponse>(
        "/b2b-overseas-api/v1/buyer/product/skus/v1",
        "POST",
        { page: 1, pageSize: 100 }
      );
      
      return {
        success: true,
        message: "Connected to GigaB2B Open API 2.0 successfully",
        details: {
          productsCount: response.data?.pageInfo?.totalNum || 0,
          capabilities: {
            readProducts: true,
            readInventory: true,
            createOrders: true,
            readOrders: true,
            getTracking: true,
          },
        },
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || "Failed to connect to GigaB2B",
      };
    }
  }

  async fetchProductList(page = 1, pageSize = 1000): Promise<{
    skus: string[];
    total: number;
    hasMore: boolean;
  }> {
    const response = await this.gigab2bRequest<GigaB2BProductListResponse>(
      "/b2b-overseas-api/v1/buyer/product/skus/v1",
      "POST",
      { page, pageSize, sort: 2 }
    );

    return {
      skus: response.data.records.map(r => r.sku),
      total: response.data.pageInfo.totalNum,
      hasMore: page < response.data.pageInfo.totalPage,
    };
  }

  async fetchProductPrices(skus: string[]): Promise<GigaB2BPriceResponse["data"]> {
    if (skus.length === 0) return [];
    
    const batchSize = 200;
    const results: GigaB2BPriceResponse["data"] = [];
    
    for (let i = 0; i < skus.length; i += batchSize) {
      const batch = skus.slice(i, i + batchSize);
      const response = await this.gigab2bRequest<GigaB2BPriceResponse>(
        "/b2b-overseas-api/v1/buyer/product/price/v1",
        "POST",
        { skus: batch }
      );
      results.push(...response.data);
      
      if (i + batchSize < skus.length) {
        await new Promise(resolve => setTimeout(resolve, 1100));
      }
    }
    
    return results;
  }

  async fetchProducts(page = 1, pageSize = 100): Promise<PaginatedResult<NormalizedProduct>> {
    try {
      const listResponse = await this.fetchProductList(page, pageSize);
      
      if (listResponse.skus.length === 0) {
        return {
          items: [],
          total: listResponse.total,
          page,
          pageSize,
          hasMore: false,
        };
      }

      const priceData = await this.fetchProductPrices(listResponse.skus);
      
      const normalizedProducts: NormalizedProduct[] = priceData
        .filter(p => p.skuAvailable)
        .map((p) => this.normalizeProduct(p));

      return {
        items: normalizedProducts,
        total: listResponse.total,
        page,
        pageSize,
        hasMore: listResponse.hasMore,
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch products: ${error.message}`);
    }
  }

  async fetchProduct(supplierProductId: string): Promise<NormalizedProduct | null> {
    try {
      const priceData = await this.fetchProductPrices([supplierProductId]);
      
      if (priceData.length === 0 || !priceData[0].skuAvailable) {
        return null;
      }
      
      return this.normalizeProduct(priceData[0]);
    } catch (error: any) {
      if (error.message.includes("404") || error.message.includes("not found")) {
        return null;
      }
      throw error;
    }
  }

  async fetchInventory(supplierProductIds?: string[]): Promise<NormalizedInventory[]> {
    try {
      if (!supplierProductIds || supplierProductIds.length === 0) {
        return [];
      }

      const priceData = await this.fetchProductPrices(supplierProductIds);
      
      return priceData.map((item) => ({
        supplierProductId: item.sku,
        variantId: item.sku,
        sku: item.sku,
        quantity: item.skuAvailable ? 100 : 0,
        available: item.skuAvailable,
      }));
    } catch (error: any) {
      throw new Error(`Failed to fetch inventory: ${error.message}`);
    }
  }

  async createOrder(order: OrderCreateRequest): Promise<OrderCreateResponse> {
    try {
      const gigab2bOrder = {
        orderDate: new Date().toISOString().replace("T", " ").substring(0, 19),
        orderNo: `APX${Date.now()}`,
        shipName: `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`.trim(),
        shipPhone: order.shippingAddress.phone || "0000000000",
        shipEmail: order.shippingAddress.email || "",
        shipAddress1: order.shippingAddress.address1.substring(0, 35),
        shipAddress2: (order.shippingAddress.address2 || "").substring(0, 35),
        shipCity: order.shippingAddress.city,
        shipCountry: order.shippingAddress.country,
        shipState: order.shippingAddress.province,
        shipZipCode: order.shippingAddress.zip,
        salesChannel: "APEX_MART",
        orderLines: order.items.map((item) => ({
          sku: item.sku,
          qty: item.quantity,
          itemPrice: item.price,
          productName: item.sku,
        })),
        orderTotal: order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
        customerComments: order.note || "",
        valueAddedServices: {
          returnLabelService: false,
          deliveryService: "DSR",
        },
      };

      const response = await this.gigab2bRequest<GigaB2BOrderSyncResponse>(
        "/b2b-overseas-api/v1/buyer/order/dropShip-sync/v1",
        "POST",
        gigab2bOrder
      );

      return {
        supplierOrderId: gigab2bOrder.orderNo,
        status: response.success ? "pending" : "failed",
        totalCost: gigab2bOrder.orderTotal,
        rawResponse: response,
      };
    } catch (error: any) {
      throw new Error(`Failed to create order: ${error.message}`);
    }
  }

  async getOrder(supplierOrderId: string): Promise<NormalizedOrder | null> {
    return null;
  }

  async getTracking(supplierOrderId: string): Promise<TrackingInfo | null> {
    try {
      const response = await this.gigab2bRequest<GigaB2BTrackingResponse>(
        "/b2b-overseas-api/v1/buyer/order/track-no/v1",
        "POST",
        { orderNo: [supplierOrderId] }
      );

      if (!response.data || response.data.length === 0) {
        return null;
      }

      const orderData = response.data[0];
      if (!orderData.shipTrackInfo || orderData.shipTrackInfo.length === 0) {
        return null;
      }

      const firstTrack = orderData.shipTrackInfo[0];
      return {
        trackingNumber: firstTrack.trackingNum,
        carrier: firstTrack.carrierName,
        status: "in_transit",
        estimatedDelivery: undefined,
        events: [],
      };
    } catch (error: any) {
      console.error(`Failed to get tracking for order ${supplierOrderId}:`, error.message);
      return null;
    }
  }

  private normalizeProduct(product: GigaB2BPriceResponse["data"][0]): NormalizedProduct {
    const basePrice = product.discountedPrice || product.exclusivePrice || product.price;
    const sellerName = product.sellerInfo?.sellerStore || "GigaB2B";
    
    return {
      supplierProductId: product.sku,
      title: `${sellerName} - ${product.sku}`,
      description: `Product SKU: ${product.sku}\nSeller: ${sellerName}\nCurrency: ${product.currency}`,
      category: "GigaB2B Products",
      tags: ["gigab2b", sellerName.toLowerCase().replace(/\s+/g, "-")],
      images: [],
      variants: [{
        id: product.sku,
        sku: product.sku,
        title: "Default",
        price: basePrice * 100,
        cost: basePrice * 100,
        inventoryQuantity: product.skuAvailable ? 100 : 0,
      }],
      supplierSku: product.sku,
      supplierPrice: basePrice,
    };
  }

  private mapOrderStatus(status: string): "pending" | "processing" | "shipped" | "delivered" | "cancelled" {
    const statusMap: Record<string, "pending" | "processing" | "shipped" | "delivered" | "cancelled"> = {
      pending: "pending",
      processing: "processing",
      shipped: "shipped",
      delivered: "delivered",
      cancelled: "cancelled",
      completed: "delivered",
      fulfilled: "shipped",
    };
    const normalized = status.toLowerCase();
    return statusMap[normalized] || "pending";
  }
}
