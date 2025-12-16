import type { 
  SupplierCredentials, 
  ShopifyCredentials, 
  GigaB2BCredentials, 
  WooCommerceCredentials, 
  CustomApiCredentials,
  SupplierCapabilities 
} from "@shared/schema";

export interface NormalizedProduct {
  supplierProductId: string;
  title: string;
  description: string;
  category?: string;
  tags: string[];
  images: { url: string; alt?: string; position?: number }[];
  variants: {
    id: string;
    sku: string;
    barcode?: string;
    title: string;
    price: number;
    compareAtPrice?: number;
    cost: number;
    inventoryQuantity: number;
    weight?: number;
    weightUnit?: string;
    options?: { size?: string; color?: string; material?: string };
    image?: string;
  }[];
  supplierSku: string;
  supplierPrice: number;
  fulfillmentFee?: number;
}

export interface NormalizedInventory {
  supplierProductId: string;
  variantId: string;
  sku: string;
  quantity: number;
  available: boolean;
}

export interface OrderCreateRequest {
  items: {
    supplierProductId: string;
    variantId: string;
    sku: string;
    quantity: number;
    price: number;
  }[];
  shippingAddress: {
    firstName: string;
    lastName: string;
    address1: string;
    address2?: string;
    city: string;
    province?: string;
    country: string;
    zip: string;
    phone?: string;
    email?: string;
  };
  note?: string;
}

export interface OrderCreateResponse {
  supplierOrderId: string;
  status: string;
  totalCost: number;
  message?: string;
  rawResponse?: unknown;
}

export interface NormalizedOrder {
  supplierOrderId: string;
  status: "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled";
  items: {
    supplierProductId: string;
    variantId: string;
    quantity: number;
    price: number;
    fulfillmentStatus?: string;
  }[];
  totalCost: number;
  createdAt: string;
  updatedAt?: string;
}

export interface TrackingInfo {
  trackingNumber: string;
  carrier: string;
  trackingUrl?: string;
  status: "pending" | "in_transit" | "out_for_delivery" | "delivered" | "exception";
  estimatedDelivery?: string;
  lastUpdate?: string;
  events?: {
    date: string;
    status: string;
    location?: string;
    description?: string;
  }[];
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  details?: {
    productsCount?: number;
    apiVersion?: string;
    storeName?: string;
    capabilities?: SupplierCapabilities;
  };
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  nextCursor?: string;
}

export interface SupplierAdapter {
  readonly type: "shopify" | "gigab2b" | "woocommerce" | "custom" | "amazon";
  
  testConnection(): Promise<ConnectionTestResult>;
  
  fetchProducts(page?: number, pageSize?: number): Promise<PaginatedResult<NormalizedProduct>>;
  
  fetchProduct(supplierProductId: string): Promise<NormalizedProduct | null>;
  
  fetchInventory(supplierProductIds?: string[]): Promise<NormalizedInventory[]>;
  
  createOrder(order: OrderCreateRequest): Promise<OrderCreateResponse>;
  
  getOrder(supplierOrderId: string): Promise<NormalizedOrder | null>;
  
  getTracking(supplierOrderId: string): Promise<TrackingInfo | null>;
}

export abstract class BaseAdapter implements SupplierAdapter {
  abstract readonly type: "shopify" | "gigab2b" | "woocommerce" | "custom" | "amazon";
  
  constructor(protected credentials: SupplierCredentials) {}
  
  abstract testConnection(): Promise<ConnectionTestResult>;
  abstract fetchProducts(page?: number, pageSize?: number): Promise<PaginatedResult<NormalizedProduct>>;
  abstract fetchProduct(supplierProductId: string): Promise<NormalizedProduct | null>;
  abstract fetchInventory(supplierProductIds?: string[]): Promise<NormalizedInventory[]>;
  abstract createOrder(order: OrderCreateRequest): Promise<OrderCreateResponse>;
  abstract getOrder(supplierOrderId: string): Promise<NormalizedOrder | null>;
  abstract getTracking(supplierOrderId: string): Promise<TrackingInfo | null>;
}

export type { 
  ShopifyCredentials, 
  GigaB2BCredentials, 
  WooCommerceCredentials, 
  CustomApiCredentials,
  SupplierCredentials,
  SupplierCapabilities 
};
