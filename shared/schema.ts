import { pgTable, text, integer, boolean, timestamp, jsonb, real, serial, pgEnum, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ==================== ENUMS ====================
export const userRoleEnum = pgEnum("user_role", ["admin", "merchant", "staff"]);
export const authProviderEnum = pgEnum("auth_provider", ["email", "phone", "google"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["trial", "active", "cancelled", "expired", "past_due", "free_for_life"]);
export const adPlatformEnum = pgEnum("ad_platform", ["instagram", "facebook", "tiktok", "pinterest", "general"]);
export const supplierTypeEnum = pgEnum("supplier_type", ["gigab2b", "shopify", "amazon", "woocommerce", "custom"]);
export const productStatusEnum = pgEnum("product_status", ["draft", "active", "archived"]);
export const syncStatusEnum = pgEnum("sync_status", ["pending", "synced", "failed"]);
export const orderStatusEnum = pgEnum("order_status", ["pending", "processing", "completed", "cancelled", "refunded"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "paid", "refunded", "failed"]);
export const fulfillmentStatusEnum = pgEnum("fulfillment_status", ["unfulfilled", "partial", "fulfilled", "cancelled"]);
export const itemFulfillmentStatusEnum = pgEnum("item_fulfillment_status", ["pending", "processing", "shipped", "delivered", "cancelled"]);
export const customerTierEnum = pgEnum("customer_tier", ["bronze", "silver", "gold", "platinum"]);
export const pricingRuleTypeEnum = pgEnum("pricing_rule_type", ["fixed", "percentage"]);
export const billingIntervalEnum = pgEnum("billing_interval", ["monthly", "yearly"]);
export const notificationTypeEnum = pgEnum("notification_type", ["order", "product", "inventory", "system", "billing"]);
export const invitationStatusEnum = pgEnum("invitation_status", ["pending", "accepted", "expired"]);

// ==================== PLANS TABLE ====================
export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description").notNull(),
  monthlyPrice: integer("monthly_price").notNull(),
  yearlyPrice: integer("yearly_price").notNull(),
  productLimit: integer("product_limit").notNull(),
  orderLimit: integer("order_limit").notNull().default(-1),
  teamMemberLimit: integer("team_member_limit").notNull(),
  supplierLimit: integer("supplier_limit").default(-1),
  dailyAdsLimit: integer("daily_ads_limit").default(0),
  hasAiAds: boolean("has_ai_ads").default(false),
  hasVideoAds: boolean("has_video_ads").default(false),
  isWhiteLabel: boolean("is_white_label").default(false),
  hasVipSupport: boolean("has_vip_support").default(false),
  badge: text("badge"),
  features: jsonb("features").$type<string[]>().default([]),
  isPopular: boolean("is_popular").default(false),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ==================== USERS TABLE ====================
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").unique(),
  password: text("password"),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull().default("merchant"),
  merchantId: integer("merchant_id"),
  avatar: text("avatar"),
  phone: text("phone").unique(),
  authProvider: authProviderEnum("auth_provider").default("email"),
  googleId: text("google_id").unique(),
  isActive: boolean("is_active").default(true),
  isEmailVerified: boolean("is_email_verified").default(false),
  isPhoneVerified: boolean("is_phone_verified").default(false),
  emailVerifiedAt: timestamp("email_verified_at"),
  phoneVerifiedAt: timestamp("phone_verified_at"),
  permissions: jsonb("permissions").$type<string[]>().default([]),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  emailIdx: index("users_email_idx").on(table.email),
  phoneIdx: index("users_phone_idx").on(table.phone),
  merchantIdx: index("users_merchant_idx").on(table.merchantId),
  googleIdx: index("users_google_idx").on(table.googleId),
}));

// ==================== OTP VERIFICATION TABLE ====================
export const otpVerifications = pgTable("otp_verifications", {
  id: serial("id").primaryKey(),
  identifier: text("identifier").notNull(),
  type: text("type").notNull(),
  code: text("code").notNull(),
  attempts: integer("attempts").default(0),
  expiresAt: timestamp("expires_at").notNull(),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  identifierIdx: index("otp_identifier_idx").on(table.identifier),
}));

