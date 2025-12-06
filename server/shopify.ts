import type { InsertProduct } from "@shared/schema";

// Order interfaces
interface ShopifyOrder {
  id: number;
  name: string;
  email: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  currency: string;
  created_at: string;
  updated_at: string;
  line_items: ShopifyLineItem[];
  shipping_address: ShopifyAddress | null;
  billing_address: ShopifyAddress | null;
  fulfillments: ShopifyFulfillment[];
  customer: ShopifyCustomer | null;
}

interface ShopifyLineItem {
  id: number;
  product_id: number;
  variant_id: number;
  title: string;
  quantity: number;
  price: string;
  sku: string;
  fulfillment_status: string | null;
}

interface ShopifyAddress {
  first_name: string;
  last_name: string;
  address1: string;
  address2: string | null;
  city: string;
  province: string;
  country: string;
  zip: string;
  phone: string | null;
}

interface ShopifyCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
}

interface ShopifyFulfillment {
  id: number;
  order_id: number;
  status: string;
  tracking_company: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  created_at: string;
  updated_at: string;
}

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

  // ============================================
  // PRODUCT FEATURES (GigaB2B-style)
  // ============================================

  /**
   * Product Details - Access details of a single product
   */
  async getProductDetails(productId: string): Promise<{
    id: string;
    title: string;
    description: string;
    vendor: string;
    productType: string;
    tags: string[];
    status: string;
    images: { url: string; alt: string | null; position: number }[];
    variants: { id: string; title: string; sku: string; price: number; inventoryQuantity: number }[];
    createdAt: string;
    updatedAt: string;
  }> {
    const { data } = await this.fetch<{ product: ShopifyProduct }>(`/products/${productId}.json`);
    const product = data.product;

    return {
      id: product.id.toString(),
      title: product.title,
      description: product.body_html || "",
      vendor: product.vendor,
      productType: product.product_type,
      tags: product.tags ? product.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
      status: product.status,
      images: product.images.map(img => ({
        url: img.src,
        alt: img.alt,
        position: img.position,
      })),
      variants: product.variants.map(v => ({
        id: v.id.toString(),
        title: v.title,
        sku: v.sku || "",
        price: parseFloat(v.price),
        inventoryQuantity: v.inventory_quantity,
      })),
      createdAt: product.created_at,
      updatedAt: product.updated_at,
    };
  }

  /**
   * Product Price - Access B2B product prices
   */
  async getProductPrice(productId: string): Promise<{
    productId: string;
    title: string;
    variants: {
      variantId: string;
      title: string;
      sku: string;
      price: number;
      compareAtPrice: number | null;
      costPerItem: number | null;
    }[];
  }> {
    const { data } = await this.fetch<{ product: ShopifyProduct }>(`/products/${productId}.json`);
    const product = data.product;

    return {
      productId: product.id.toString(),
      title: product.title,
      variants: product.variants.map(v => ({
        variantId: v.id.toString(),
        title: v.title,
        sku: v.sku || "",
        price: parseFloat(v.price),
        compareAtPrice: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
        costPerItem: null, // Shopify doesn't expose cost via this API
      })),
    };
  }

  /**
   * Product Inventory - Access inventory information
   */
  async getProductInventory(productId: string): Promise<{
    productId: string;
    title: string;
    totalInventory: number;
    variants: {
      variantId: string;
      title: string;
      sku: string;
      inventoryQuantity: number;
      inventoryPolicy: string;
    }[];
  }> {
    const { data } = await this.fetch<{ product: ShopifyProduct }>(`/products/${productId}.json`);
    const product = data.product;

    const totalInventory = product.variants.reduce((sum, v) => sum + v.inventory_quantity, 0);

    return {
      productId: product.id.toString(),
      title: product.title,
      totalInventory,
      variants: product.variants.map(v => ({
        variantId: v.id.toString(),
        title: v.title,
        sku: v.sku || "",
        inventoryQuantity: v.inventory_quantity,
        inventoryPolicy: "deny", // Default policy
      })),
    };
  }

  // ============================================
  // ORDER FEATURES (GigaB2B-style)
  // ============================================

  /**
   * Sync Drop Shipping orders - Get orders for drop shipping
   */
  async getDropShippingOrders(status?: string, limit: number = 50): Promise<{
    orders: {
      id: string;
      orderNumber: string;
      email: string;
      financialStatus: string;
      fulfillmentStatus: string | null;
      totalPrice: number;
      currency: string;
      createdAt: string;
      lineItems: {
        productId: string;
        variantId: string;
        title: string;
        quantity: number;
        price: number;
        sku: string;
      }[];
      shippingAddress: {
        name: string;
        address1: string;
        address2: string | null;
        city: string;
        province: string;
        country: string;
        zip: string;
        phone: string | null;
      } | null;
    }[];
  }> {
    let endpoint = `/orders.json?limit=${limit}&status=any`;
    if (status) {
      endpoint += `&fulfillment_status=${status}`;
    }

    const { data } = await this.fetch<{ orders: ShopifyOrder[] }>(endpoint);

    return {
      orders: data.orders.map(order => ({
        id: order.id.toString(),
        orderNumber: order.name,
        email: order.email,
        financialStatus: order.financial_status,
        fulfillmentStatus: order.fulfillment_status,
        totalPrice: parseFloat(order.total_price),
        currency: order.currency,
        createdAt: order.created_at,
        lineItems: order.line_items.map(item => ({
          productId: item.product_id.toString(),
          variantId: item.variant_id.toString(),
          title: item.title,
          quantity: item.quantity,
          price: parseFloat(item.price),
          sku: item.sku || "",
        })),
        shippingAddress: order.shipping_address ? {
          name: `${order.shipping_address.first_name} ${order.shipping_address.last_name}`,
          address1: order.shipping_address.address1,
          address2: order.shipping_address.address2,
          city: order.shipping_address.city,
          province: order.shipping_address.province,
          country: order.shipping_address.country,
          zip: order.shipping_address.zip,
          phone: order.shipping_address.phone,
        } : null,
      })),
    };
  }

  /**
   * Order Status - Query order status by order ID
   */
  async getOrderStatus(orderId: string): Promise<{
    orderId: string;
    orderNumber: string;
    financialStatus: string;
    fulfillmentStatus: string | null;
    createdAt: string;
    updatedAt: string;
    lineItems: {
      title: string;
      quantity: number;
      fulfillmentStatus: string | null;
    }[];
    fulfillments: {
      id: string;
      status: string;
      trackingCompany: string | null;
      trackingNumber: string | null;
      trackingUrl: string | null;
      createdAt: string;
    }[];
  }> {
    const { data } = await this.fetch<{ order: ShopifyOrder }>(`/orders/${orderId}.json`);
    const order = data.order;

    return {
      orderId: order.id.toString(),
      orderNumber: order.name,
      financialStatus: order.financial_status,
      fulfillmentStatus: order.fulfillment_status,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      lineItems: order.line_items.map(item => ({
        title: item.title,
        quantity: item.quantity,
        fulfillmentStatus: item.fulfillment_status,
      })),
      fulfillments: order.fulfillments.map(f => ({
        id: f.id.toString(),
        status: f.status,
        trackingCompany: f.tracking_company,
        trackingNumber: f.tracking_number,
        trackingUrl: f.tracking_url,
        createdAt: f.created_at,
      })),
    };
  }

  // ============================================
  // SHIPPING FEATURES (GigaB2B-style)
  // ============================================

  /**
   * Tracking Number - Query available tracking for an order
   */
  async getTrackingNumber(orderId: string): Promise<{
    orderId: string;
    orderNumber: string;
    trackingInfo: {
      fulfillmentId: string;
      trackingCompany: string | null;
      trackingNumber: string | null;
      trackingUrl: string | null;
      status: string;
      createdAt: string;
    }[];
  }> {
    const { data } = await this.fetch<{ order: ShopifyOrder }>(`/orders/${orderId}.json`);
    const order = data.order;

    return {
      orderId: order.id.toString(),
      orderNumber: order.name,
      trackingInfo: order.fulfillments.map(f => ({
        fulfillmentId: f.id.toString(),
        trackingCompany: f.tracking_company,
        trackingNumber: f.tracking_number,
        trackingUrl: f.tracking_url,
        status: f.status,
        createdAt: f.created_at,
      })),
    };
  }

  /**
   * Create fulfillment with tracking (for drop shipping)
   */
  async createFulfillment(orderId: string, trackingNumber: string, trackingCompany?: string, trackingUrl?: string): Promise<{
    success: boolean;
    fulfillmentId?: string;
    error?: string;
  }> {
    try {
      const url = `https://${this.storeUrl}/admin/api/${this.apiVersion}/orders/${orderId}/fulfillments.json`;
      
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": this.accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fulfillment: {
            tracking_number: trackingNumber,
            tracking_company: trackingCompany,
            tracking_url: trackingUrl,
            notify_customer: true,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `Shopify API error: ${response.status} - ${errorText}` };
      }

      const data = await response.json() as { fulfillment: { id: number } };
      return { success: true, fulfillmentId: data.fulfillment.id.toString() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
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
