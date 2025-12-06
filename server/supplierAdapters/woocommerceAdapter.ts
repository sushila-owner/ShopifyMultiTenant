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
  WooCommerceCredentials,
} from "./types";

export class WooCommerceAdapter extends BaseAdapter {
  readonly type = "woocommerce" as const;
  private storeUrl: string;
  private consumerKey: string;
  private consumerSecret: string;

  constructor(credentials: WooCommerceCredentials) {
    super(credentials);
    this.storeUrl = credentials.storeUrl.replace(/\/$/, "");
    this.consumerKey = credentials.consumerKey;
    this.consumerSecret = credentials.consumerSecret;
  }

  private getApiUrl(endpoint: string): string {
    return `${this.storeUrl}/wp-json/wc/v3/${endpoint}`;
  }

  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString("base64");
    return `Basic ${credentials}`;
  }

  private async wooRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = this.getApiUrl(endpoint);
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: this.getAuthHeader(),
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`WooCommerce API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const system = await this.wooRequest<{ store_id: number; settings: { wc_admin_enabled: boolean } }>("system_status");
      const products = await this.wooRequest<any[]>("products?per_page=1");
      
      return {
        success: true,
        message: "Connected to WooCommerce successfully",
        details: {
          productsCount: products.length > 0 ? -1 : 0,
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
        message: error.message || "Failed to connect to WooCommerce",
      };
    }
  }

  async fetchProducts(page = 1, pageSize = 50): Promise<PaginatedResult<NormalizedProduct>> {
    try {
      const products = await this.wooRequest<any[]>(
        `products?page=${page}&per_page=${pageSize}`
      );

      const normalizedProducts: NormalizedProduct[] = products.map((p) =>
        this.normalizeProduct(p)
      );

      return {
        items: normalizedProducts,
        total: -1,
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
      const product = await this.wooRequest<any>(`products/${supplierProductId}`);
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
      const inventoryItems: NormalizedInventory[] = [];
      
      if (supplierProductIds && supplierProductIds.length > 0) {
        for (const productId of supplierProductIds) {
          const product = await this.wooRequest<any>(`products/${productId}`);
          
          if (product.type === "variable" && product.variations?.length) {
            const variations = await this.wooRequest<any[]>(`products/${productId}/variations`);
            for (const v of variations) {
              inventoryItems.push({
                supplierProductId: productId,
                variantId: String(v.id),
                sku: v.sku || "",
                quantity: v.stock_quantity || 0,
                available: v.in_stock,
              });
            }
          } else {
            inventoryItems.push({
              supplierProductId: productId,
              variantId: productId,
              sku: product.sku || "",
              quantity: product.stock_quantity || 0,
              available: product.in_stock,
            });
          }
        }
      } else {
        const products = await this.wooRequest<any[]>("products?per_page=100");
        for (const product of products) {
          inventoryItems.push({
            supplierProductId: String(product.id),
            variantId: String(product.id),
            sku: product.sku || "",
            quantity: product.stock_quantity || 0,
            available: product.in_stock,
          });
        }
      }

      return inventoryItems;
    } catch (error: any) {
      throw new Error(`Failed to fetch inventory: ${error.message}`);
    }
  }

  async createOrder(order: OrderCreateRequest): Promise<OrderCreateResponse> {
    try {
      const wooOrder = {
        payment_method: "manual",
        payment_method_title: "B2B Payment",
        set_paid: false,
        billing: {
          first_name: order.shippingAddress.firstName,
          last_name: order.shippingAddress.lastName,
          address_1: order.shippingAddress.address1,
          address_2: order.shippingAddress.address2 || "",
          city: order.shippingAddress.city,
          state: order.shippingAddress.province || "",
          postcode: order.shippingAddress.zip,
          country: order.shippingAddress.country,
          phone: order.shippingAddress.phone || "",
          email: order.shippingAddress.email || "",
        },
        shipping: {
          first_name: order.shippingAddress.firstName,
          last_name: order.shippingAddress.lastName,
          address_1: order.shippingAddress.address1,
          address_2: order.shippingAddress.address2 || "",
          city: order.shippingAddress.city,
          state: order.shippingAddress.province || "",
          postcode: order.shippingAddress.zip,
          country: order.shippingAddress.country,
        },
        line_items: order.items.map((item) => ({
          product_id: parseInt(item.supplierProductId),
          variation_id: item.variantId !== item.supplierProductId ? parseInt(item.variantId) : undefined,
          quantity: item.quantity,
        })),
        customer_note: order.note,
      };

      const response = await this.wooRequest<{ id: number; status: string; total: string }>(
        "orders",
        {
          method: "POST",
          body: JSON.stringify(wooOrder),
        }
      );

      return {
        supplierOrderId: String(response.id),
        status: response.status,
        totalCost: parseFloat(response.total),
        rawResponse: response,
      };
    } catch (error: any) {
      throw new Error(`Failed to create order: ${error.message}`);
    }
  }

  async getOrder(supplierOrderId: string): Promise<NormalizedOrder | null> {
    try {
      const order = await this.wooRequest<any>(`orders/${supplierOrderId}`);

      return {
        supplierOrderId: String(order.id),
        status: this.mapOrderStatus(order.status),
        items: order.line_items.map((item: any) => ({
          supplierProductId: String(item.product_id),
          variantId: String(item.variation_id || item.product_id),
          quantity: item.quantity,
          price: parseFloat(item.price),
        })),
        totalCost: parseFloat(order.total),
        createdAt: order.date_created,
        updatedAt: order.date_modified,
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
      const notes = await this.wooRequest<any[]>(`orders/${supplierOrderId}/notes`);
      
      const trackingNote = notes.find((note: any) => 
        note.note.toLowerCase().includes("tracking") ||
        note.note.toLowerCase().includes("shipped")
      );

      if (!trackingNote) {
        return null;
      }

      const trackingMatch = trackingNote.note.match(/tracking[:\s]+([A-Z0-9]+)/i);
      
      return {
        trackingNumber: trackingMatch?.[1] || "",
        carrier: "Unknown",
        status: "in_transit",
        lastUpdate: trackingNote.date_created,
      };
    } catch (error: any) {
      return null;
    }
  }

  private normalizeProduct(product: any): NormalizedProduct {
    const variants = product.type === "variable" ? [] : [{
      id: String(product.id),
      sku: product.sku || "",
      title: "Default",
      price: parseFloat(product.price) || 0,
      compareAtPrice: product.regular_price !== product.price ? parseFloat(product.regular_price) : undefined,
      cost: 0,
      inventoryQuantity: product.stock_quantity || 0,
    }];

    return {
      supplierProductId: String(product.id),
      title: product.name,
      description: product.description || product.short_description || "",
      category: product.categories?.[0]?.name || "Uncategorized",
      tags: product.tags?.map((t: any) => t.name) || [],
      images: (product.images || []).map((img: any, idx: number) => ({
        url: img.src,
        alt: img.alt || product.name,
        position: idx + 1,
      })),
      variants,
      supplierSku: product.sku || "",
      supplierPrice: parseFloat(product.price) || 0,
    };
  }

  private mapOrderStatus(status: string): NormalizedOrder["status"] {
    const statusMap: Record<string, NormalizedOrder["status"]> = {
      pending: "pending",
      processing: "processing",
      "on-hold": "confirmed",
      completed: "delivered",
      cancelled: "cancelled",
      refunded: "cancelled",
      failed: "cancelled",
    };
    return statusMap[status] || "pending";
  }
}
