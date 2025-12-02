import { z } from "zod";

// ==================== ENUMS ====================
export const UserRole = z.enum(["admin", "merchant", "staff"]);
export type UserRole = z.infer<typeof UserRole>;

export const SubscriptionStatus = z.enum(["trial", "active", "cancelled", "expired", "past_due"]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;

export const SupplierType = z.enum(["gigab2b", "shopify", "amazon", "woocommerce", "custom"]);
export type SupplierType = z.infer<typeof SupplierType>;

export const ProductStatus = z.enum(["draft", "active", "archived"]);
export type ProductStatus = z.infer<typeof ProductStatus>;

export const SyncStatus = z.enum(["pending", "synced", "failed"]);
export type SyncStatus = z.infer<typeof SyncStatus>;

export const OrderStatus = z.enum(["pending", "processing", "completed", "cancelled", "refunded"]);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const PaymentStatus = z.enum(["pending", "paid", "refunded", "failed"]);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

export const FulfillmentStatus = z.enum(["unfulfilled", "partial", "fulfilled", "cancelled"]);
export type FulfillmentStatus = z.infer<typeof FulfillmentStatus>;

export const ItemFulfillmentStatus = z.enum(["pending", "processing", "shipped", "delivered", "cancelled"]);
export type ItemFulfillmentStatus = z.infer<typeof ItemFulfillmentStatus>;

export const CustomerTier = z.enum(["bronze", "silver", "gold", "platinum"]);
export type CustomerTier = z.infer<typeof CustomerTier>;

export const PricingRuleType = z.enum(["fixed", "percentage"]);
export type PricingRuleType = z.infer<typeof PricingRuleType>;

export const BillingInterval = z.enum(["monthly", "yearly"]);
export type BillingInterval = z.infer<typeof BillingInterval>;

// ==================== USER SCHEMA ====================
export const addressSchema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  zipCode: z.string().optional(),
});
export type Address = z.infer<typeof addressSchema>;

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  password: z.string(),
  name: z.string(),
  role: UserRole,
  merchantId: z.string().nullable(),
  avatar: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().default(true),
  isEmailVerified: z.boolean().default(false),
  permissions: z.array(z.string()).default([]),
  lastLogin: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type User = z.infer<typeof userSchema>;

export const insertUserSchema = userSchema.omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;

// ==================== MERCHANT SCHEMA ====================
export const shopifyStoreSchema = z.object({
  domain: z.string().optional(),
  accessToken: z.string().optional(),
  scopes: z.array(z.string()).default([]),
  installedAt: z.string().optional(),
  isConnected: z.boolean().default(false),
});

export const merchantSettingsSchema = z.object({
  branding: z.object({
    logo: z.string().optional(),
    primaryColor: z.string().default("#3b82f6"),
    companyName: z.string().optional(),
  }).default({}),
  notifications: z.object({
    emailOnOrder: z.boolean().default(true),
    emailOnLowStock: z.boolean().default(true),
    smsNotifications: z.boolean().default(false),
  }).default({}),
  defaultPricingRule: z.object({
    type: PricingRuleType.default("percentage"),
    value: z.number().default(20),
  }).default({}),
  autoFulfillment: z.boolean().default(false),
  autoSyncInventory: z.boolean().default(true),
});

export const merchantStatsSchema = z.object({
  totalOrders: z.number().default(0),
  totalRevenue: z.number().default(0),
  totalProducts: z.number().default(0),
});