// ==================== MERCHANTS TABLE ====================
export const merchants = pgTable("merchants", {
  id: serial("id").primaryKey(),
  businessName: text("business_name").notNull(),
  ownerEmail: text("owner_email").notNull(),
  ownerId: integer("owner_id").notNull(),
  businessType: text("business_type"),
  taxId: text("tax_id"),
  address: jsonb("address").$type<{
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    zipCode?: string;
  }>(),
  shopifyStore: jsonb("shopify_store").$type<{
    domain?: string;
    accessToken?: string;
    scopes?: string[];
    installedAt?: string;
    isConnected?: boolean;
  }>().default({}),
  subscriptionPlanId: integer("subscription_plan_id"),
  subscriptionStatus: subscriptionStatusEnum("subscription_status").default("trial"),
  productLimit: integer("product_limit").default(50),
  currentProductCount: integer("current_product_count").default(0),
  trialEndsAt: timestamp("trial_ends_at"),
  subscriptionEndsAt: timestamp("subscription_ends_at"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  settings: jsonb("settings").$type<{
    branding?: { logo?: string; primaryColor?: string; companyName?: string };
    notifications?: { emailOnOrder?: boolean; emailOnLowStock?: boolean; smsNotifications?: boolean };
    defaultPricingRule?: { type: string; value: number };
    autoFulfillment?: boolean;
    autoSyncInventory?: boolean;
  }>().default({}),
  isActive: boolean("is_active").default(true),
  isSuspended: boolean("is_suspended").default(false),
  suspensionReason: text("suspension_reason"),
  totalOrders: integer("total_orders").default(0),
  totalRevenue: integer("total_revenue").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  ownerIdx: index("merchants_owner_idx").on(table.ownerId),
}));

// ==================== SUPPLIERS TABLE ====================
export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: supplierTypeEnum("type").notNull(),
  description: text("description"),
  logo: text("logo"),
  apiCredentials: jsonb("api_credentials").$type<{
    apiKey?: string;
    apiSecret?: string;
    baseUrl?: string;
    accessToken?: string;
    refreshToken?: string;
  }>().default({}),
  config: jsonb("config").$type<{
    productSyncEnabled?: boolean;
    inventorySyncEnabled?: boolean;
    orderFulfillmentEnabled?: boolean;
    syncInterval?: number;
    lastSyncAt?: string;
    nextSyncAt?: string;
  }>().default({}),
  isActive: boolean("is_active").default(true),
  rating: real("rating").default(5),
  totalProducts: integer("total_products").default(0),
  totalOrders: integer("total_orders").default(0),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ==================== PRODUCTS TABLE ====================
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id"),
  supplierId: integer("supplier_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"),
  tags: jsonb("tags").$type<string[]>().default([]),
  images: jsonb("images").$type<{ url: string; alt?: string; position?: number }[]>().default([]),
  variants: jsonb("variants").$type<{
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
  }[]>().default([]),
  supplierProductId: text("supplier_product_id"),
  supplierSku: text("supplier_sku"),
  supplierPrice: real("supplier_price").notNull(),
  merchantPrice: real("merchant_price"),
  pricingRule: jsonb("pricing_rule").$type<{ type: string; value: number }>(),
  inventoryQuantity: integer("inventory_quantity").default(0),
  lowStockThreshold: integer("low_stock_threshold").default(10),
  trackInventory: boolean("track_inventory").default(true),
  status: productStatusEnum("status").default("active"),
  isGlobal: boolean("is_global").default(true),
  shopifyProductId: text("shopify_product_id"),
  syncStatus: syncStatusEnum("sync_status").default("synced"),
  lastSyncedAt: timestamp("last_synced_at"),
  importedAt: timestamp("imported_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  merchantIdx: index("products_merchant_idx").on(table.merchantId),
  supplierIdx: index("products_supplier_idx").on(table.supplierId),
  statusIdx: index("products_status_idx").on(table.status),
  globalIdx: index("products_global_idx").on(table.isGlobal),
}));

