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

interface GigaB2BProductDetailResponse {
  success: boolean;
  code: string;
  data: Array<{
    sku: string;
    productName?: string;
    productTitle?: string;
    title?: string;
    name?: string;
    description?: string;
    productDesc?: string;
    category?: string;
    categoryName?: string;
    brand?: string;
    images?: string[];
    imageUrls?: string[];
    mainImage?: string;
    thumbImage?: string;
    specifications?: Record<string, any>;
    attributes?: Record<string, any>;
    weight?: number;
    dimensions?: {
      length?: number;
      width?: number;
      height?: number;
    };
  }>;
  requestId: string;
  msg: string;
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
    const envClientId = (process.env.GIGAB2B_CLIENT_ID || "").trim();
    const envClientSecret = (process.env.GIGAB2B_CLIENT_SECRET || "").trim();
    
    // Check if credentials are placeholders that indicate env vars should be used
    const dbClientId = (credentials.clientId || credentials.apiKey || "").trim();
    const dbClientSecret = (credentials.clientSecret || credentials.apiSecret || "").trim();
    
    this.clientId = (dbClientId === "FROM_ENV" || !dbClientId) ? envClientId : dbClientId;
    this.clientSecret = (dbClientSecret === "FROM_ENV" || !dbClientSecret) ? envClientSecret : dbClientSecret;
    
    console.log(`[GigaB2B] Initialized with base URL: ${this.baseUrl}`);
  }

  private generateNonce(): string {
    // Generate exactly 10 alphanumeric characters as required by GigaB2B
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < 10; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private generateSignature(uri: string, timestamp: number, nonce: string): string {
    // Per GigaB2B Open API 2.0 documentation (Java example):
    // 1. Create message: clientId&uri&timestamp&nonce
    // 2. Create key: clientId&clientSecret&nonce
    // 3. HMAC-SHA256, then convert to hex string
    // 4. Base64 encode the hex string
    const message = `${this.clientId}&${uri}&${timestamp}&${nonce}`;
    const secretKey = `${this.clientId}&${this.clientSecret}&${nonce}`;
    
    // Step 3: HMAC-SHA256 and convert to hex string
    const hmacHex = crypto.createHmac("sha256", secretKey).update(message).digest("hex");
    
    // Step 4: Base64 encode the hex string
    const signature = Buffer.from(hmacHex, "utf8").toString("base64");
    
    // Debug: show signature components (not secrets)
    console.log(`[GigaB2B] Signature message: ${this.clientId.substring(0,4)}...&${uri}&${timestamp}&${nonce}`);
    
    return signature;
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
    
    // Debug logging
    console.log(`[GigaB2B] Request to ${endpoint}`);
    console.log(`[GigaB2B] Client ID: ${this.clientId ? this.clientId.substring(0, 4) + "..." : "MISSING"}`);
    console.log(`[GigaB2B] Timestamp: ${timestamp}, Nonce: ${nonce}`);
    
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
    products: Array<{ sku: string; productName?: string }>;
    total: number;
    hasMore: boolean;
  }> {
    const response = await this.gigab2bRequest<GigaB2BProductListResponse>(
      "/b2b-overseas-api/v1/buyer/product/skus/v1",
      "POST",
      { page, pageSize, sort: 2 }
    );

    return {
      products: response.data.records.map(r => ({ 
        sku: r.sku, 
        productName: r.productName 
      })),
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

  async fetchProductDetails(skus: string[]): Promise<Map<string, GigaB2BProductDetailResponse["data"][0]>> {
    const detailsMap = new Map<string, GigaB2BProductDetailResponse["data"][0]>();
    if (skus.length === 0) return detailsMap;
    
    try {
      const batchSize = 50;
      
      for (let i = 0; i < skus.length; i += batchSize) {
        const batch = skus.slice(i, i + batchSize);
        
        // Try the product detail endpoint
        const response = await this.gigab2bRequest<GigaB2BProductDetailResponse>(
          "/b2b-overseas-api/v1/buyer/product/detail/v1",
          "POST",
          { skus: batch }
        );
        
        if (response.data && Array.isArray(response.data)) {
          for (const detail of response.data) {
            detailsMap.set(detail.sku, detail);
          }
        }
        
        if (i + batchSize < skus.length) {
          await new Promise(resolve => setTimeout(resolve, 1100));
        }
      }
    } catch (error: any) {
      console.log(`[GigaB2B] Product detail endpoint not available or failed: ${error.message}`);
      // If the detail endpoint isn't available, we'll use basic info from price API
    }
    
    return detailsMap;
  }

  async fetchProducts(page = 1, pageSize = 100): Promise<PaginatedResult<NormalizedProduct>> {
    try {
      const listResponse = await this.fetchProductList(page, pageSize);
      
      if (listResponse.products.length === 0) {
        return {
          items: [],
          total: listResponse.total,
          page,
          pageSize,
          hasMore: false,
        };
      }

      // Create a map of productNames from the list response
      const productNamesMap = new Map<string, string>();
      for (const p of listResponse.products) {
        if (p.productName) {
          productNamesMap.set(p.sku, p.productName);
        }
      }

      const skus = listResponse.products.map(p => p.sku);

      // Fetch both price data and product details in parallel
      const [priceData, detailsMap] = await Promise.all([
        this.fetchProductPrices(skus),
        this.fetchProductDetails(skus)
      ]);
      
      const normalizedProducts: NormalizedProduct[] = priceData
        .filter(p => p.skuAvailable)
        .map((p) => {
          // Merge product name from list response into details
          const details = detailsMap.get(p.sku);
          const productNameFromList = productNamesMap.get(p.sku);
          const mergedDetails = details ? { ...details, productName: details.productName || productNameFromList } : 
            productNameFromList ? { sku: p.sku, productName: productNameFromList } : undefined;
          return this.normalizeProduct(p, mergedDetails);
        });

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

  private normalizeProduct(
    product: GigaB2BPriceResponse["data"][0], 
    details?: GigaB2BProductDetailResponse["data"][0]
  ): NormalizedProduct {
    const basePrice = product.discountedPrice || product.exclusivePrice || product.price;
    const sellerName = product.sellerInfo?.sellerStore || "GigaB2B";
    
    // Extract product name from details if available
    const productName = details?.productName || details?.productTitle || details?.title || details?.name;
    const title = productName ? productName : `${sellerName} - ${product.sku}`;
    
    // Extract description from details if available
    const description = details?.description || details?.productDesc || 
      `Product SKU: ${product.sku}\nSeller: ${sellerName}\nCurrency: ${product.currency}`;
    
    // Extract category from details if available
    const category = details?.category || details?.categoryName || "GigaB2B Products";
    
    // Extract images from details - try multiple possible field names
    let imageUrls: string[] = [];
    if (details) {
      if (details.images && Array.isArray(details.images)) {
        imageUrls = details.images;
      } else if (details.imageUrls && Array.isArray(details.imageUrls)) {
        imageUrls = details.imageUrls;
      } else if (details.mainImage) {
        imageUrls = [details.mainImage];
        if (details.thumbImage) {
          imageUrls.push(details.thumbImage);
        }
      }
    }
    
    // Convert to the expected format with url, alt, and position
    const images = imageUrls.map((url, index) => ({
      url,
      alt: title,
      position: index + 1
    }));
    
    // Build tags
    const tags = ["gigab2b", sellerName.toLowerCase().replace(/\s+/g, "-")];
    if (details?.brand) {
      tags.push(details.brand.toLowerCase().replace(/\s+/g, "-"));
    }
    
    return {
      supplierProductId: product.sku,
      title,
      description,
      category,
      tags,
      images,
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