export const merchantSchema = z.object({
  id: z.string(),
  businessName: z.string(),
  ownerEmail: z.string().email(),
  ownerId: z.string(),
  businessType: z.string().optional(),
  taxId: z.string().optional(),
  address: addressSchema.optional(),
  shopifyStore: shopifyStoreSchema.default({}),
  subscriptionPlanId: z.string().optional(),
  subscriptionStatus: SubscriptionStatus.default("trial"),
  productLimit: z.number().default(50),
  currentProductCount: z.number().default(0),
  trialEndsAt: z.string().optional(),
  subscriptionEndsAt: z.string().optional(),
  stripeCustomerId: z.string().optional(),
  stripeSubscriptionId: z.string().optional(),
  settings: merchantSettingsSchema.default({}),
  isActive: z.boolean().default(true),
  isSuspended: z.boolean().default(false),
  suspensionReason: z.string().optional(),
  stats: merchantStatsSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Merchant = z.infer<typeof merchantSchema>;

export const insertMerchantSchema = merchantSchema.omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMerchant = z.infer<typeof insertMerchantSchema>;

// ==================== SUPPLIER SCHEMA ====================
export const supplierCredentialsSchema = z.object({
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  baseUrl: z.string().optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
});

export const supplierConfigSchema = z.object({
  productSyncEnabled: z.boolean().default(true),
  inventorySyncEnabled: z.boolean().default(true),
  orderFulfillmentEnabled: z.boolean().default(true),
  syncInterval: z.number().default(60),
  lastSyncAt: z.string().optional(),
  nextSyncAt: z.string().optional(),
});

export const supplierStatsSchema = z.object({
  totalProducts: z.number().default(0),
  totalOrders: z.number().default(0),
  avgFulfillmentTime: z.number().default(0),
  successRate: z.number().default(100),
});

export const supplierSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: SupplierType,
  description: z.string().optional(),
  logo: z.string().optional(),
  apiCredentials: supplierCredentialsSchema.default({}),
  config: supplierConfigSchema.default({}),
  isActive: z.boolean().default(true),
  rating: z.number().default(5),
  stats: supplierStatsSchema.default({}),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Supplier = z.infer<typeof supplierSchema>;

export const insertSupplierSchema = supplierSchema.omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;

// ==================== PRODUCT SCHEMA ====================
export const productImageSchema = z.object({
  url: z.string(),
  alt: z.string().optional(),
  position: z.number().default(0),
});

export const productVariantSchema = z.object({
  id: z.string(),
  sku: z.string(),
  barcode: z.string().optional(),
  title: z.string(),
  price: z.number(),
  compareAtPrice: z.number().optional(),
  cost: z.number(),
  inventoryQuantity: z.number().default(0),
  weight: z.number().optional(),
  weightUnit: z.string().default("kg"),
  options: z.object({
    size: z.string().optional(),
    color: z.string().optional(),
    material: z.string().optional(),
  }).optional(),
  image: z.string().optional(),
});

export const pricingRuleSchema = z.object({
  type: PricingRuleType,
  value: z.number(),
});

export const inventorySchema = z.object({
  quantity: z.number().default(0),
  lowStockThreshold: z.number().default(10),
  trackInventory: z.boolean().default(true),
});

export const productSchema = z.object({
  id: z.string(),
  merchantId: z.string().nullable(),
  supplierId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).default([]),
  images: z.array(productImageSchema).default([]),
  variants: z.array(productVariantSchema).default([]),
  supplierProductId: z.string().optional(),
  supplierSku: z.string().optional(),
  supplierPrice: z.number(),
  merchantPrice: z.number().optional(),
  pricingRule: pricingRuleSchema.optional(),
  inventory: inventorySchema.default({}),
  status: ProductStatus.default("active"),
  isGlobal: z.boolean().default(true),
  shopifyProductId: z.string().optional(),
  syncStatus: SyncStatus.default("synced"),
  lastSyncedAt: z.string().optional(),
  importedAt: z.string().optional(),
  createdBy: z.string().default("system"),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Product = z.infer<typeof productSchema>;

export const insertProductSchema = productSchema.omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;

// ==================== ORDER SCHEMA ====================
export const shippingAddressSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  address1: z.string(),
  address2: z.string().optional(),
  city: z.string(),
  province: z.string().optional(),
  country: z.string(),
  zip: z.string(),
  phone: z.string().optional(),
});

export const orderItemSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional(),
  supplierId: z.string(),
  title: z.string(),
  variantTitle: z.string().optional(),
  sku: z.string().optional(),
  quantity: z.number(),
  price: z.number(),
  cost: z.number(),
  profit: z.number(),
  fulfillmentStatus: ItemFulfillmentStatus.default("pending"),
  trackingNumber: z.string().optional(),
  trackingUrl: z.string().optional(),
  carrier: z.string().optional(),
});

export const orderFinancialsSchema = z.object({
  subtotal: z.number(),
  tax: z.number().default(0),
  shipping: z.number().default(0),
  discount: z.number().default(0),
  total: z.number(),
  totalCost: z.number(),
  totalProfit: z.number(),
});

export const orderTimelineSchema = z.object({
  status: z.string(),
  message: z.string(),
  createdAt: z.string(),
  createdBy: z.string().optional(),
});