// ==================== CUSTOMERS TABLE ====================
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull(),
  shopifyCustomerId: text("shopify_customer_id"),
  email: text("email").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone"),
  addresses: jsonb("addresses").$type<{
    firstName: string;
    lastName: string;
    address1: string;
    address2?: string;
    city: string;
    province?: string;
    country: string;
    zip: string;
    phone?: string;
  }[]>().default([]),
  defaultAddress: jsonb("default_address").$type<{
    firstName: string;
    lastName: string;
    address1: string;
    address2?: string;
    city: string;
    province?: string;
    country: string;
    zip: string;
    phone?: string;
  }>(),
  tags: jsonb("tags").$type<string[]>().default([]),
  totalOrders: integer("total_orders").default(0),
  totalSpent: integer("total_spent").default(0),
  averageOrderValue: integer("average_order_value").default(0),
  lastOrderAt: timestamp("last_order_at"),
  loyaltyPoints: integer("loyalty_points").default(0),
  tier: customerTierEnum("tier").default("bronze"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  merchantIdx: index("customers_merchant_idx").on(table.merchantId),
  emailIdx: index("customers_email_idx").on(table.email),
}));

// ==================== ORDERS TABLE ====================
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull(),
  orderNumber: text("order_number").notNull(),
  shopifyOrderId: text("shopify_order_id"),
  customerId: integer("customer_id"),
  customerEmail: text("customer_email").notNull(),
  shippingAddress: jsonb("shipping_address").$type<{
    firstName: string;
    lastName: string;
    address1: string;
    address2?: string;
    city: string;
    province?: string;
    country: string;
    zip: string;
    phone?: string;
  }>().notNull(),
  billingAddress: jsonb("billing_address").$type<{
    firstName: string;
    lastName: string;
    address1: string;
    address2?: string;
    city: string;
    province?: string;
    country: string;
    zip: string;
    phone?: string;
  }>(),
  items: jsonb("items").$type<{
    productId: number;
    variantId?: string;
    supplierId: number;
    title: string;
    variantTitle?: string;
    sku?: string;
    quantity: number;
    price: number;
    cost: number;
    profit: number;
    fulfillmentStatus: string;
    trackingNumber?: string;
    trackingUrl?: string;
    carrier?: string;
  }[]>().notNull(),
  subtotal: integer("subtotal").notNull(),
  tax: integer("tax").default(0),
  shipping: integer("shipping").default(0),
  discount: integer("discount").default(0),
  total: integer("total").notNull(),
  totalCost: integer("total_cost").notNull(),
  totalProfit: integer("total_profit").notNull(),
  status: orderStatusEnum("status").default("pending"),
  paymentStatus: paymentStatusEnum("payment_status").default("pending"),
  fulfillmentStatus: fulfillmentStatusEnum("fulfillment_status").default("unfulfilled"),
  tags: jsonb("tags").$type<string[]>().default([]),
  notes: text("notes"),
  internalNotes: text("internal_notes"),
  timeline: jsonb("timeline").$type<{
    status: string;
    message: string;
    createdAt: string;
    createdBy?: string;
  }[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  merchantIdx: index("orders_merchant_idx").on(table.merchantId),
  statusIdx: index("orders_status_idx").on(table.status),
  customerIdx: index("orders_customer_idx").on(table.customerId),
}));

// ==================== SUBSCRIPTIONS TABLE ====================
export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().unique(),
  planId: integer("plan_id").notNull(),
  planSlug: text("plan_slug").notNull().default("free"),
  status: subscriptionStatusEnum("status").default("trial"),
  billingInterval: billingIntervalEnum("billing_interval").default("monthly"),
  currentPeriodStart: timestamp("current_period_start").notNull(),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  trialStart: timestamp("trial_start"),
  trialEnd: timestamp("trial_end"),
  cancelledAt: timestamp("cancelled_at"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeCustomerId: text("stripe_customer_id"),
  productsUsed: integer("products_used").default(0),
  ordersUsed: integer("orders_used").default(0),
  teamMembersUsed: integer("team_members_used").default(0),
  lifetimeSales: integer("lifetime_sales").default(0),
  progressToFreeForLife: integer("progress_to_free_for_life").default(0),
  adsEnabled: boolean("ads_enabled").default(false),
  dailyAdsLimit: integer("daily_ads_limit").default(0),
  adsGeneratedToday: integer("ads_generated_today").default(0),
  lastAdsGeneratedAt: timestamp("last_ads_generated_at"),
  freeForLifeUnlockedAt: timestamp("free_for_life_unlocked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  merchantIdx: index("subscriptions_merchant_idx").on(table.merchantId),
}));

