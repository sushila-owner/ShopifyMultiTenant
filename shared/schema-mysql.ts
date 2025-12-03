import { mysqlTable, text, int, boolean, timestamp, json, float, serial, mysqlEnum, varchar, index } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ==================== PLANS TABLE ====================
export const plans = mysqlTable("plans", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  description: text("description").notNull(),
  monthlyPrice: int("monthly_price").notNull(),
  yearlyPrice: int("yearly_price").notNull(),
  productLimit: int("product_limit").notNull(),
  orderLimit: int("order_limit").notNull().default(-1),
  teamMemberLimit: int("team_member_limit").notNull(),
  supplierLimit: int("supplier_limit").default(-1),
  dailyAdsLimit: int("daily_ads_limit").default(0),
  hasAiAds: boolean("has_ai_ads").default(false),
  hasVideoAds: boolean("has_video_ads").default(false),
  isWhiteLabel: boolean("is_white_label").default(false),
  hasVipSupport: boolean("has_vip_support").default(false),
  badge: varchar("badge", { length: 255 }),
  features: json("features").$type<string[]>().default([]),
  isPopular: boolean("is_popular").default(false),
  isActive: boolean("is_active").default(true),
  sortOrder: int("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ==================== USERS TABLE ====================
export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["admin", "merchant", "staff"]).notNull().default("merchant"),
  merchantId: int("merchant_id"),
  avatar: text("avatar"),
  phone: varchar("phone", { length: 50 }),
  isActive: boolean("is_active").default(true),
  isEmailVerified: boolean("is_email_verified").default(false),
  permissions: json("permissions").$type<string[]>().default([]),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  emailIdx: index("users_email_idx").on(table.email),
  merchantIdx: index("users_merchant_idx").on(table.merchantId),
}));

// ==================== MERCHANTS TABLE ====================
export const merchants = mysqlTable("merchants", {
  id: serial("id").primaryKey(),
  businessName: varchar("business_name", { length: 255 }).notNull(),
  ownerEmail: varchar("owner_email", { length: 255 }).notNull(),
  ownerId: int("owner_id").notNull(),
  businessType: varchar("business_type", { length: 100 }),
  taxId: varchar("tax_id", { length: 100 }),
  address: json("address").$type<{
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    zipCode?: string;
  }>(),
  shopifyStore: json("shopify_store").$type<{
    domain?: string;
    accessToken?: string;
    scopes?: string[];
    installedAt?: string;
    isConnected?: boolean;
  }>().default({}),
  subscriptionPlanId: int("subscription_plan_id"),
  subscriptionStatus: mysqlEnum("subscription_status", ["trial", "active", "cancelled", "expired", "past_due", "free_for_life"]).default("trial"),
  productLimit: int("product_limit").default(50),
  currentProductCount: int("current_product_count").default(0),
  trialEndsAt: timestamp("trial_ends_at"),
  subscriptionEndsAt: timestamp("subscription_ends_at"),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  settings: json("settings").$type<{
    branding?: { logo?: string; primaryColor?: string; companyName?: string };
    notifications?: { emailOnOrder?: boolean; emailOnLowStock?: boolean; smsNotifications?: boolean };
    defaultPricingRule?: { type: string; value: number };
    autoFulfillment?: boolean;
    autoSyncInventory?: boolean;
  }>().default({}),
  isActive: boolean("is_active").default(true),
  isSuspended: boolean("is_suspended").default(false),
  suspensionReason: text("suspension_reason"),
  totalOrders: int("total_orders").default(0),
  totalRevenue: int("total_revenue").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  ownerIdx: index("merchants_owner_idx").on(table.ownerId),
}));