export const orderSchema = z.object({
  id: z.string(),
  merchantId: z.string(),
  orderNumber: z.string(),
  shopifyOrderId: z.string().optional(),
  customerId: z.string().optional(),
  customerEmail: z.string(),
  shippingAddress: shippingAddressSchema,
  billingAddress: shippingAddressSchema.optional(),
  items: z.array(orderItemSchema),
  financials: orderFinancialsSchema,
  status: OrderStatus.default("pending"),
  paymentStatus: PaymentStatus.default("pending"),
  fulfillmentStatus: FulfillmentStatus.default("unfulfilled"),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
  timeline: z.array(orderTimelineSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Order = z.infer<typeof orderSchema>;

export const insertOrderSchema = orderSchema.omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;

// ==================== CUSTOMER SCHEMA ====================
export const customerStatsSchema = z.object({
  totalOrders: z.number().default(0),
  totalSpent: z.number().default(0),
  averageOrderValue: z.number().default(0),
  lastOrderDate: z.string().optional(),
});

export const customerSchema = z.object({
  id: z.string(),
  merchantId: z.string(),
  shopifyCustomerId: z.string().optional(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().optional(),
  addresses: z.array(shippingAddressSchema).default([]),
  defaultAddress: shippingAddressSchema.optional(),
  tags: z.array(z.string()).default([]),
  stats: customerStatsSchema.default({}),
  loyaltyPoints: z.number().default(0),
  tier: CustomerTier.default("bronze"),
  notes: z.string().optional(),
  isActive: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Customer = z.infer<typeof customerSchema>;

export const insertCustomerSchema = customerSchema.omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

// ==================== SUBSCRIPTION PLAN SCHEMA ====================
export const planPricingSchema = z.object({
  setupFee: z.number().default(0),
  monthly: z.number(),
  yearly: z.number(),
  yearlyDiscount: z.number().default(0),
});

export const planLimitsSchema = z.object({
  products: z.number(),
  orders: z.number(),
  teamMembers: z.number(),
  suppliers: z.number().default(-1),
  apiCallsPerDay: z.number().default(-1),
  storageGB: z.number().default(1),
});

export const planSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  description: z.string(),
  pricing: planPricingSchema,
  limits: planLimitsSchema,
  features: z.array(z.string()).default([]),
  isPopular: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Plan = z.infer<typeof planSchema>;

// ==================== SUBSCRIPTION SCHEMA ====================
export const subscriptionUsageSchema = z.object({
  products: z.number().default(0),
  orders: z.number().default(0),
  teamMembers: z.number().default(0),
  apiCalls: z.number().default(0),
});

export const subscriptionSchema = z.object({
  id: z.string(),
  merchantId: z.string(),
  planId: z.string(),
  status: SubscriptionStatus.default("trial"),
  billingInterval: BillingInterval.default("monthly"),
  currentPeriodStart: z.string(),
  currentPeriodEnd: z.string(),
  trialStart: z.string().optional(),
  trialEnd: z.string().optional(),
  cancelledAt: z.string().optional(),
  stripeSubscriptionId: z.string().optional(),
  stripeCustomerId: z.string().optional(),
  limits: planLimitsSchema,
  usage: subscriptionUsageSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

// ==================== STAFF INVITATION SCHEMA ====================
export const staffInvitationSchema = z.object({
  id: z.string(),
  merchantId: z.string(),
  email: z.string().email(),
  name: z.string(),
  permissions: z.array(z.string()).default([]),
  invitedBy: z.string(),
  status: z.enum(["pending", "accepted", "expired"]).default("pending"),
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type StaffInvitation = z.infer<typeof staffInvitationSchema>;

// ==================== NOTIFICATION SCHEMA ====================
export const notificationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  merchantId: z.string().optional(),
  type: z.enum(["order", "product", "inventory", "system", "billing"]),
  title: z.string(),
  message: z.string(),
  actionUrl: z.string().optional(),
  isRead: z.boolean().default(false),
  readAt: z.string().optional(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof notificationSchema>;

// ==================== ACTIVITY LOG SCHEMA ====================
export const activityLogSchema = z.object({
  id: z.string(),
  userId: z.string(),
  merchantId: z.string().optional(),
  action: z.string(),
  resource: z.string(),
  resourceId: z.string().optional(),
  details: z.record(z.any()).optional(),
  ipAddress: z.string().optional(),
  createdAt: z.string(),
});
export type ActivityLog = z.infer<typeof activityLogSchema>;

// ==================== AUTH SCHEMAS ====================
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  businessName: z.string().min(2, "Business name must be at least 2 characters"),
  businessType: z.string().optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

// ==================== API RESPONSE TYPES ====================
export type AuthResponse = {
  success: boolean;
  message?: string;
  data?: {
    user: Omit<User, "password">;
    merchant?: Merchant;
    token: string;
    refreshToken?: string;
  };
};

export type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
};

// ==================== DASHBOARD STATS ====================
export const adminDashboardStatsSchema = z.object({
  totalMerchants: z.number(),
  activeMerchants: z.number(),
  totalProducts: z.number(),
  totalOrders: z.number(),
  totalRevenue: z.number(),
  ordersToday: z.number(),
  revenueToday: z.number(),
  newMerchantsThisMonth: z.number(),
});
export type AdminDashboardStats = z.infer<typeof adminDashboardStatsSchema>;

export const merchantDashboardStatsSchema = z.object({
  totalProducts: z.number(),
  totalOrders: z.number(),
  totalRevenue: z.number(),
  totalProfit: z.number(),
  totalCustomers: z.number(),
  pendingOrders: z.number(),
  ordersToday: z.number(),
  revenueToday: z.number(),
  profitToday: z.number(),
  productLimit: z.number(),
  currentProductCount: z.number(),
});
export type MerchantDashboardStats = z.infer<typeof merchantDashboardStatsSchema>;