// ==================== AD CREATIVES TABLE ====================
export const adCreatives = pgTable("ad_creatives", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull(),
  productId: integer("product_id"),
  imageUrl: text("image_url"),
  videoUrl: text("video_url"),
  platform: adPlatformEnum("platform").default("general"),
  headline: text("headline"),
  adCopy: text("ad_copy"),
  callToAction: text("call_to_action"),
  hashtags: jsonb("hashtags").$type<string[]>().default([]),
  format: text("format").default("square"),
  isAiGenerated: boolean("is_ai_generated").default(true),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  sentViaEmail: boolean("sent_via_email").default(false),
  emailSentAt: timestamp("email_sent_at"),
  downloadCount: integer("download_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  merchantIdx: index("ad_creatives_merchant_idx").on(table.merchantId),
  productIdx: index("ad_creatives_product_idx").on(table.productId),
  generatedAtIdx: index("ad_creatives_generated_at_idx").on(table.generatedAt),
}));

// ==================== STAFF INVITATIONS TABLE ====================
export const staffInvitations = pgTable("staff_invitations", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  permissions: jsonb("permissions").$type<string[]>().default([]),
  invitedBy: integer("invited_by").notNull(),
  status: invitationStatusEnum("status").default("pending"),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  merchantIdx: index("invitations_merchant_idx").on(table.merchantId),
  tokenIdx: index("invitations_token_idx").on(table.token),
}));

// ==================== NOTIFICATIONS TABLE ====================
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  merchantId: integer("merchant_id"),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  actionUrl: text("action_url"),
  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("notifications_user_idx").on(table.userId),
}));

// ==================== ACTIVITY LOGS TABLE ====================
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  merchantId: integer("merchant_id"),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  resourceId: text("resource_id"),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("logs_user_idx").on(table.userId),
  merchantIdx: index("logs_merchant_idx").on(table.merchantId),
}));

