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
  CustomApiCredentials,
} from "./types";

export class CustomApiAdapter extends BaseAdapter {
  readonly type = "custom" as const;
  private baseUrl: string;
  private apiKey?: string;
  private apiToken?: string;
  private customHeaders: Record<string, string>;
  private endpoints: {
    products: string;
    inventory: string;
    orders: string;
    tracking: string;
  };

  constructor(credentials: CustomApiCredentials) {
    super(credentials);
    this.baseUrl = credentials.baseUrl.replace(/\/$/, "");
    this.apiKey = credentials.apiKey;
    this.apiToken = credentials.apiToken;
    this.customHeaders = credentials.headers || {};
    this.endpoints = {
      products: credentials.endpoints?.products || "/products",
      inventory: credentials.endpoints?.inventory || "/inventory",
      orders: credentials.endpoints?.orders || "/orders",
      tracking: credentials.endpoints?.tracking || "/tracking",
    };
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = { ...this.customHeaders };
    
    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }
    if (this.apiToken) {
      headers["Authorization"] = `Bearer ${this.apiToken}`;
    }
    
    return headers;
  }

  private async customRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getAuthHeaders(),
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Custom API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const response = await this.customRequest<any>(this.endpoints.products + "?limit=1");
      
      return {
        success: true,
        message: "Connected to Custom API successfully",
        details: {
          productsCount: response.total || response.count || (Array.isArray(response) ? response.length : -1),
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
        message: error.message || "Failed to connect to Custom API",
      };
    }
  }

  async fetchProducts(page = 1, pageSize = 50): Promise<PaginatedResult<NormalizedProduct>> {
    try {
      const offset = (page - 1) * pageSize;
      const response = await this.customRequest<any>(
        `${this.endpoints.products}?limit=${pageSize}&offset=${offset}&page=${page}`
      );

      const products = Array.isArray(response) ? response : response.products || response.data || response.items || [];
      const total = response.total || response.count || -1;

      const normalizedProducts: NormalizedProduct[] = products.map((p: any) =>
        this.normalizeProduct(p)
      );

      return {
        items: normalizedProducts,
        total,
        page,
        pageSize,
        hasMore: products.length === pageSize,
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch products: ${error.message}`);
    }
  }

  async fetchProduct(supplierProductId: string): Promise<NormalizedProduct | null> {
    try {
      const response = await this.customRequest<any>(
        `${this.endpoints.products}/${supplierProductId}`
      );
      const product = response.product || response.data || response;
      return this.normalizeProduct(product);
    } catch (error: any) {
      if (error.message.includes("404")) {
        return null;
      }
      throw error;
    }
  }

  async fetchInventory(supplierProductIds?: string[]): Promise<NormalizedInventory[]> {
    try {
      let endpoint = this.endpoints.inventory;
      if (supplierProductIds && supplierProductIds.length > 0) {
        endpoint += `?product_ids=${supplierProductIds.join(",")}`;
      }

      const response = await this.customRequest<any>(endpoint);
      const inventory = Array.isArray(response) ? response : response.inventory || response.data || response.items || [];

      return inventory.map((item: any) => ({
        supplierProductId: String(item.product_id || item.productId || item.id),
        variantId: String(item.variant_id || item.variantId || item.id),
        sku: item.sku || "",
        quantity: item.quantity || item.stock || item.available || 0,
        available: (item.quantity || item.stock || item.available || 0) > 0,
      }));
    } catch (error: any) {
      throw new Error(`Failed to fetch inventory: ${error.message}`);
    }
  }

  async createOrder(order: OrderCreateRequest): Promise<OrderCreateResponse> {
    try {
      const orderPayload = {
        items: order.items.map((item) => ({
          product_id: item.supplierProductId,
          variant_id: item.variantId,
          sku: item.sku,
          quantity: item.quantity,
          price: item.price,
        })),
        shipping_address: order.shippingAddress,
        note: order.note,
      };

      const response = await this.customRequest<any>(this.endpoints.orders, {
        method: "POST",
        body: JSON.stringify(orderPayload),
      });

      const orderData = response.order || response.data || response;
      
      return {
        supplierOrderId: String(orderData.id || orderData.order_id || orderData.orderId),
        status: orderData.status || "submitted",
        totalCost: orderData.total || orderData.total_cost || orderData.totalCost || 0,
        rawResponse: response,
      };
    } catch (error: any) {
      throw new Error(`Failed to create order: ${error.message}`);
    }
  }

  async getOrder(supplierOrderId: string): Promise<NormalizedOrder | null> {
    try {
      const response = await this.customRequest<any>(
        `${this.endpoints.orders}/${supplierOrderId}`
      );

      const order = response.order || response.data || response;
      const items = order.items || order.line_items || order.lineItems || [];

      return {
        supplierOrderId: String(order.id || order.order_id || supplierOrderId),
        status: this.mapOrderStatus(order.status),
        items: items.map((item: any) => ({
          supplierProductId: String(item.product_id || item.productId),
          variantId: String(item.variant_id || item.variantId || item.product_id),
          quantity: item.quantity,
          price: item.price || item.unit_price,
        })),
        totalCost: order.total || order.total_cost || 0,
        createdAt: order.created_at || order.createdAt || new Date().toISOString(),
        updatedAt: order.updated_at || order.updatedAt,
      };
    } catch (error: any) {
      if (error.message.includes("404")) {
        return null;
      }
      throw error;
    }
  }

  async getTracking(supplierOrderId: string): Promise<TrackingInfo | null> {
    try {
      const response = await this.customRequest<any>(
        `${this.endpoints.tracking}/${supplierOrderId}`
      );

      const tracking = response.tracking || response.data || response;
      
      if (!tracking || !tracking.tracking_number) {
        return null;
      }

      return {
        trackingNumber: tracking.tracking_number || tracking.trackingNumber || "",
        carrier: tracking.carrier || tracking.shipping_carrier || "",
        trackingUrl: tracking.tracking_url || tracking.trackingUrl,
        status: this.mapTrackingStatus(tracking.status),
        estimatedDelivery: tracking.estimated_delivery || tracking.estimatedDelivery,
        events: tracking.events,
      };
    } catch (error: any) {
      return null;
    }
  }

  private normalizeProduct(product: any): NormalizedProduct {
    const variants = product.variants || [{
      id: String(product.id),
      sku: product.sku || "",
      title: "Default",
      price: product.price || 0,
      cost: product.cost || 0,
      inventoryQuantity: product.quantity || product.stock || 0,
    }];

    return {
      supplierProductId: String(product.id || product.product_id),
      title: product.title || product.name || "",
      description: product.description || "",
      category: product.category || "Uncategorized",
      tags: product.tags || [],
      images: (product.images || []).map((img: any, idx: number) => ({
        url: typeof img === "string" ? img : img.url || img.src,
        alt: typeof img === "string" ? product.title : img.alt,
        position: idx + 1,
      })),
      variants: variants.map((v: any) => ({
        id: String(v.id),
        sku: v.sku || "",
        title: v.title || v.name || "Default",
        price: parseFloat(v.price) || 0,
        compareAtPrice: v.compare_at_price || v.compareAtPrice,
        cost: parseFloat(v.cost) || 0,
        inventoryQuantity: v.quantity || v.stock || v.inventory_quantity || 0,
      })),
      supplierSku: product.sku || variants[0]?.sku || "",
      supplierPrice: parseFloat(product.price) || parseFloat(variants[0]?.price) || 0,
    };
  }

  private mapOrderStatus(status: string): NormalizedOrder["status"] {
    const normalized = status?.toLowerCase() || "pending";
    const statusMap: Record<string, NormalizedOrder["status"]> = {
      pending: "pending",
      confirmed: "confirmed",
      processing: "processing",
      shipped: "shipped",
      delivered: "delivered",
      cancelled: "cancelled",
      completed: "delivered",
    };
    return statusMap[normalized] || "pending";
  }

  private mapTrackingStatus(status: string): TrackingInfo["status"] {
    const normalized = status?.toLowerCase() || "pending";
    const statusMap: Record<string, TrackingInfo["status"]> = {
      pending: "pending",
      in_transit: "in_transit",
      out_for_delivery: "out_for_delivery",
      delivered: "delivered",
      exception: "exception",
    };
    return statusMap[normalized] || "pending";
  }
}
