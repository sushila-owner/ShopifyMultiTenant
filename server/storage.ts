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
  type AdminDashboardStats, type MerchantDashboardStats,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, gte, lte, like, or, isNull, count } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined>;
  getUsersByMerchant(merchantId: number): Promise<User[]>;

  // Merchants
  getMerchant(id: number): Promise<Merchant | undefined>;
  getMerchantByOwnerId(ownerId: number): Promise<Merchant | undefined>;
  createMerchant(merchant: InsertMerchant): Promise<Merchant>;
  updateMerchant(id: number, data: Partial<InsertMerchant>): Promise<Merchant | undefined>;
  getAllMerchants(): Promise<Merchant[]>;

  // Suppliers
  getSupplier(id: number): Promise<Supplier | undefined>;
  createSupplier(supplier: InsertSupplier): Promise<Supplier>;
  updateSupplier(id: number, data: Partial<InsertSupplier>): Promise<Supplier | undefined>;
  deleteSupplier(id: number): Promise<boolean>;
  getAllSuppliers(): Promise<Supplier[]>;
  getActiveSuppliers(): Promise<Supplier[]>;

  // Products
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, data: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<boolean>;
  getGlobalProducts(): Promise<Product[]>;
  getProductsByMerchant(merchantId: number): Promise<Product[]>;
  getProductsBySupplier(supplierId: number): Promise<Product[]>;

  // Customers
  getCustomer(id: number): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, data: Partial<InsertCustomer>): Promise<Customer | undefined>;
  getCustomersByMerchant(merchantId: number): Promise<Customer[]>;
  getCustomerByEmail(merchantId: number, email: string): Promise<Customer | undefined>;

  // Orders
  getOrder(id: number): Promise<Order | undefined>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrder(id: number, data: Partial<InsertOrder>): Promise<Order | undefined>;
  getOrdersByMerchant(merchantId: number): Promise<Order[]>;
  getOrdersByCustomer(customerId: number): Promise<Order[]>;
  getRecentOrders(merchantId: number, limit: number): Promise<Order[]>;

  // Plans
  getPlan(id: number): Promise<Plan | undefined>;
  getPlanByName(name: string): Promise<Plan | undefined>;
  getPlanBySlug(slug: string): Promise<Plan | undefined>;
  createPlan(plan: InsertPlan): Promise<Plan>;
  updatePlan(id: number, data: Partial<InsertPlan>): Promise<Plan | undefined>;
  getAllPlans(): Promise<Plan[]>;
  getActivePlans(): Promise<Plan[]>;

  // Subscriptions
  getSubscription(id: number): Promise<Subscription | undefined>;
  getSubscriptionByMerchant(merchantId: number): Promise<Subscription | undefined>;
  createSubscription(subscription: InsertSubscription): Promise<Subscription>;
  updateSubscription(id: number, data: Partial<InsertSubscription>): Promise<Subscription | undefined>;
  updateSubscriptionLifetimeSales(merchantId: number, amount: number): Promise<Subscription | undefined>;
  checkAndUnlockFreeForLife(merchantId: number): Promise<boolean>;
  resetDailyAdsCount(): Promise<void>;

  // Ad Creatives
  getAdCreative(id: number): Promise<AdCreative | undefined>;
  createAdCreative(adCreative: InsertAdCreative): Promise<AdCreative>;
  getAdCreativesByMerchant(merchantId: number): Promise<AdCreative[]>;
  getTodaysAdCreativeCount(merchantId: number): Promise<number>;
  incrementAdDownloadCount(id: number): Promise<AdCreative | undefined>;

  // Staff Invitations
  getStaffInvitation(id: number): Promise<StaffInvitation | undefined>;
  getStaffInvitationByToken(token: string): Promise<StaffInvitation | undefined>;
  createStaffInvitation(invitation: InsertStaffInvitation): Promise<StaffInvitation>;
  updateStaffInvitation(id: number, data: Partial<InsertStaffInvitation>): Promise<StaffInvitation | undefined>;
  getInvitationsByMerchant(merchantId: number): Promise<StaffInvitation[]>;

  // Notifications
  getNotification(id: number): Promise<Notification | undefined>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: number): Promise<Notification | undefined>;
  getNotificationsByUser(userId: number): Promise<Notification[]>;
  getUnreadNotifications(userId: number): Promise<Notification[]>;

  // Activity Logs
  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;
  getActivityLogsByUser(userId: number, limit?: number): Promise<ActivityLog[]>;
  getActivityLogsByMerchant(merchantId: number, limit?: number): Promise<ActivityLog[]>;

  // Sync Logs
  createSyncLog(log: InsertSyncLog): Promise<SyncLog>;
  updateSyncLog(id: number, data: Partial<InsertSyncLog>): Promise<SyncLog | undefined>;
  getSyncLogsBySupplier(supplierId: number): Promise<SyncLog[]>;

  // Dashboard Stats
  getAdminDashboardStats(): Promise<AdminDashboardStats>;
  getMerchantDashboardStats(merchantId: number): Promise<MerchantDashboardStats>;

  // Seed data
  seedDefaultPlans(): Promise<void>;
  seedAdminUser(): Promise<User>;
}

