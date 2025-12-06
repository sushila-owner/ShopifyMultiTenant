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
  ShopifyCredentials,
} from "./types";

export class ShopifyAdapter extends BaseAdapter {
  readonly type = "shopify" as const;
  private storeDomain: string;
  private accessToken: string;
  private apiVersion = "2024-01";

  constructor(credentials: ShopifyCredentials) {
    super(credentials);
    this.storeDomain = credentials.storeDomain;
    this.accessToken = credentials.accessToken;
  }

  private getApiUrl(endpoint: string): string {
    const domain = this.storeDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${domain}/admin/api/${this.apiVersion}/${endpoint}`;
  }

  private async shopifyRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = this.getApiUrl(endpoint);
    const response = await fetch(url, {
      ...options,
      headers: {
        "X-Shopify-Access-Token": this.accessToken,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Shopify API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const shop = await this.shopifyRequest<{ shop: { name: string; id: number } }>("shop.json");
      const productCount = await this.shopifyRequest<{ count: number }>("products/count.json");
      
      return {
        success: true,
        message: `Connected to ${shop.shop.name}`,
        details: {
          storeName: shop.shop.name,
          productsCount: productCount.count,
          apiVersion: this.apiVersion,
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
        message: error.message || "Failed to connect to Shopify",
      };
    }
  }

  async fetchProducts(page = 1, pageSize = 50): Promise<PaginatedResult<NormalizedProduct>> {
    try {
      const products = await this.shopifyRequest<{
        products: any[];
      }>(`products.json?limit=${pageSize}&page=${page}`);

      const normalizedProducts: NormalizedProduct[] = products.products.map((p) =>
        this.normalizeProduct(p)
      );

      const countResponse = await this.shopifyRequest<{ count: number }>("products/count.json");

      return {
        items: normalizedProducts,
        total: countResponse.count,
        page,
        pageSize,
        hasMore: page * pageSize < countResponse.count,
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch products: ${error.message}`);
    }
  }

  async fetchProduct(supplierProductId: string): Promise<NormalizedProduct | null> {
    try {
      const response = await this.shopifyRequest<{ product: any }>(
        `products/${supplierProductId}.json`
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
      const inventoryItems: NormalizedInventory[] = [];
      
      if (supplierProductIds && supplierProductIds.length > 0) {
        for (const productId of supplierProductIds) {
          const product = await this.fetchProduct(productId);
          if (product) {
            for (const variant of product.variants) {
              inventoryItems.push({
                supplierProductId: productId,
                variantId: variant.id,
                sku: variant.sku,
                quantity: variant.inventoryQuantity,
                available: variant.inventoryQuantity > 0,
              });
            }
          }
        }
      } else {
        const response = await this.shopifyRequest<{
          inventory_levels: { inventory_item_id: number; available: number }[];
        }>("inventory_levels.json?limit=250");
        
        for (const level of response.inventory_levels) {
          inventoryItems.push({
            supplierProductId: "",
            variantId: String(level.inventory_item_id),
            sku: "",
            quantity: level.available,
            available: level.available > 0,
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
      const shopifyOrder = {
        order: {
          line_items: order.items.map((item) => ({
            variant_id: item.variantId,
            quantity: item.quantity,
            price: item.price,
          })),
          shipping_address: {
            first_name: order.shippingAddress.firstName,
            last_name: order.shippingAddress.lastName,
            address1: order.shippingAddress.address1,
            address2: order.shippingAddress.address2,
            city: order.shippingAddress.city,
            province: order.shippingAddress.province,
            country: order.shippingAddress.country,
            zip: order.shippingAddress.zip,
            phone: order.shippingAddress.phone,
          },
          note: order.note,
          financial_status: "pending",
        },
      };

      const response = await this.shopifyRequest<{ order: { id: number; total_price: string } }>(
        "orders.json",
        {
          method: "POST",
          body: JSON.stringify(shopifyOrder),
        }
      );

      return {
        supplierOrderId: String(response.order.id),
        status: "submitted",
        totalCost: parseFloat(response.order.total_price),
        rawResponse: response.order,
      };
    } catch (error: any) {
      throw new Error(`Failed to create order: ${error.message}`);
    }
  }

  async getOrder(supplierOrderId: string): Promise<NormalizedOrder | null> {
    try {
      const response = await this.shopifyRequest<{ order: any }>(
        `orders/${supplierOrderId}.json`
      );

      const order = response.order;
      return {
        supplierOrderId: String(order.id),
        status: this.mapOrderStatus(order.fulfillment_status),
        items: order.line_items.map((item: any) => ({
          supplierProductId: String(item.product_id),
          variantId: String(item.variant_id),
          quantity: item.quantity,
          price: parseFloat(item.price),
          fulfillmentStatus: item.fulfillment_status,
        })),
        totalCost: parseFloat(order.total_price),
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
      const response = await this.shopifyRequest<{ fulfillments: any[] }>(
        `orders/${supplierOrderId}/fulfillments.json`
      );

      if (!response.fulfillments || response.fulfillments.length === 0) {
        return null;
      }

      const fulfillment = response.fulfillments[0];
      return {
        trackingNumber: fulfillment.tracking_number || "",
        carrier: fulfillment.tracking_company || "",
        trackingUrl: fulfillment.tracking_url || undefined,
        status: this.mapTrackingStatus(fulfillment.shipment_status),
        lastUpdate: fulfillment.updated_at,
      };
    } catch (error: any) {
      if (error.message.includes("404")) {
        return null;
      }
      throw error;
    }
  }

  private normalizeProduct(product: any): NormalizedProduct {
    return {
      supplierProductId: String(product.id),
      title: product.title,
      description: product.body_html || "",
      category: product.product_type || "Uncategorized",
      tags: product.tags ? product.tags.split(", ") : [],
      images: (product.images || []).map((img: any, idx: number) => ({
        url: img.src,
        alt: img.alt || product.title,
        position: idx + 1,
      })),
      variants: (product.variants || []).map((v: any) => ({
        id: String(v.id),
        sku: v.sku || "",
        barcode: v.barcode,
        title: v.title,
        price: parseFloat(v.price),
        compareAtPrice: v.compare_at_price ? parseFloat(v.compare_at_price) : undefined,
        cost: v.cost ? parseFloat(v.cost) : 0,
        inventoryQuantity: v.inventory_quantity || 0,
        weight: v.weight,
        weightUnit: v.weight_unit,
      })),
      supplierSku: product.variants?.[0]?.sku || "",
      supplierPrice: product.variants?.[0] ? parseFloat(product.variants[0].price) : 0,
    };
  }

  private mapOrderStatus(status: string | null): NormalizedOrder["status"] {
    switch (status) {
      case "fulfilled":
        return "shipped";
      case "partial":
        return "processing";
      case null:
        return "pending";
      default:
        return "pending";
    }
  }

  private mapTrackingStatus(status: string | null): TrackingInfo["status"] {
    switch (status) {
      case "delivered":
        return "delivered";
      case "in_transit":
        return "in_transit";
      case "out_for_delivery":
        return "out_for_delivery";
      case "failure":
        return "exception";
      default:
        return "pending";
    }
  }
}
