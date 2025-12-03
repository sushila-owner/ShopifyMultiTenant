import {
  users, merchants, suppliers, products, customers, orders,
  plans, subscriptions, staffInvitations, notifications, activityLogs, syncLogs, adCreatives,
  type User, type InsertUser,
  type Merchant, type InsertMerchant,
  type Supplier, type InsertSupplier,
  type Product, type InsertProduct,
  type Customer, type InsertCustomer,
  type Order, type InsertOrder,
  type Plan, type InsertPlan,
  type Subscription, type InsertSubscription,
  type StaffInvitation, type InsertStaffInvitation,
  type Notification, type InsertNotification,
  type ActivityLog, type InsertActivityLog,
  type SyncLog, type InsertSyncLog,
  type AdCreative, type InsertAdCreative,
} from "@shared/schema-mysql";
import { db } from "./db-mysql";
import { eq, and, desc, sql, gte, lte, like, or, isNull, count } from "drizzle-orm";
import type { IStorage } from "./storage";

export interface AdminDashboardStats {
  totalMerchants: number;
  activeMerchants: number;
  totalProducts: number;
  totalOrders: number;
  totalRevenue: number;
  pendingOrders: number;
  activeSuppliers: number;
}

export interface MerchantDashboardStats {
  totalProducts: number;
  totalOrders: number;
  totalCustomers: number;
  totalRevenue: number;
  pendingOrders: number;
  lowStockProducts: number;
}