export class DatabaseStorage implements IStorage {
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
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
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
    const [merchant] = await db.insert(merchants).values(insertMerchant).returning();
    return merchant;
  }

  async updateMerchant(id: number, data: Partial<InsertMerchant>): Promise<Merchant | undefined> {
    const [merchant] = await db
      .update(merchants)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(merchants.id, id))
      .returning();
    return merchant || undefined;
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
    const [supplier] = await db.insert(suppliers).values(insertSupplier).returning();
    return supplier;
  }

  async updateSupplier(id: number, data: Partial<InsertSupplier>): Promise<Supplier | undefined> {
    const [supplier] = await db
      .update(suppliers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(suppliers.id, id))
      .returning();
    return supplier || undefined;
  }

  async deleteSupplier(id: number): Promise<boolean> {
    const result = await db.delete(suppliers).where(eq(suppliers.id, id));
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
    const [product] = await db.insert(products).values(insertProduct).returning();
    return product;
  }

  async updateProduct(id: number, data: Partial<InsertProduct>): Promise<Product | undefined> {
    const [product] = await db
      .update(products)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return product || undefined;
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
    const [customer] = await db.insert(customers).values(insertCustomer).returning();
    return customer;
  }

  async updateCustomer(id: number, data: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const [customer] = await db
      .update(customers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(customers.id, id))
      .returning();
    return customer || undefined;
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
    const [order] = await db.insert(orders).values(insertOrder).returning();
    return order;
  }

  async updateOrder(id: number, data: Partial<InsertOrder>): Promise<Order | undefined> {
    const [order] = await db
      .update(orders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return order || undefined;
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
    const [plan] = await db.insert(plans).values(insertPlan).returning();
    return plan;
  }

  async updatePlan(id: number, data: Partial<InsertPlan>): Promise<Plan | undefined> {
    const [plan] = await db
      .update(plans)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(plans.id, id))
      .returning();
    return plan || undefined;
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
    const [subscription] = await db.insert(subscriptions).values(insertSubscription).returning();
    return subscription;
  }

  async updateSubscription(id: number, data: Partial<InsertSubscription>): Promise<Subscription | undefined> {
    const [subscription] = await db
      .update(subscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(subscriptions.id, id))
      .returning();
    return subscription || undefined;
  }

  async updateSubscriptionLifetimeSales(merchantId: number, amount: number): Promise<Subscription | undefined> {
    const subscription = await this.getSubscriptionByMerchant(merchantId);
    if (!subscription) return undefined;

    const FREE_FOR_LIFE_THRESHOLD = 5000000; // $50,000 in cents
    const newLifetimeSales = (subscription.lifetimeSales || 0) + amount;
    const progressPercentage = Math.min(Math.round((newLifetimeSales / FREE_FOR_LIFE_THRESHOLD) * 100), 100);

    const [updated] = await db
      .update(subscriptions)
      .set({
        lifetimeSales: newLifetimeSales,
        progressToFreeForLife: progressPercentage,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.merchantId, merchantId))
      .returning();

    // Auto-unlock FREE FOR LIFE if threshold reached
    if (newLifetimeSales >= FREE_FOR_LIFE_THRESHOLD && subscription.status !== 'free_for_life') {
      await this.checkAndUnlockFreeForLife(merchantId);
    }

    return updated || undefined;
  }

  async checkAndUnlockFreeForLife(merchantId: number): Promise<boolean> {
    const subscription = await this.getSubscriptionByMerchant(merchantId);
    if (!subscription) return false;

    const FREE_FOR_LIFE_THRESHOLD = 5000000; // $50,000 in cents
    if ((subscription.lifetimeSales || 0) >= FREE_FOR_LIFE_THRESHOLD && subscription.status !== 'free_for_life') {
      await db
        .update(subscriptions)
        .set({
          status: 'free_for_life',
          freeForLifeUnlockedAt: new Date(),
          adsEnabled: true,
          dailyAdsLimit: -1, // Unlimited
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.merchantId, merchantId));
      return true;
    }
    return false;
  }

  async resetDailyAdsCount(): Promise<void> {
    await db
      .update(subscriptions)
      .set({ adsGeneratedToday: 0, lastAdsGeneratedAt: null });
  }

  // ==================== AD CREATIVES ====================
  async getAdCreative(id: number): Promise<AdCreative | undefined> {
    const [adCreative] = await db.select().from(adCreatives).where(eq(adCreatives.id, id));
    return adCreative || undefined;
  }

  async createAdCreative(insertAdCreative: InsertAdCreative): Promise<AdCreative> {
    const [adCreative] = await db.insert(adCreatives).values(insertAdCreative).returning();
    
    // Update the subscription's ads generated count
    const subscription = await this.getSubscriptionByMerchant(insertAdCreative.merchantId);
    if (subscription) {
      await db
        .update(subscriptions)
        .set({
          adsGeneratedToday: (subscription.adsGeneratedToday || 0) + 1,
          lastAdsGeneratedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.merchantId, insertAdCreative.merchantId));
    }

    return adCreative;
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

    const [updated] = await db
      .update(adCreatives)
      .set({ downloadCount: (adCreative.downloadCount || 0) + 1 })
      .where(eq(adCreatives.id, id))
      .returning();

    return updated || undefined;
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
    const [invitation] = await db.insert(staffInvitations).values(insertInvitation).returning();
    return invitation;
  }

  async updateStaffInvitation(id: number, data: Partial<InsertStaffInvitation>): Promise<StaffInvitation | undefined> {
    const [invitation] = await db
      .update(staffInvitations)
      .set(data)
      .where(eq(staffInvitations.id, id))
      .returning();
    return invitation || undefined;
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
    const [notification] = await db.insert(notifications).values(insertNotification).returning();
    return notification;
  }

  async markNotificationRead(id: number): Promise<Notification | undefined> {
    const [notification] = await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(notifications.id, id))
      .returning();
    return notification || undefined;
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
    const [log] = await db.insert(activityLogs).values(insertLog).returning();
    return log;
  }

  async getActivityLogsByUser(userId: number, limit = 50): Promise<ActivityLog[]> {
    return db.select().from(activityLogs)
      .where(eq(activityLogs.userId, userId))
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);
  }

  async getActivityLogsByMerchant(merchantId: number, limit = 50): Promise<ActivityLog[]> {
    return db.select().from(activityLogs)
      .where(eq(activityLogs.merchantId, merchantId))
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);
  }

  // ==================== SYNC LOGS ====================
  async createSyncLog(insertLog: InsertSyncLog): Promise<SyncLog> {
    const [log] = await db.insert(syncLogs).values(insertLog).returning();
    return log;
  }

  async updateSyncLog(id: number, data: Partial<InsertSyncLog>): Promise<SyncLog | undefined> {
    const [log] = await db
      .update(syncLogs)
      .set(data)
      .where(eq(syncLogs.id, id))
      .returning();
    return log || undefined;
  }

  async getSyncLogsBySupplier(supplierId: number): Promise<SyncLog[]> {
    return db.select().from(syncLogs)
      .where(eq(syncLogs.supplierId, supplierId))
      .orderBy(desc(syncLogs.createdAt));
  }

  // ==================== DASHBOARD STATS ====================
  async getAdminDashboardStats(): Promise<AdminDashboardStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [merchantStats] = await db
      .select({
        total: count(),
        active: sql<number>`count(*) filter (where ${merchants.isActive} = true)`,
      })
      .from(merchants);

    const [productStats] = await db
      .select({ total: count() })
      .from(products)
      .where(isNull(products.merchantId));

    const [orderStats] = await db
      .select({
        total: count(),
        totalRevenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
        todayCount: sql<number>`count(*) filter (where ${orders.createdAt} >= ${today})`,
        todayRevenue: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.createdAt} >= ${today}), 0)`,
      })
      .from(orders);

    const [newMerchants] = await db
      .select({ count: count() })
      .from(merchants)
      .where(gte(merchants.createdAt, monthStart));

    return {
      totalMerchants: Number(merchantStats?.total || 0),
      activeMerchants: Number(merchantStats?.active || 0),
      totalProducts: Number(productStats?.total || 0),
      totalOrders: Number(orderStats?.total || 0),
      totalRevenue: Number(orderStats?.totalRevenue || 0),
      ordersToday: Number(orderStats?.todayCount || 0),
      revenueToday: Number(orderStats?.todayRevenue || 0),
      newMerchantsThisMonth: Number(newMerchants?.count || 0),
    };
  }

  async getMerchantDashboardStats(merchantId: number): Promise<MerchantDashboardStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const merchant = await this.getMerchant(merchantId);

    const [productStats] = await db
      .select({ total: count() })
      .from(products)
      .where(eq(products.merchantId, merchantId));

    const [orderStats] = await db
      .select({
        total: count(),
        totalRevenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
        totalProfit: sql<number>`coalesce(sum(${orders.totalProfit}), 0)`,
        pending: sql<number>`count(*) filter (where ${orders.status} = 'pending')`,
        todayCount: sql<number>`count(*) filter (where ${orders.createdAt} >= ${today})`,
        todayRevenue: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.createdAt} >= ${today}), 0)`,
        todayProfit: sql<number>`coalesce(sum(${orders.totalProfit}) filter (where ${orders.createdAt} >= ${today}), 0)`,
      })
      .from(orders)
      .where(eq(orders.merchantId, merchantId));

    const [customerStats] = await db
      .select({ total: count() })
      .from(customers)
      .where(eq(customers.merchantId, merchantId));

    return {
      totalProducts: Number(productStats?.total || 0),
      totalOrders: Number(orderStats?.total || 0),
      totalRevenue: Number(orderStats?.totalRevenue || 0),
      totalProfit: Number(orderStats?.totalProfit || 0),
      totalCustomers: Number(customerStats?.total || 0),
      pendingOrders: Number(orderStats?.pending || 0),
      ordersToday: Number(orderStats?.todayCount || 0),
      revenueToday: Number(orderStats?.todayRevenue || 0),
      profitToday: Number(orderStats?.todayProfit || 0),
      productLimit: merchant?.productLimit || 50,
      currentProductCount: Number(productStats?.total || 0),
    };
  }

  // ==================== SEED DATA ====================
  async seedDefaultPlans(): Promise<void> {
    // Delete existing plans and re-seed with the 6 new tiers
    await db.delete(plans);

    const defaultPlans: InsertPlan[] = [
      {
        name: "free",
        slug: "free",
        displayName: "Free",
        description: "Get started with dropshipping",
        monthlyPrice: 0,
        yearlyPrice: 0,
        productLimit: 25,
        orderLimit: 50,
        teamMemberLimit: 1,
        supplierLimit: 2,
        dailyAdsLimit: 0,
        hasAiAds: false,
        hasVideoAds: false,
        isWhiteLabel: false,
        hasVipSupport: false,
        badge: null,
        features: ["25 products", "50 orders/month", "1 team member", "2 suppliers", "Basic analytics", "Email support"],
        isPopular: false,
        sortOrder: 0,
      },
      {
        name: "starter",
        slug: "starter",
        displayName: "Starter",
        description: "For growing businesses",
        monthlyPrice: 2900,
        yearlyPrice: 29000,
        productLimit: 100,
        orderLimit: 500,
        teamMemberLimit: 3,
        supplierLimit: 5,
        dailyAdsLimit: 1,
        hasAiAds: true,
        hasVideoAds: false,
        isWhiteLabel: false,
        hasVipSupport: false,
        badge: null,
        features: ["100 products", "500 orders/month", "3 team members", "5 suppliers", "1 AI ad/day", "Advanced analytics", "Priority email support"],
        isPopular: false,
        sortOrder: 1,
      },
      {
        name: "growth",
        slug: "growth",
        displayName: "Growth",
        description: "Scale your business faster",
        monthlyPrice: 4900,
        yearlyPrice: 49000,
        productLimit: 250,
        orderLimit: 1500,
        teamMemberLimit: 5,
        supplierLimit: 10,
        dailyAdsLimit: 2,
        hasAiAds: true,
        hasVideoAds: false,
        isWhiteLabel: false,
        hasVipSupport: false,
        badge: null,
        features: ["250 products", "1,500 orders/month", "5 team members", "10 suppliers", "2 AI ads/day", "Custom pricing rules", "Chat support"],
        isPopular: true,
        sortOrder: 2,
      },
      {
        name: "professional",
        slug: "professional",
        displayName: "Professional",
        description: "For serious dropshippers",
        monthlyPrice: 9900,
        yearlyPrice: 99000,
        productLimit: 1000,
        orderLimit: 5000,
        teamMemberLimit: 10,
        supplierLimit: -1,
        dailyAdsLimit: 3,
        hasAiAds: true,
        hasVideoAds: true,
        isWhiteLabel: false,
        hasVipSupport: false,
        badge: "POPULAR",
        features: ["1,000 products", "5,000 orders/month", "10 team members", "Unlimited suppliers", "3 AI ads/day", "Video ads", "API access", "Phone support"],
        isPopular: false,
        sortOrder: 3,
      },
      {
        name: "millionaire",
        slug: "millionaire",
        displayName: "Millionaire",
        description: "Enterprise-grade features",
        monthlyPrice: 24900,
        yearlyPrice: 249000,
        productLimit: -1,
        orderLimit: -1,
        teamMemberLimit: -1,
        supplierLimit: -1,
        dailyAdsLimit: 5,
        hasAiAds: true,
        hasVideoAds: true,
        isWhiteLabel: true,
        hasVipSupport: true,
        badge: "BEST VALUE",
        features: ["Unlimited products", "Unlimited orders", "Unlimited team members", "Unlimited suppliers", "5 AI ads/day", "Video ads", "White-label branding", "VIP support", "Dedicated account manager"],
        isPopular: false,
        sortOrder: 4,
      },
      {
        name: "free_for_life",
        slug: "free_for_life",
        displayName: "FREE FOR LIFE",
        description: "Unlocked at $50K lifetime sales",
        monthlyPrice: 0,
        yearlyPrice: 0,
        productLimit: -1,
        orderLimit: -1,
        teamMemberLimit: -1,
        supplierLimit: -1,
        dailyAdsLimit: -1,
        hasAiAds: true,
        hasVideoAds: true,
        isWhiteLabel: true,
        hasVipSupport: true,
        badge: "EARNED",
        features: ["Unlimited everything", "Unlimited AI ads", "Video ads", "White-label branding", "VIP support", "All future features included", "Lifetime access"],
        isPopular: false,
        isActive: false, // Hidden from regular plan selection
        sortOrder: 5,
      },
    ];

    for (const plan of defaultPlans) {
      await this.createPlan(plan);
    }
  }

  async seedAdminUser(): Promise<User> {
    const existingAdmin = await this.getUserByEmail("admin@apexmart.com");
    if (existingAdmin) return existingAdmin;

    const bcrypt = await import("bcryptjs");
    const hashedPassword = await bcrypt.hash("admin123", 10);

    return this.createUser({
      email: "admin@apexmart.com",
      password: hashedPassword,
      name: "Super Admin",
      role: "admin",
      isActive: true,
      isEmailVerified: true,
      permissions: ["all"],
    });
  }
}

export const storage = new DatabaseStorage();