// ==================== SUPPLIERS TABLE ====================
export const suppliers = mysqlTable("suppliers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["gigab2b", "shopify", "amazon", "woocommerce", "custom"]).notNull(),
  description: text("description"),
  logo: text("logo"),
  apiCredentials: json("api_credentials").$type<{
    apiKey?: string;
    apiSecret?: string;
    baseUrl?: string;
    accessToken?: string;
    refreshToken?: string;
  }>().default({}),
  config: json("config").$type<{
    productSyncEnabled?: boolean;
    inventorySyncEnabled?: boolean;
    orderFulfillmentEnabled?: boolean;
    syncInterval?: number;
    lastSyncAt?: string;
    nextSyncAt?: string;
  }>().default({}),
  isActive: boolean("is_active").default(true),
  rating: float("rating").default(5),
  totalProducts: int("total_products").default(0),
  totalOrders: int("total_orders").default(0),
  createdBy: int("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ==================== PRODUCTS TABLE ====================
export const products = mysqlTable("products", {
  id: serial("id").primaryKey(),
  merchantId: int("merchant_id"),
  supplierId: int("supplier_id").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 255 }),
  tags: json("tags").$type<string[]>().default([]),
  images: json("images").$type<{ url: string; alt?: string; position?: number }[]>().default([]),
  variants: json("variants").$type<{
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
  supplierProductId: varchar("supplier_product_id", { length: 255 }),
  supplierSku: varchar("supplier_sku", { length: 255 }),
  supplierPrice: float("supplier_price").notNull(),
  merchantPrice: float("merchant_price"),
  pricingRule: json("pricing_rule").$type<{ type: string; value: number }>(),
  inventoryQuantity: int("inventory_quantity").default(0),
  lowStockThreshold: int("low_stock_threshold").default(10),
  trackInventory: boolean("track_inventory").default(true),
  status: mysqlEnum("status", ["draft", "active", "archived"]).default("active"),
  isGlobal: boolean("is_global").default(true),
  shopifyProductId: varchar("shopify_product_id", { length: 255 }),
  syncStatus: mysqlEnum("sync_status", ["pending", "synced", "failed"]).default("synced"),
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
export const customers = mysqlTable("customers", {
  id: serial("id").primaryKey(),
  merchantId: int("merchant_id").notNull(),
  shopifyCustomerId: varchar("shopify_customer_id", { length: 255 }),
  email: varchar("email", { length: 255 }).notNull(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  addresses: json("addresses").$type<{
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
  defaultAddress: json("default_address").$type<{
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
  tags: json("tags").$type<string[]>().default([]),
  totalOrders: int("total_orders").default(0),
  totalSpent: int("total_spent").default(0),
  averageOrderValue: int("average_order_value").default(0),
  lastOrderAt: timestamp("last_order_at"),
  loyaltyPoints: int("loyalty_points").default(0),
  tier: mysqlEnum("tier", ["bronze", "silver", "gold", "platinum"]).default("bronze"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  merchantIdx: index("customers_merchant_idx").on(table.merchantId),
  emailIdx: index("customers_email_idx").on(table.email),
}));

// ==================== ORDERS TABLE ====================
export const orders = mysqlTable("orders", {
  id: serial("id").primaryKey(),
  merchantId: int("merchant_id").notNull(),
  orderNumber: varchar("order_number", { length: 100 }).notNull(),
  shopifyOrderId: varchar("shopify_order_id", { length: 255 }),
  customerId: int("customer_id"),
  customerEmail: varchar("customer_email", { length: 255 }).notNull(),
  shippingAddress: json("shipping_address").$type<{
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
  billingAddress: json("billing_address").$type<{
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
  items: json("items").$type<{
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
  subtotal: int("subtotal").notNull(),
  tax: int("tax").default(0),
  shipping: int("shipping").default(0),
  discount: int("discount").default(0),
  total: int("total").notNull(),
  totalCost: int("total_cost").notNull(),
  totalProfit: int("total_profit").notNull(),
  status: mysqlEnum("status", ["pending", "processing", "completed", "cancelled", "refunded"]).default("pending"),
  paymentStatus: mysqlEnum("payment_status", ["pending", "paid", "refunded", "failed"]).default("pending"),
  fulfillmentStatus: mysqlEnum("fulfillment_status", ["unfulfilled", "partial", "fulfilled", "cancelled"]).default("unfulfilled"),
  tags: json("tags").$type<string[]>().default([]),
  notes: text("notes"),
  internalNotes: text("internal_notes"),
  timeline: json("timeline").$type<{
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
export const subscriptions = mysqlTable("subscriptions", {
  id: serial("id").primaryKey(),
  merchantId: int("merchant_id").notNull().unique(),
  planId: int("plan_id").notNull(),
  planSlug: varchar("plan_slug", { length: 100 }).notNull().default("free"),
  status: mysqlEnum("status", ["trial", "active", "cancelled", "expired", "past_due", "free_for_life"]).default("trial"),
  billingInterval: mysqlEnum("billing_interval", ["monthly", "yearly"]).default("monthly"),
  currentPeriodStart: timestamp("current_period_start").notNull(),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  trialStart: timestamp("trial_start"),
  trialEnd: timestamp("trial_end"),
  cancelledAt: timestamp("cancelled_at"),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  productsUsed: int("products_used").default(0),
  ordersUsed: int("orders_used").default(0),
  teamMembersUsed: int("team_members_used").default(0),
  lifetimeSales: int("lifetime_sales").default(0),
  progressToFreeForLife: int("progress_to_free_for_life").default(0),
  adsEnabled: boolean("ads_enabled").default(false),
  dailyAdsLimit: int("daily_ads_limit").default(0),
  adsGeneratedToday: int("ads_generated_today").default(0),
  lastAdsGeneratedAt: timestamp("last_ads_generated_at"),
  freeForLifeUnlockedAt: timestamp("free_for_life_unlocked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  merchantIdx: index("subscriptions_merchant_idx").on(table.merchantId),
}));

// ==================== AD CREATIVES TABLE ====================
export const adCreatives = mysqlTable("ad_creatives", {
  id: serial("id").primaryKey(),
  merchantId: int("merchant_id").notNull(),
  productId: int("product_id"),
  imageUrl: text("image_url"),
  videoUrl: text("video_url"),
  platform: mysqlEnum("platform", ["instagram", "facebook", "tiktok", "pinterest", "general"]).default("general"),
  headline: varchar("headline", { length: 500 }),
  adCopy: text("ad_copy"),
  callToAction: varchar("call_to_action", { length: 100 }),
  hashtags: json("hashtags").$type<string[]>().default([]),
  format: varchar("format", { length: 50 }).default("square"),
  isAiGenerated: boolean("is_ai_generated").default(true),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  sentViaEmail: boolean("sent_via_email").default(false),
  emailSentAt: timestamp("email_sent_at"),
  downloadCount: int("download_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  merchantIdx: index("ad_creatives_merchant_idx").on(table.merchantId),
  productIdx: index("ad_creatives_product_idx").on(table.productId),
  generatedAtIdx: index("ad_creatives_generated_at_idx").on(table.generatedAt),
}));

// ==================== STAFF INVITATIONS TABLE ====================
export const staffInvitations = mysqlTable("staff_invitations", {
  id: serial("id").primaryKey(),
  merchantId: int("merchant_id").notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  permissions: json("permissions").$type<string[]>().default([]),
  invitedBy: int("invited_by").notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "expired"]).default("pending"),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  merchantIdx: index("invitations_merchant_idx").on(table.merchantId),
  tokenIdx: index("invitations_token_idx").on(table.token),
}));

// ==================== NOTIFICATIONS TABLE ====================
export const notifications = mysqlTable("notifications", {
  id: serial("id").primaryKey(),
  userId: int("user_id").notNull(),
  merchantId: int("merchant_id"),
  type: mysqlEnum("type", ["order", "product", "inventory", "system", "billing"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  actionUrl: text("action_url"),
  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("notifications_user_idx").on(table.userId),
}));

// ==================== ACTIVITY LOGS TABLE ====================
export const activityLogs = mysqlTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: int("user_id").notNull(),
  merchantId: int("merchant_id"),
  action: varchar("action", { length: 255 }).notNull(),
  resource: varchar("resource", { length: 255 }).notNull(),
  resourceId: varchar("resource_id", { length: 255 }),
  details: json("details"),
  ipAddress: varchar("ip_address", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("logs_user_idx").on(table.userId),
  merchantIdx: index("logs_merchant_idx").on(table.merchantId),
}));

// ==================== SYNC LOGS TABLE ====================
export const syncLogs = mysqlTable("sync_logs", {
  id: serial("id").primaryKey(),
  supplierId: int("supplier_id").notNull(),
  merchantId: int("merchant_id"),
  type: varchar("type", { length: 100 }).notNull(),
  status: mysqlEnum("status", ["pending", "synced", "failed"]).notNull(),
  itemsProcessed: int("items_processed").default(0),
  itemsFailed: int("items_failed").default(0),
  errors: json("errors").$type<string[]>().default([]),
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

export const insertAdCreativeSchema = createInsertSchema(adCreatives).omit({
  id: true,
  createdAt: true,
  generatedAt: true,
});
export type InsertAdCreative = z.infer<typeof insertAdCreativeSchema>;
export type AdCreative = typeof adCreatives.$inferSelect;

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