export class MySQLStorage implements IStorage {
  // ==================== USERS ====================
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser);
    const insertId = Number(result.insertId);
    const user = await this.getUser(insertId);
    return user!;
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
    await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, id));
    return this.getUser(id);
  }

  async getUsersByMerchant(merchantId: number): Promise<User[]> {
    return db.select().from(users).where(eq(users.merchantId, merchantId));
  }

  // ==================== MERCHANTS ====================
  async getMerchant(id: number): Promise<Merchant | undefined> {
    const [merchant] = await db.select().from(merchants).where(eq(merchants.id, id));
    return merchant || undefined;
  }

  async getMerchantByOwnerId(ownerId: number): Promise<Merchant | undefined> {
    const [merchant] = await db.select().from(merchants).where(eq(merchants.ownerId, ownerId));
    return merchant || undefined;
  }

  async createMerchant(insertMerchant: InsertMerchant): Promise<Merchant> {
    const result = await db.insert(merchants).values(insertMerchant);
    const insertId = Number(result.insertId);
    const merchant = await this.getMerchant(insertId);
    return merchant!;
  }

  async updateMerchant(id: number, data: Partial<InsertMerchant>): Promise<Merchant | undefined> {
    await db.update(merchants).set({ ...data, updatedAt: new Date() }).where(eq(merchants.id, id));
    return this.getMerchant(id);
  }

  async getAllMerchants(): Promise<Merchant[]> {
    return db.select().from(merchants).orderBy(desc(merchants.createdAt));
  }

  // ==================== SUPPLIERS ====================
  async getSupplier(id: number): Promise<Supplier | undefined> {
    const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, id));
    return supplier || undefined;
  }

  async createSupplier(insertSupplier: InsertSupplier): Promise<Supplier> {
    const result = await db.insert(suppliers).values(insertSupplier);
    const insertId = Number(result.insertId);
    const supplier = await this.getSupplier(insertId);
    return supplier!;
  }

  async updateSupplier(id: number, data: Partial<InsertSupplier>): Promise<Supplier | undefined> {
    await db.update(suppliers).set({ ...data, updatedAt: new Date() }).where(eq(suppliers.id, id));
    return this.getSupplier(id);
  }

  async deleteSupplier(id: number): Promise<boolean> {
    await db.delete(suppliers).where(eq(suppliers.id, id));
    return true;
  }

  async getAllSuppliers(): Promise<Supplier[]> {
    return db.select().from(suppliers).orderBy(desc(suppliers.createdAt));
  }

  async getActiveSuppliers(): Promise<Supplier[]> {
    return db.select().from(suppliers).where(eq(suppliers.isActive, true));
  }

  // ==================== PRODUCTS ====================
  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product || undefined;
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const result = await db.insert(products).values(insertProduct);
    const insertId = Number(result.insertId);
    const product = await this.getProduct(insertId);
    return product!;
  }

  async updateProduct(id: number, data: Partial<InsertProduct>): Promise<Product | undefined> {
    await db.update(products).set({ ...data, updatedAt: new Date() }).where(eq(products.id, id));
    return this.getProduct(id);
  }

  async updateProductPricing(id: number, pricingRule: { type: "percentage" | "fixed"; value: number }): Promise<Product | undefined> {
    const product = await this.getProduct(id);
    if (!product) return undefined;

    const supplierPrice = product.supplierPrice;
    let merchantPrice: number;
    if (pricingRule.type === "percentage") {
      merchantPrice = supplierPrice * (1 + pricingRule.value / 100);
    } else {
      merchantPrice = supplierPrice + pricingRule.value;
    }
    merchantPrice = Math.round(merchantPrice * 100) / 100;

    await db.update(products).set({
      pricingRule,
      merchantPrice,
      updatedAt: new Date(),
    }).where(eq(products.id, id));

    return this.getProduct(id);
  }

  async bulkUpdateProductPricing(ids: number[], pricingRule: { type: "percentage" | "fixed"; value: number }): Promise<{ updated: number; products: Product[] }> {
    const updatedProducts: Product[] = [];
    for (const id of ids) {
      const product = await this.updateProductPricing(id, pricingRule);
      if (product) {
        updatedProducts.push(product);
      }
    }
    return { updated: updatedProducts.length, products: updatedProducts };
  }

  async deleteProduct(id: number): Promise<boolean> {
    await db.delete(products).where(eq(products.id, id));
    return true;
  }

  async getGlobalProducts(): Promise<Product[]> {
    return db.select().from(products)
      .where(and(eq(products.isGlobal, true), isNull(products.merchantId)))
      .orderBy(desc(products.createdAt));
  }

  async getProductsByMerchant(merchantId: number): Promise<Product[]> {
    return db.select().from(products)
      .where(eq(products.merchantId, merchantId))
      .orderBy(desc(products.createdAt));
  }

  async getProductsBySupplier(supplierId: number): Promise<Product[]> {
    return db.select().from(products).where(eq(products.supplierId, supplierId));
  }

  // ==================== CUSTOMERS ====================
  async getCustomer(id: number): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer || undefined;
  }

  async createCustomer(insertCustomer: InsertCustomer): Promise<Customer> {
    const result = await db.insert(customers).values(insertCustomer);
    const insertId = Number(result.insertId);
    const customer = await this.getCustomer(insertId);
    return customer!;
  }

  async updateCustomer(id: number, data: Partial<InsertCustomer>): Promise<Customer | undefined> {
    await db.update(customers).set({ ...data, updatedAt: new Date() }).where(eq(customers.id, id));
    return this.getCustomer(id);
  }

  async getCustomersByMerchant(merchantId: number): Promise<Customer[]> {
    return db.select().from(customers)
      .where(eq(customers.merchantId, merchantId))
      .orderBy(desc(customers.createdAt));
  }

  async getCustomerByEmail(merchantId: number, email: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers)
      .where(and(eq(customers.merchantId, merchantId), eq(customers.email, email)));
    return customer || undefined;
  }

  // ==================== ORDERS ====================
  async getOrder(id: number): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order || undefined;
  }

  async createOrder(insertOrder: InsertOrder): Promise<Order> {
    const result = await db.insert(orders).values(insertOrder);
    const insertId = Number(result.insertId);
    const order = await this.getOrder(insertId);
    return order!;
  }

  async updateOrder(id: number, data: Partial<InsertOrder>): Promise<Order | undefined> {
    await db.update(orders).set({ ...data, updatedAt: new Date() }).where(eq(orders.id, id));
    return this.getOrder(id);
  }

  async getOrdersByMerchant(merchantId: number): Promise<Order[]> {
    return db.select().from(orders)
      .where(eq(orders.merchantId, merchantId))
      .orderBy(desc(orders.createdAt));
  }

  async getOrdersByCustomer(customerId: number): Promise<Order[]> {
    return db.select().from(orders)
      .where(eq(orders.customerId, customerId))
      .orderBy(desc(orders.createdAt));
  }

  async getRecentOrders(merchantId: number, limit: number): Promise<Order[]> {
    return db.select().from(orders)
      .where(eq(orders.merchantId, merchantId))
      .orderBy(desc(orders.createdAt))
      .limit(limit);
  }

  // ==================== PLANS ====================
  async getPlan(id: number): Promise<Plan | undefined> {
    const [plan] = await db.select().from(plans).where(eq(plans.id, id));
    return plan || undefined;
  }

  async getPlanByName(name: string): Promise<Plan | undefined> {
    const [plan] = await db.select().from(plans).where(eq(plans.name, name));
    return plan || undefined;
  }

  async getPlanBySlug(slug: string): Promise<Plan | undefined> {
    const [plan] = await db.select().from(plans).where(eq(plans.slug, slug));
    return plan || undefined;
  }

  async createPlan(insertPlan: InsertPlan): Promise<Plan> {
    const result = await db.insert(plans).values(insertPlan);
    const insertId = Number(result.insertId);
    const plan = await this.getPlan(insertId);
    return plan!;
  }

  async updatePlan(id: number, data: Partial<InsertPlan>): Promise<Plan | undefined> {
    await db.update(plans).set({ ...data, updatedAt: new Date() }).where(eq(plans.id, id));
    return this.getPlan(id);
  }

  async getAllPlans(): Promise<Plan[]> {
    return db.select().from(plans).orderBy(plans.sortOrder);
  }

  async getActivePlans(): Promise<Plan[]> {
    return db.select().from(plans)
      .where(eq(plans.isActive, true))
      .orderBy(plans.sortOrder);
  }

  // ==================== SUBSCRIPTIONS ====================
  async getSubscription(id: number): Promise<Subscription | undefined> {
    const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.id, id));
    return subscription || undefined;
  }

  async getSubscriptionByMerchant(merchantId: number): Promise<Subscription | undefined> {
    const [subscription] = await db.select().from(subscriptions)
      .where(eq(subscriptions.merchantId, merchantId));
    return subscription || undefined;
  }

  async createSubscription(insertSubscription: InsertSubscription): Promise<Subscription> {
    const result = await db.insert(subscriptions).values(insertSubscription);
    const insertId = Number(result.insertId);
    const subscription = await this.getSubscription(insertId);
    return subscription!;
  }

  async updateSubscription(id: number, data: Partial<InsertSubscription>): Promise<Subscription | undefined> {
    await db.update(subscriptions).set({ ...data, updatedAt: new Date() }).where(eq(subscriptions.id, id));
    return this.getSubscription(id);
  }

  async updateSubscriptionLifetimeSales(merchantId: number, amount: number): Promise<Subscription | undefined> {
    const subscription = await this.getSubscriptionByMerchant(merchantId);
    if (!subscription) return undefined;

    const FREE_FOR_LIFE_THRESHOLD = 5000000;
    const newLifetimeSales = (subscription.lifetimeSales || 0) + amount;
    const progressPercentage = Math.min(Math.round((newLifetimeSales / FREE_FOR_LIFE_THRESHOLD) * 100), 100);

    await db.update(subscriptions).set({
      lifetimeSales: newLifetimeSales,
      progressToFreeForLife: progressPercentage,
      updatedAt: new Date(),
    }).where(eq(subscriptions.merchantId, merchantId));

    if (newLifetimeSales >= FREE_FOR_LIFE_THRESHOLD && subscription.status !== 'free_for_life') {
      await this.checkAndUnlockFreeForLife(merchantId);
    }

    return this.getSubscriptionByMerchant(merchantId);
  }

  async checkAndUnlockFreeForLife(merchantId: number): Promise<boolean> {
    const subscription = await this.getSubscriptionByMerchant(merchantId);
    if (!subscription) return false;

    const FREE_FOR_LIFE_THRESHOLD = 5000000;
    if ((subscription.lifetimeSales || 0) >= FREE_FOR_LIFE_THRESHOLD && subscription.status !== 'free_for_life') {
      await db.update(subscriptions).set({
        status: 'free_for_life',
        freeForLifeUnlockedAt: new Date(),
        adsEnabled: true,
        dailyAdsLimit: -1,
        updatedAt: new Date(),
      }).where(eq(subscriptions.merchantId, merchantId));
      return true;
    }
    return false;
  }

  async resetDailyAdsCount(): Promise<void> {
    await db.update(subscriptions).set({ adsGeneratedToday: 0, lastAdsGeneratedAt: null });
  }

  // ==================== AD CREATIVES ====================
  async getAdCreative(id: number): Promise<AdCreative | undefined> {
    const [adCreative] = await db.select().from(adCreatives).where(eq(adCreatives.id, id));
    return adCreative || undefined;
  }

  async createAdCreative(insertAdCreative: InsertAdCreative): Promise<AdCreative> {
    const result = await db.insert(adCreatives).values(insertAdCreative);
    const insertId = Number(result.insertId);

    const subscription = await this.getSubscriptionByMerchant(insertAdCreative.merchantId);
    if (subscription) {
      await db.update(subscriptions).set({
        adsGeneratedToday: (subscription.adsGeneratedToday || 0) + 1,
        lastAdsGeneratedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(subscriptions.merchantId, insertAdCreative.merchantId));
    }

    const adCreative = await this.getAdCreative(insertId);
    return adCreative!;
  }

  async getAdCreativesByMerchant(merchantId: number): Promise<AdCreative[]> {
    return db.select().from(adCreatives)
      .where(eq(adCreatives.merchantId, merchantId))
      .orderBy(desc(adCreatives.createdAt));
  }

  async getTodaysAdCreativeCount(merchantId: number): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [result] = await db
      .select({ count: count() })
      .from(adCreatives)
      .where(and(
        eq(adCreatives.merchantId, merchantId),
        gte(adCreatives.generatedAt, today)
      ));

    return Number(result?.count || 0);
  }

  async incrementAdDownloadCount(id: number): Promise<AdCreative | undefined> {
    const adCreative = await this.getAdCreative(id);
    if (!adCreative) return undefined;

    await db.update(adCreatives).set({ downloadCount: (adCreative.downloadCount || 0) + 1 }).where(eq(adCreatives.id, id));
    return this.getAdCreative(id);
  }

  // ==================== STAFF INVITATIONS ====================
  async getStaffInvitation(id: number): Promise<StaffInvitation | undefined> {
    const [invitation] = await db.select().from(staffInvitations).where(eq(staffInvitations.id, id));
    return invitation || undefined;
  }

  async getStaffInvitationByToken(token: string): Promise<StaffInvitation | undefined> {
    const [invitation] = await db.select().from(staffInvitations)
      .where(eq(staffInvitations.token, token));
    return invitation || undefined;
  }

  async createStaffInvitation(insertInvitation: InsertStaffInvitation): Promise<StaffInvitation> {
    const result = await db.insert(staffInvitations).values(insertInvitation);
    const insertId = Number(result.insertId);
    const invitation = await this.getStaffInvitation(insertId);
    return invitation!;
  }

  async updateStaffInvitation(id: number, data: Partial<InsertStaffInvitation>): Promise<StaffInvitation | undefined> {
    await db.update(staffInvitations).set(data).where(eq(staffInvitations.id, id));
    return this.getStaffInvitation(id);
  }

  async getInvitationsByMerchant(merchantId: number): Promise<StaffInvitation[]> {
    return db.select().from(staffInvitations)
      .where(eq(staffInvitations.merchantId, merchantId))
      .orderBy(desc(staffInvitations.createdAt));
  }

  // ==================== NOTIFICATIONS ====================
  async getNotification(id: number): Promise<Notification | undefined> {
    const [notification] = await db.select().from(notifications).where(eq(notifications.id, id));
    return notification || undefined;
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const result = await db.insert(notifications).values(insertNotification);
    const insertId = Number(result.insertId);
    const notification = await this.getNotification(insertId);
    return notification!;
  }

  async markNotificationRead(id: number): Promise<Notification | undefined> {
    await db.update(notifications).set({ isRead: true, readAt: new Date() }).where(eq(notifications.id, id));
    return this.getNotification(id);
  }

  async getNotificationsByUser(userId: number): Promise<Notification[]> {
    return db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async getUnreadNotifications(userId: number): Promise<Notification[]> {
    return db.select().from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
      .orderBy(desc(notifications.createdAt));
  }

  // ==================== ACTIVITY LOGS ====================
  async createActivityLog(insertLog: InsertActivityLog): Promise<ActivityLog> {
    const result = await db.insert(activityLogs).values(insertLog);
    const insertId = Number(result.insertId);
    const [log] = await db.select().from(activityLogs).where(eq(activityLogs.id, insertId));
    return log!;
  }

  async getActivityLogsByUser(userId: number, limit: number = 50): Promise<ActivityLog[]> {
    return db.select().from(activityLogs)
      .where(eq(activityLogs.userId, userId))
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);
  }

  async getActivityLogsByMerchant(merchantId: number, limit: number = 50): Promise<ActivityLog[]> {
    return db.select().from(activityLogs)
      .where(eq(activityLogs.merchantId, merchantId))
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);
  }

  // ==================== SYNC LOGS ====================
  async createSyncLog(insertLog: InsertSyncLog): Promise<SyncLog> {
    const result = await db.insert(syncLogs).values(insertLog);
    const insertId = Number(result.insertId);
    const [log] = await db.select().from(syncLogs).where(eq(syncLogs.id, insertId));
    return log!;
  }

  async updateSyncLog(id: number, data: Partial<InsertSyncLog>): Promise<SyncLog | undefined> {
    await db.update(syncLogs).set(data).where(eq(syncLogs.id, id));
    const [log] = await db.select().from(syncLogs).where(eq(syncLogs.id, id));
    return log || undefined;
  }

  async getSyncLogsBySupplier(supplierId: number): Promise<SyncLog[]> {
    return db.select().from(syncLogs)
      .where(eq(syncLogs.supplierId, supplierId))
      .orderBy(desc(syncLogs.createdAt));
  }

  // ==================== DASHBOARD STATS ====================
  async getAdminDashboardStats(): Promise<AdminDashboardStats> {
    const [merchantCount] = await db.select({ count: count() }).from(merchants);
    const [activeMerchantCount] = await db.select({ count: count() }).from(merchants).where(eq(merchants.isActive, true));
    const [productCount] = await db.select({ count: count() }).from(products);
    const [orderCount] = await db.select({ count: count() }).from(orders);
    const [pendingOrderCount] = await db.select({ count: count() }).from(orders).where(eq(orders.status, 'pending'));
    const [supplierCount] = await db.select({ count: count() }).from(suppliers).where(eq(suppliers.isActive, true));

    const [revenueResult] = await db.select({ total: sql<number>`COALESCE(SUM(${orders.total}), 0)` }).from(orders);

    return {
      totalMerchants: Number(merchantCount?.count || 0),
      activeMerchants: Number(activeMerchantCount?.count || 0),
      totalProducts: Number(productCount?.count || 0),
      totalOrders: Number(orderCount?.count || 0),
      totalRevenue: Number(revenueResult?.total || 0),
      pendingOrders: Number(pendingOrderCount?.count || 0),
      activeSuppliers: Number(supplierCount?.count || 0),
    };
  }

  async getMerchantDashboardStats(merchantId: number): Promise<MerchantDashboardStats> {
    const [productCount] = await db.select({ count: count() }).from(products).where(eq(products.merchantId, merchantId));
    const [orderCount] = await db.select({ count: count() }).from(orders).where(eq(orders.merchantId, merchantId));
    const [customerCount] = await db.select({ count: count() }).from(customers).where(eq(customers.merchantId, merchantId));
    const [pendingOrderCount] = await db.select({ count: count() }).from(orders).where(and(eq(orders.merchantId, merchantId), eq(orders.status, 'pending')));
    const [lowStockCount] = await db.select({ count: count() }).from(products).where(and(eq(products.merchantId, merchantId), lte(products.inventoryQuantity, 10)));

    const [revenueResult] = await db.select({ total: sql<number>`COALESCE(SUM(${orders.total}), 0)` }).from(orders).where(eq(orders.merchantId, merchantId));

    return {
      totalProducts: Number(productCount?.count || 0),
      totalOrders: Number(orderCount?.count || 0),
      totalCustomers: Number(customerCount?.count || 0),
      totalRevenue: Number(revenueResult?.total || 0),
      pendingOrders: Number(pendingOrderCount?.count || 0),
      lowStockProducts: Number(lowStockCount?.count || 0),
    };
  }

  // ==================== SEED DATA ====================
  async seedDefaultPlans(): Promise<void> {
    const existingPlans = await this.getAllPlans();
    if (existingPlans.length > 0) {
      console.log("Plans already seeded, skipping...");
      return;
    }

    const defaultPlans: InsertPlan[] = [
      {
        name: "Free",
        slug: "free",
        displayName: "Free",
        description: "Start your wholesale journey",
        monthlyPrice: 0,
        yearlyPrice: 0,
        productLimit: 25,
        orderLimit: 50,
        teamMemberLimit: 1,
        supplierLimit: 1,
        dailyAdsLimit: 0,
        hasAiAds: false,
        hasVideoAds: false,
        isWhiteLabel: false,
        hasVipSupport: false,
        badge: null,
        features: ["25 products", "50 orders/month", "1 supplier", "Basic support"],
        isPopular: false,
        isActive: true,
        sortOrder: 0,
      },
      {
        name: "Starter",
        slug: "starter",
        displayName: "Starter",
        description: "For growing businesses",
        monthlyPrice: 2900,
        yearlyPrice: 29000,
        productLimit: 100,
        orderLimit: 500,
        teamMemberLimit: 2,
        supplierLimit: 3,
        dailyAdsLimit: 1,
        hasAiAds: true,
        hasVideoAds: false,
        isWhiteLabel: false,
        hasVipSupport: false,
        badge: null,
        features: ["100 products", "500 orders/month", "3 suppliers", "1 AI ad/day", "Email support"],
        isPopular: false,
        isActive: true,
        sortOrder: 1,
      },
      {
        name: "Growth",
        slug: "growth",
        displayName: "Growth",
        description: "Scale your business",
        monthlyPrice: 4900,
        yearlyPrice: 49000,
        productLimit: 500,
        orderLimit: 2500,
        teamMemberLimit: 5,
        supplierLimit: 10,
        dailyAdsLimit: 2,
        hasAiAds: true,
        hasVideoAds: false,
        isWhiteLabel: false,
        hasVipSupport: false,
        badge: null,
        features: ["500 products", "2500 orders/month", "10 suppliers", "2 AI ads/day", "Priority support"],
        isPopular: true,
        isActive: true,
        sortOrder: 2,
      },
      {
        name: "Professional",
        slug: "professional",
        displayName: "Professional",
        description: "For established businesses",
        monthlyPrice: 9900,
        yearlyPrice: 99000,
        productLimit: 2500,
        orderLimit: -1,
        teamMemberLimit: 15,
        supplierLimit: -1,
        dailyAdsLimit: 3,
        hasAiAds: true,
        hasVideoAds: true,
        isWhiteLabel: false,
        hasVipSupport: false,
        badge: null,
        features: ["2500 products", "Unlimited orders", "Unlimited suppliers", "3 AI ads/day", "Video ads", "Phone support"],
        isPopular: false,
        isActive: true,
        sortOrder: 3,
      },
      {
        name: "Millionaire",
        slug: "millionaire",
        displayName: "Millionaire",
        description: "Ultimate business suite",
        monthlyPrice: 49900,
        yearlyPrice: 499000,
        productLimit: -1,
        orderLimit: -1,
        teamMemberLimit: -1,
        supplierLimit: -1,
        dailyAdsLimit: 5,
        hasAiAds: true,
        hasVideoAds: true,
        isWhiteLabel: true,
        hasVipSupport: true,
        badge: "FUTURE MILLIONAIRE CHOICE",
        features: ["Unlimited everything", "5 AI ads/day", "Video ads", "White-label", "VIP support", "Dedicated manager"],
        isPopular: false,
        isActive: true,
        sortOrder: 4,
      },
    ];

    for (const plan of defaultPlans) {
      await this.createPlan(plan);
    }
    console.log("Default plans seeded successfully!");
  }

  async seedAdminUser(): Promise<User> {
    const existingAdmin = await this.getUserByEmail("admin@apexmart.com");
    if (existingAdmin) {
      return existingAdmin;
    }

    const bcrypt = await import("bcryptjs");
    const hashedPassword = await bcrypt.hash("admin123", 10);

    return this.createUser({
      email: "admin@apexmart.com",
      password: hashedPassword,
      name: "Admin User",
      role: "admin",
      isActive: true,
      isEmailVerified: true,
    });
  }
}

export const storage = new MySQLStorage();
