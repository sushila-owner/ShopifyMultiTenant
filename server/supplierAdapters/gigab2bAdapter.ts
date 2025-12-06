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

export class GigaB2BAdapter extends BaseAdapter {
  readonly type = "gigab2b" as const;
  private baseUrl: string;
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(credentials: GigaB2BCredentials) {
    super(credentials);
    this.baseUrl = credentials.baseUrl || "https://api.gigab2b.com";
    this.clientId = credentials.clientId || credentials.apiKey;
    this.clientSecret = credentials.clientSecret || credentials.apiSecret || "";
  }

  private async ensureAuthenticated(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return;
    }

    const response = await fetch(`${this.baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`GigaB2B authentication failed: ${response.status}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  }

  private async gigab2bRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    await this.ensureAuthenticated();

    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GigaB2B API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      await this.ensureAuthenticated();
      
      const products = await this.gigab2bRequest<{ total: number }>("/products?limit=1");
      
      return {
        success: true,
        message: "Connected to GigaB2B successfully",
        details: {
          productsCount: products.total,
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

  async fetchProducts(page = 1, pageSize = 50): Promise<PaginatedResult<NormalizedProduct>> {
    try {
      const offset = (page - 1) * pageSize;
      const response = await this.gigab2bRequest<{
        products: any[];
        total: number;
      }>(`/products?limit=${pageSize}&offset=${offset}`);

      const normalizedProducts: NormalizedProduct[] = response.products.map((p) =>
        this.normalizeProduct(p)
      );

      return {
        items: normalizedProducts,
        total: response.total,
        page,
        pageSize,
        hasMore: offset + pageSize < response.total,
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch products: ${error.message}`);
    }
  }

  async fetchProduct(supplierProductId: string): Promise<NormalizedProduct | null> {
    try {
      const response = await this.gigab2bRequest<{ product: any }>(
        `/products/${supplierProductId}`
      );
      return this.normalizeProduct(response.product);
    } catch (error: any) {
      if (error.message.includes("404")) {
        return null;
      }
      throw error;
    }
  }

  async fetchInventory(supplierProductIds?: string[]): Promise<NormalizedInventory[]> {
    try {
      let endpoint = "/inventory";
      if (supplierProductIds && supplierProductIds.length > 0) {
        endpoint += `?product_ids=${supplierProductIds.join(",")}`;
      }

      const response = await this.gigab2bRequest<{
        inventory: { product_id: string; variant_id: string; sku: string; quantity: number }[];
      }>(endpoint);

      return response.inventory.map((item) => ({
        supplierProductId: item.product_id,
        variantId: item.variant_id,
        sku: item.sku,
        quantity: item.quantity,
        available: item.quantity > 0,
      }));
    } catch (error: any) {
      throw new Error(`Failed to fetch inventory: ${error.message}`);
    }
  }

  async createOrder(order: OrderCreateRequest): Promise<OrderCreateResponse> {
    try {
      const gigab2bOrder = {
        items: order.items.map((item) => ({
          product_id: item.supplierProductId,
          variant_id: item.variantId,
          sku: item.sku,
          quantity: item.quantity,
          unit_price: item.price,
        })),
        shipping_address: {
          first_name: order.shippingAddress.firstName,
          last_name: order.shippingAddress.lastName,
          street1: order.shippingAddress.address1,
          street2: order.shippingAddress.address2,
          city: order.shippingAddress.city,
          state: order.shippingAddress.province,
          country: order.shippingAddress.country,
          postal_code: order.shippingAddress.zip,
          phone: order.shippingAddress.phone,
          email: order.shippingAddress.email,
        },
        notes: order.note,
      };

      const response = await this.gigab2bRequest<{
        order: { id: string; status: string; total: number };
      }>("/orders", {
        method: "POST",
        body: JSON.stringify(gigab2bOrder),
      });

      return {
        supplierOrderId: response.order.id,
        status: response.order.status,
        totalCost: response.order.total,
        rawResponse: response.order,
      };
    } catch (error: any) {
      throw new Error(`Failed to create order: ${error.message}`);
    }
  }

  async getOrder(supplierOrderId: string): Promise<NormalizedOrder | null> {
    try {
      const response = await this.gigab2bRequest<{ order: any }>(
        `/orders/${supplierOrderId}`
      );

      const order = response.order;
      return {
        supplierOrderId: order.id,
        status: this.mapOrderStatus(order.status),
        items: order.items.map((item: any) => ({
          supplierProductId: item.product_id,
          variantId: item.variant_id,
          quantity: item.quantity,
          price: item.unit_price,
          fulfillmentStatus: item.fulfillment_status,
        })),
        totalCost: order.total,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
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
      const response = await this.gigab2bRequest<{
        tracking: {
          tracking_number: string;
          carrier: string;
          tracking_url?: string;
          status: string;
          estimated_delivery?: string;
          events?: { date: string; status: string; location?: string; description?: string }[];
        };
      }>(`/orders/${supplierOrderId}/tracking`);

      const tracking = response.tracking;
      return {
        trackingNumber: tracking.tracking_number,
        carrier: tracking.carrier,
        trackingUrl: tracking.tracking_url,
        status: this.mapTrackingStatus(tracking.status),
        estimatedDelivery: tracking.estimated_delivery,
        events: tracking.events,
      };
    } catch (error: any) {
      if (error.message.includes("404") || error.message.includes("No tracking")) {
        return null;
      }
      throw error;
    }
  }

  private normalizeProduct(product: any): NormalizedProduct {
    return {
      supplierProductId: String(product.id),
      title: product.title || product.name,
      description: product.description || "",
      category: product.category || "Uncategorized",
      tags: product.tags || [],
      images: (product.images || []).map((img: any, idx: number) => ({
        url: typeof img === "string" ? img : img.url,
        alt: typeof img === "string" ? product.title : img.alt,
        position: idx + 1,
      })),
      variants: (product.variants || [{ id: product.id, sku: product.sku, price: product.price, quantity: product.quantity }]).map((v: any) => ({
        id: String(v.id),
        sku: v.sku || "",
        title: v.title || "Default",
        price: parseFloat(v.price) || 0,
        compareAtPrice: v.compare_at_price ? parseFloat(v.compare_at_price) : undefined,
        cost: v.cost ? parseFloat(v.cost) : 0,
        inventoryQuantity: v.quantity || v.inventory_quantity || 0,
      })),
      supplierSku: product.sku || product.variants?.[0]?.sku || "",
      supplierPrice: parseFloat(product.price) || parseFloat(product.variants?.[0]?.price) || 0,
    };
  }

  private mapOrderStatus(status: string): NormalizedOrder["status"] {
    const statusMap: Record<string, NormalizedOrder["status"]> = {
      pending: "pending",
      confirmed: "confirmed",
      processing: "processing",
      shipped: "shipped",
      delivered: "delivered",
      cancelled: "cancelled",
    };
    return statusMap[status.toLowerCase()] || "pending";
  }

  private mapTrackingStatus(status: string): TrackingInfo["status"] {
    const statusMap: Record<string, TrackingInfo["status"]> = {
      pending: "pending",
      in_transit: "in_transit",
      out_for_delivery: "out_for_delivery",
      delivered: "delivered",
      exception: "exception",
    };
    return statusMap[status.toLowerCase()] || "pending";
  }
}