// ==================== SYNC LOGS TABLE ====================
export const syncLogs = pgTable("sync_logs", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull(),
  merchantId: integer("merchant_id"),
  type: text("type").notNull(),
  status: syncStatusEnum("status").notNull(),
  itemsProcessed: integer("items_processed").default(0),
  itemsFailed: integer("items_failed").default(0),
  errors: jsonb("errors").$type<string[]>().default([]),
  startedAt: timestamp("started_at").notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ==================== RELATIONS ====================
export const usersRelations = relations(users, ({ one }) => ({
  merchant: one(merchants, {
    fields: [users.merchantId],
    references: [merchants.id],
  }),
}));

export const merchantsRelations = relations(merchants, ({ one, many }) => ({
  owner: one(users, {
    fields: [merchants.ownerId],
    references: [users.id],
  }),
  plan: one(plans, {
    fields: [merchants.subscriptionPlanId],
    references: [plans.id],
  }),
  products: many(products),
  orders: many(orders),
  customers: many(customers),
  subscription: one(subscriptions),
  staffInvitations: many(staffInvitations),
}));

export const suppliersRelations = relations(suppliers, ({ many, one }) => ({
  products: many(products),
  createdByUser: one(users, {
    fields: [suppliers.createdBy],
    references: [users.id],
  }),
}));

export const productsRelations = relations(products, ({ one }) => ({
  merchant: one(merchants, {
    fields: [products.merchantId],
    references: [merchants.id],
  }),
  supplier: one(suppliers, {
    fields: [products.supplierId],
    references: [suppliers.id],
  }),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  merchant: one(merchants, {
    fields: [customers.merchantId],
    references: [merchants.id],
  }),
  orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  merchant: one(merchants, {
    fields: [orders.merchantId],
    references: [merchants.id],
  }),
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  merchant: one(merchants, {
    fields: [subscriptions.merchantId],
    references: [merchants.id],
  }),
  plan: one(plans, {
    fields: [subscriptions.planId],
    references: [plans.id],
  }),
}));

export const staffInvitationsRelations = relations(staffInvitations, ({ one }) => ({
  merchant: one(merchants, {
    fields: [staffInvitations.merchantId],
    references: [merchants.id],
  }),
  inviter: one(users, {
    fields: [staffInvitations.invitedBy],
    references: [users.id],
  }),
}));

export const adCreativesRelations = relations(adCreatives, ({ one }) => ({
  merchant: one(merchants, {
    fields: [adCreatives.merchantId],
    references: [merchants.id],
  }),
  product: one(products, {
    fields: [adCreatives.productId],
    references: [products.id],
  }),
}));

// ==================== INSERT SCHEMAS ====================
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const insertMerchantSchema = createInsertSchema(merchants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMerchant = z.infer<typeof insertMerchantSchema>;
export type Merchant = typeof merchants.$inferSelect;

export const insertSupplierSchema = createInsertSchema(suppliers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Supplier = typeof suppliers.$inferSelect;

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

export const insertPlanSchema = createInsertSchema(plans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Plan = typeof plans.$inferSelect;

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;

export const insertStaffInvitationSchema = createInsertSchema(staffInvitations).omit({
  id: true,
  createdAt: true,
});
export type InsertStaffInvitation = z.infer<typeof insertStaffInvitationSchema>;
export type StaffInvitation = typeof staffInvitations.$inferSelect;

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;

export const insertSyncLogSchema = createInsertSchema(syncLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertSyncLog = z.infer<typeof insertSyncLogSchema>;
export type SyncLog = typeof syncLogs.$inferSelect;

export const insertAdCreativeSchema = createInsertSchema(adCreatives).omit({
  id: true,
  createdAt: true,
});
export type InsertAdCreative = z.infer<typeof insertAdCreativeSchema>;
export type AdCreative = typeof adCreatives.$inferSelect;

// ==================== OTP SCHEMAS ====================
export const insertOtpSchema = createInsertSchema(otpVerifications).omit({
  id: true,
  createdAt: true,
});
export type InsertOtp = z.infer<typeof insertOtpSchema>;
export type OtpVerification = typeof otpVerifications.$inferSelect;

// ==================== AUTH SCHEMAS ====================
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const phoneLoginRequestSchema = z.object({
  phone: z.string().min(10, "Phone number must be at least 10 digits"),
});
export type PhoneLoginRequest = z.infer<typeof phoneLoginRequestSchema>;

export const phoneVerifySchema = z.object({
  phone: z.string().min(10, "Phone number must be at least 10 digits"),
  code: z.string().length(6, "Code must be 6 digits"),
  name: z.string().optional(),
  businessName: z.string().optional(),
});
export type PhoneVerifyInput = z.infer<typeof phoneVerifySchema>;

export const googleAuthSchema = z.object({
  credential: z.string(),
  name: z.string().optional(),
  businessName: z.string().optional(),
});
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;

export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  businessName: z.string().min(2, "Business name must be at least 2 characters"),
  businessType: z.string().optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

// ==================== RESPONSE TYPES ====================
export type AuthResponse = {
  success: boolean;
  message?: string;
  data?: {
    user: Omit<User, "password">;
    merchant?: Merchant;
    token: string;
  };
};

export type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
};

// ==================== DASHBOARD STATS ====================
export type AdminDashboardStats = {
  totalMerchants: number;
  activeMerchants: number;
  totalProducts: number;
  totalOrders: number;
  totalRevenue: number;
  ordersToday: number;
  revenueToday: number;
  newMerchantsThisMonth: number;
};

export type MerchantDashboardStats = {
  totalProducts: number;
  totalOrders: number;
  totalRevenue: number;
  totalProfit: number;
  totalCustomers: number;
  pendingOrders: number;
  ordersToday: number;
  revenueToday: number;
  profitToday: number;
  productLimit: number;
  currentProductCount: number;
};
