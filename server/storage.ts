import {
  users, merchants, suppliers, products, customers, orders,
  plans, subscriptions, staffInvitations, notifications, activityLogs, syncLogs, adCreatives, otpVerifications, supplierOrders, categories,
  walletBalances, walletTransactions,
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
  type OtpVerification, type InsertOtp,
  type AdminDashboardStats, type MerchantDashboardStats,
  type SupplierOrder, type InsertSupplierOrder,
  type Category, type InsertCategory,
  type WalletBalance, type InsertWalletBalance,
  type WalletTransaction, type InsertWalletTransaction,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, sql, gte, lte, ilike, or, isNull, count, inArray } from "drizzle-orm";

// Pagination types for large product catalogs (60k+ products)
export interface PaginationParams {
  page: number;
  pageSize: number;
  search?: string;
  supplierId?: number;
  category?: string;
  categoryId?: number;
  priceMin?: number;
  priceMax?: number;
  inStock?: boolean;
  sortBy?: "createdAt" | "price" | "title" | "stock";
  sortDirection?: "asc" | "desc";
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

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

  // Supplier Orders
  getSupplierOrder(id: number): Promise<SupplierOrder | undefined>;
  createSupplierOrder(order: InsertSupplierOrder): Promise<SupplierOrder>;
  updateSupplierOrder(id: number, data: Partial<InsertSupplierOrder>): Promise<SupplierOrder | undefined>;
  getSupplierOrdersByOrder(orderId: number): Promise<SupplierOrder[]>;
  getSupplierOrdersByMerchant(merchantId: number): Promise<SupplierOrder[]>;
  getPendingSupplierOrders(): Promise<SupplierOrder[]>;

  // Categories
  getCategory(id: number): Promise<Category | undefined>;
  getCategoryBySlug(slug: string): Promise<Category | undefined>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: number, data: Partial<InsertCategory>): Promise<Category | undefined>;
  deleteCategory(id: number): Promise<boolean>;
  getAllCategories(): Promise<Category[]>;
  getActiveCategories(): Promise<Category[]>;
  updateCategoryProductCount(categoryId: number): Promise<void>;

  // Products
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, data: Partial<InsertProduct>): Promise<Product | undefined>;
  updateProductPricing(id: number, pricingRule: { type: "percentage" | "fixed"; value: number }): Promise<Product | undefined>;
  bulkUpdateProductPricing(ids: number[], pricingRule: { type: "percentage" | "fixed"; value: number }): Promise<{ updated: number; products: Product[] }>;
  deleteProduct(id: number): Promise<boolean>;
  getGlobalProducts(): Promise<Product[]>;
  getGlobalProductsPaginated(params: PaginationParams): Promise<PaginatedResponse<Product>>;
  getProductsByMerchant(merchantId: number): Promise<Product[]>;
  getProductsBySupplier(supplierId: number): Promise<Product[]>;
  getProductsBySupplierProductId(supplierId: number, supplierProductId: string): Promise<Product[]>;
  getProductsByCategory(categoryId: number): Promise<Product[]>;

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
  getOrdersByMerchant(merchantId: number, limit?: number, offset?: number, status?: string, fulfillmentStatus?: string): Promise<{ orders: Order[]; total: number }>;
  getOrdersByCustomer(customerId: number): Promise<Order[]>;
  getRecentOrders(merchantId: number, limit: number): Promise<Order[]>;
  getMerchantProductByShopifyId(merchantId: number, shopifyProductId: string): Promise<Product | undefined>;

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

  // Enhanced Analytics
  getRevenueChart(merchantId?: number, days?: number): Promise<{ date: string; revenue: number; orders: number; profit: number }[]>;
  getTopProducts(merchantId?: number, limit?: number): Promise<{ productId: number; title: string; totalSold: number; revenue: number }[]>;
  getOrderStatusBreakdown(merchantId?: number): Promise<{ status: string; count: number }[]>;
  getRecentActivity(merchantId?: number, limit?: number): Promise<any[]>;
  seedSampleOrders(): Promise<void>;

  // OTP Verifications
  createOtp(otp: InsertOtp): Promise<OtpVerification>;
  getOtp(identifier: string, type: string): Promise<OtpVerification | undefined>;
  incrementOtpAttempts(id: number): Promise<void>;
  markOtpVerified(id: number): Promise<void>;
  deleteOtp(id: number): Promise<void>;
  cleanupExpiredOtps(): Promise<void>;

  // User Auth Methods
  getUserByPhone(phone: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;

  // Seed data
  seedDefaultPlans(): Promise<void>;
  seedAdminUser(): Promise<User>;

  // Wallet
  getWalletBalance(merchantId: number): Promise<WalletBalance | undefined>;
  createWalletBalance(data: InsertWalletBalance): Promise<WalletBalance>;
  addFundsToWallet(merchantId: number, amountCents: number, stripePaymentIntentId: string, description?: string): Promise<{ balance: WalletBalance; transaction: WalletTransaction }>;
  debitWalletForOrder(merchantId: number, orderId: number, amountCents: number, description?: string): Promise<{ success: boolean; balance?: WalletBalance; transaction?: WalletTransaction; error?: string }>;
  refundToWallet(merchantId: number, orderId: number, amountCents: number, description?: string): Promise<{ balance: WalletBalance; transaction: WalletTransaction }>;
  getWalletTransactions(merchantId: number, limit?: number, offset?: number): Promise<{ transactions: WalletTransaction[]; total: number }>;
}

export class DatabaseStorage implements IStorage {
  // Helper to select products without categoryId column (for PlanetScale compatibility)
  private productSelectColumns = {
    id: products.id,
    merchantId: products.merchantId,
    supplierId: products.supplierId,
    title: products.title,
    description: products.description,
    category: products.category,
    tags: products.tags,
    images: products.images,
    variants: products.variants,
    supplierProductId: products.supplierProductId,
    supplierSku: products.supplierSku,
    supplierPrice: products.supplierPrice,
    merchantPrice: products.merchantPrice,
    pricingRule: products.pricingRule,
    inventoryQuantity: products.inventoryQuantity,
    lowStockThreshold: products.lowStockThreshold,
    trackInventory: products.trackInventory,
    status: products.status,
    isGlobal: products.isGlobal,
    shopifyProductId: products.shopifyProductId,
    syncStatus: products.syncStatus,
    lastSyncedAt: products.lastSyncedAt,
    importedAt: products.importedAt,
    createdAt: products.createdAt,
    updatedAt: products.updatedAt,
  };

  private addNullCategoryId(items: any[]): Product[] {
    return items.map(item => ({ ...item, categoryId: null })) as Product[];
  }

  private addNullCategoryIdSingle(item: any): Product {
    return { ...item, categoryId: null } as Product;
  }

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

  // ==================== SUPPLIER ORDERS ====================
  async getSupplierOrder(id: number): Promise<SupplierOrder | undefined> {
    const [order] = await db.select().from(supplierOrders).where(eq(supplierOrders.id, id));
    return order || undefined;
  }

  async createSupplierOrder(insertOrder: InsertSupplierOrder): Promise<SupplierOrder> {
    const [order] = await db.insert(supplierOrders).values(insertOrder).returning();
    return order;
  }

  async updateSupplierOrder(id: number, data: Partial<InsertSupplierOrder>): Promise<SupplierOrder | undefined> {
    const [order] = await db
      .update(supplierOrders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(supplierOrders.id, id))
      .returning();
    return order || undefined;
  }

  async getSupplierOrdersByOrder(orderId: number): Promise<SupplierOrder[]> {
    return db.select().from(supplierOrders).where(eq(supplierOrders.orderId, orderId));
  }

  async getSupplierOrdersByMerchant(merchantId: number): Promise<SupplierOrder[]> {
    return db.select().from(supplierOrders).where(eq(supplierOrders.merchantId, merchantId)).orderBy(desc(supplierOrders.createdAt));
  }

  async getPendingSupplierOrders(): Promise<SupplierOrder[]> {
    return db.select().from(supplierOrders).where(eq(supplierOrders.status, "pending")).orderBy(asc(supplierOrders.createdAt));
  }

  // ==================== CATEGORIES ====================
  async getCategory(id: number): Promise<Category | undefined> {
    const [category] = await db.select().from(categories).where(eq(categories.id, id));
    return category || undefined;
  }

  async getCategoryBySlug(slug: string): Promise<Category | undefined> {
    const [category] = await db.select().from(categories).where(eq(categories.slug, slug));
    return category || undefined;
  }

  async createCategory(insertCategory: InsertCategory): Promise<Category> {
    const [category] = await db.insert(categories).values(insertCategory).returning();
    return category;
  }

  async updateCategory(id: number, data: Partial<InsertCategory>): Promise<Category | undefined> {
    const [category] = await db
      .update(categories)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(categories.id, id))
      .returning();
    return category || undefined;
  }

  async deleteCategory(id: number): Promise<boolean> {
    await db.delete(categories).where(eq(categories.id, id));
    return true;
  }

  async getAllCategories(): Promise<Category[]> {
    return db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
  }

  async getActiveCategories(): Promise<Category[]> {
    return db.select().from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.sortOrder), asc(categories.name));
  }

  async updateCategoryProductCount(categoryId: number): Promise<void> {
    const [result] = await db
      .select({ count: count() })
      .from(products)
      .where(eq(products.categoryId, categoryId));
    const productCount = result?.count || 0;
    await db.update(categories).set({ productCount, updatedAt: new Date() }).where(eq(categories.id, categoryId));
  }

  // ==================== PRODUCTS ====================
  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select(this.productSelectColumns).from(products).where(eq(products.id, id));
    return product ? this.addNullCategoryIdSingle(product) : undefined;
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

    const [updated] = await db
      .update(products)
      .set({
        pricingRule,
        merchantPrice,
        updatedAt: new Date(),
      })
      .where(eq(products.id, id))
      .returning();
    return updated || undefined;
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

  async batchUpsertProducts(
    productsData: InsertProduct[], 
    existingProductMap: Map<string, number>
  ): Promise<{ created: number; updated: number; errors: number }> {
    let created = 0;
    let updated = 0;
    let errors = 0;

    const toCreate: InsertProduct[] = [];
    const toUpdate: { id: number; data: InsertProduct }[] = [];

    for (const productData of productsData) {
      const existingId = existingProductMap.get(productData.supplierProductId!);
      if (existingId) {
        toUpdate.push({ id: existingId, data: productData });
      } else {
        toCreate.push(productData);
      }
    }

    // Batch insert new products
    if (toCreate.length > 0) {
      try {
        const inserted = await db.insert(products).values(toCreate).returning();
        for (const p of inserted) {
          if (p.supplierProductId) {
            existingProductMap.set(p.supplierProductId, p.id);
          }
        }
        created = inserted.length;
      } catch (err: any) {
        console.error(`[BatchUpsert] Batch insert failed, falling back to individual inserts:`, err.message);
        for (const productData of toCreate) {
          try {
            const [p] = await db.insert(products).values(productData).returning();
            if (p.supplierProductId) {
              existingProductMap.set(p.supplierProductId, p.id);
            }
            created++;
          } catch (e: any) {
            console.error(`[BatchUpsert] Failed to insert ${productData.title}:`, e.message);
            errors++;
          }
        }
      }
    }

    // Update existing products (one at a time since batch update is complex)
    for (const { id, data } of toUpdate) {
      try {
        await db.update(products).set({ ...data, id: undefined, updatedAt: new Date() } as any).where(eq(products.id, id));
        updated++;
      } catch (e: any) {
        console.error(`[BatchUpsert] Failed to update product ${id}:`, e.message);
        errors++;
      }
    }

    return { created, updated, errors };
  }

  async getGlobalProducts(): Promise<Product[]> {
    const items = await db.select(this.productSelectColumns).from(products)
      .where(and(eq(products.isGlobal, true), isNull(products.merchantId)))
      .orderBy(desc(products.createdAt));
    return this.addNullCategoryId(items);
  }

  async getGlobalProductsPaginated(params: PaginationParams): Promise<PaginatedResponse<Product>> {
    const { page, pageSize, search, supplierId, category, categoryId, priceMin, priceMax, inStock, sortBy = "createdAt", sortDirection = "desc" } = params;
    const offset = (page - 1) * pageSize;

    // Build filter conditions - only active global products
    const conditions = [
      eq(products.isGlobal, true),
      isNull(products.merchantId),
      eq(products.status, "active")
    ];

    if (supplierId) {
      conditions.push(eq(products.supplierId, supplierId));
    }

    if (category) {
      conditions.push(eq(products.category, category));
    }

    // categoryId filtering disabled until migration is applied to production database
    // if (categoryId) {
    //   conditions.push(eq(products.categoryId, categoryId));
    // }

    if (priceMin !== undefined) {
      conditions.push(gte(products.supplierPrice, priceMin));
    }

    if (priceMax !== undefined) {
      conditions.push(lte(products.supplierPrice, priceMax));
    }

    if (inStock === true) {
      conditions.push(gte(products.inventoryQuantity, 1));
    } else if (inStock === false) {
      conditions.push(eq(products.inventoryQuantity, 0));
    }

    if (search) {
      conditions.push(
        or(
          ilike(products.title, `%${search}%`),
          ilike(products.description, `%${search}%`),
          ilike(products.supplierSku, `%${search}%`)
        )!
      );
    }

    const whereClause = and(...conditions);

    // Get total count for pagination
    const [countResult] = await db
      .select({ count: count() })
      .from(products)
      .where(whereClause);
    
    const total = countResult?.count || 0;

    // Determine sort column and direction
    const sortColumn = sortBy === "price" ? products.supplierPrice
      : sortBy === "title" ? products.title
      : sortBy === "stock" ? products.inventoryQuantity
      : products.createdAt;
    
    const orderFn = sortDirection === "asc" ? asc : desc;

    // Get paginated items using the class-level helper (excludes categoryId for PlanetScale compatibility)
    const items = await db
      .select(this.productSelectColumns)
      .from(products)
      .where(whereClause)
      .orderBy(orderFn(sortColumn))
      .limit(pageSize)
      .offset(offset);

    return {
      items: this.addNullCategoryId(items),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  }

  async getProductsByMerchant(merchantId: number): Promise<Product[]> {
    const items = await db.select(this.productSelectColumns).from(products)
      .where(eq(products.merchantId, merchantId))
      .orderBy(desc(products.createdAt));
    return this.addNullCategoryId(items);
  }

  async getProductsBySupplier(supplierId: number): Promise<Product[]> {
    const items = await db.select(this.productSelectColumns).from(products).where(eq(products.supplierId, supplierId));
    return this.addNullCategoryId(items);
  }

  async getProductsBySupplierProductId(supplierId: number, supplierProductId: string): Promise<Product[]> {
    const items = await db.select(this.productSelectColumns).from(products).where(
      and(
        eq(products.supplierId, supplierId),
        eq(products.supplierProductId, supplierProductId)
      )
    );
    return this.addNullCategoryId(items);
  }

  async getProductsByCategory(categoryId: number): Promise<Product[]> {
    // Category filtering disabled until migration is applied to production database
    return [];
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

  async getOrdersByMerchant(
    merchantId: number,
    limit: number = 50,
    offset: number = 0,
    status?: string,
    fulfillmentStatus?: string
  ): Promise<{ orders: Order[]; total: number }> {
    const conditions = [eq(orders.merchantId, merchantId)];
    
    if (status) {
      conditions.push(eq(orders.status, status as any));
    }
    if (fulfillmentStatus) {
      conditions.push(eq(orders.fulfillmentStatus, fulfillmentStatus as any));
    }
    
    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
    
    const orderList = await db.select().from(orders)
      .where(whereClause)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);
    
    const [countResult] = await db.select({ count: count() })
      .from(orders)
      .where(whereClause);
    
    return { orders: orderList, total: countResult?.count || 0 };
  }

  async getMerchantProductByShopifyId(merchantId: number, shopifyProductId: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products)
      .where(and(
        eq(products.merchantId, merchantId),
        eq(products.shopifyProductId, shopifyProductId)
      ))
      .limit(1);
    return product || undefined;
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

  // ==================== ENHANCED ANALYTICS ====================
  async getRevenueChart(merchantId?: number, days: number = 30): Promise<{ date: string; revenue: number; orders: number; profit: number }[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const conditions = [gte(orders.createdAt, startDate)];
    if (merchantId) {
      conditions.push(eq(orders.merchantId, merchantId));
    }

    const result = await db
      .select({
        date: sql<string>`date_trunc('day', ${orders.createdAt})::date::text`,
        revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
        orders: count(),
        profit: sql<number>`coalesce(sum(${orders.totalProfit}), 0)`,
      })
      .from(orders)
      .where(and(...conditions))
      .groupBy(sql`date_trunc('day', ${orders.createdAt})`)
      .orderBy(sql`date_trunc('day', ${orders.createdAt})`);

    const chartData: { date: string; revenue: number; orders: number; profit: number }[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      
      const existing = result.find(r => r.date === dateStr);
      chartData.push({
        date: dateStr,
        revenue: existing ? Number(existing.revenue) : 0,
        orders: existing ? Number(existing.orders) : 0,
        profit: existing ? Number(existing.profit) : 0,
      });
    }

    return chartData;
  }

  async getTopProducts(merchantId?: number, limit: number = 10): Promise<{ productId: number; title: string; totalSold: number; revenue: number }[]> {
    const result = await db.execute(sql`
      SELECT 
        p.id as "productId",
        p.title,
        COALESCE(SUM((item->>'quantity')::int), 0) as "totalSold",
        COALESCE(SUM((item->>'price')::decimal * (item->>'quantity')::int), 0) as revenue
      FROM ${products} p
      LEFT JOIN ${orders} o ON ${merchantId ? sql`o.merchant_id = ${merchantId}` : sql`1=1`}
      LEFT JOIN LATERAL jsonb_array_elements(o.items) as item ON true
      WHERE (item->>'productId')::int = p.id
      ${merchantId ? sql`AND p.merchant_id = ${merchantId}` : sql``}
      GROUP BY p.id, p.title
      ORDER BY "totalSold" DESC
      LIMIT ${limit}
    `);

    return (result.rows || []).map((row: any) => ({
      productId: Number(row.productId),
      title: String(row.title),
      totalSold: Number(row.totalSold || 0),
      revenue: Number(row.revenue || 0),
    }));
  }

  async getOrderStatusBreakdown(merchantId?: number): Promise<{ status: string; count: number }[]> {
    const conditions = merchantId ? [eq(orders.merchantId, merchantId)] : [];
    
    const result = await db
      .select({
        status: orders.status,
        count: count(),
      })
      .from(orders)
      .where(and(...conditions))
      .groupBy(orders.status);

    return result.map(r => ({
      status: r.status,
      count: Number(r.count),
    }));
  }

  async getRecentActivity(merchantId?: number, limit: number = 20): Promise<any[]> {
    const activities: any[] = [];
    
    const recentOrders = await db
      .select()
      .from(orders)
      .where(merchantId ? eq(orders.merchantId, merchantId) : sql`1=1`)
      .orderBy(desc(orders.createdAt))
      .limit(Math.min(limit, 10));

    for (const order of recentOrders) {
      activities.push({
        type: 'order',
        action: `Order #${order.orderNumber} - ${order.status}`,
        amount: order.total,
        timestamp: order.createdAt,
      });
    }

    const recentSyncs = await db
      .select()
      .from(syncLogs)
      .orderBy(desc(syncLogs.createdAt))
      .limit(Math.min(limit, 5));

    for (const sync of recentSyncs) {
      activities.push({
        type: 'sync',
        action: `Sync ${sync.status}: ${sync.productsAdded || 0} added, ${sync.productsUpdated || 0} updated`,
        timestamp: sync.createdAt,
      });
    }

    return activities
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  async seedSampleOrders(): Promise<void> {
    const existingOrders = await db.select().from(orders).limit(1);
    if (existingOrders.length > 0) {
      console.log("Orders already exist, skipping sample seed...");
      return;
    }

    const allMerchants = await this.getAllMerchants();
    if (allMerchants.length === 0) {
      console.log("No merchants found, skipping sample orders seed...");
      return;
    }

    const merchant = allMerchants[0];
    const globalProducts = await db.select().from(products).where(isNull(products.merchantId)).limit(20);
    
    if (globalProducts.length === 0) {
      console.log("No global products found, skipping sample orders...");
      return;
    }

    const sampleCustomers = [
      { firstName: "John", lastName: "Smith", email: "john@example.com", phone: "+1-555-0101" },
      { firstName: "Sarah", lastName: "Johnson", email: "sarah@example.com", phone: "+1-555-0102" },
      { firstName: "Michael", lastName: "Brown", email: "michael@example.com", phone: "+1-555-0103" },
      { firstName: "Emily", lastName: "Davis", email: "emily@example.com", phone: "+1-555-0104" },
      { firstName: "David", lastName: "Wilson", email: "david@example.com", phone: "+1-555-0105" },
    ];

    const createdCustomers: Customer[] = [];
    for (const c of sampleCustomers) {
      const customer = await this.createCustomer({
        merchantId: merchant.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        addresses: [{
          firstName: c.firstName,
          lastName: c.lastName,
          address1: "123 Main St",
          city: "New York",
          province: "NY",
          zip: "10001",
          country: "US"
        }],
      });
      createdCustomers.push(customer);
    }

    const statuses: ('pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled')[] = 
      ['pending', 'processing', 'shipped', 'delivered'];

    for (let i = 0; i < 30; i++) {
      const daysAgo = Math.floor(Math.random() * 30);
      const orderDate = new Date();
      orderDate.setDate(orderDate.getDate() - daysAgo);

      const numItems = Math.floor(Math.random() * 3) + 1;
      const orderItems: any[] = [];
      let subtotalCents = 0;

      for (let j = 0; j < numItems; j++) {
        const product = globalProducts[Math.floor(Math.random() * globalProducts.length)];
        const quantity = Math.floor(Math.random() * 3) + 1;
        const priceCents = Math.round(product.supplierPrice * 1.2);
        const costCents = product.supplierPrice;
        
        orderItems.push({
          productId: product.id,
          title: product.title,
          sku: product.supplierSku,
          quantity,
          price: priceCents,
          cost: costCents,
        });
        subtotalCents += priceCents * quantity;
      }

      const customer = createdCustomers[Math.floor(Math.random() * createdCustomers.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const costTotalCents = orderItems.reduce((sum: number, item: any) => sum + (item.cost * item.quantity), 0);
      const profitCents = subtotalCents - costTotalCents;
      const shippingCents = 999;
      const taxCents = Math.round(subtotalCents * 0.08);
      const totalCents = subtotalCents + shippingCents + taxCents;

      const shippingAddr = customer.addresses?.[0] || {
        firstName: customer.firstName,
        lastName: customer.lastName,
        address1: "123 Main St",
        city: "New York",
        province: "NY",
        zip: "10001",
        country: "US"
      };

      await db.insert(orders).values({
        merchantId: merchant.id,
        customerId: customer.id,
        customerEmail: customer.email,
        orderNumber: `ORD-${Date.now()}-${i}`,
        status,
        items: orderItems,
        subtotal: subtotalCents,
        shipping: shippingCents,
        tax: taxCents,
        total: totalCents,
        totalCost: costTotalCents,
        totalProfit: profitCents,
        shippingAddress: shippingAddr,
        createdAt: orderDate,
        updatedAt: orderDate,
      });
    }

    console.log("Sample orders seeded successfully (30 orders)");
  }

  // ==================== SEED DATA ====================
  async seedDefaultPlans(): Promise<void> {
    // Check if plans already exist
    const existingPlans = await db.select().from(plans).limit(1);
    if (existingPlans.length > 0) {
      console.log("Plans already seeded, skipping...");
      return;
    }

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

  // OTP Verifications
  async createOtp(otp: InsertOtp): Promise<OtpVerification> {
    await db.delete(otpVerifications).where(
      and(
        eq(otpVerifications.identifier, otp.identifier),
        eq(otpVerifications.type, otp.type)
      )
    );
    const [created] = await db.insert(otpVerifications).values(otp).returning();
    return created;
  }

  async getOtp(identifier: string, type: string): Promise<OtpVerification | undefined> {
    const [otp] = await db.select().from(otpVerifications).where(
      and(
        eq(otpVerifications.identifier, identifier),
        eq(otpVerifications.type, type),
        gte(otpVerifications.expiresAt, new Date()),
        isNull(otpVerifications.verifiedAt)
      )
    ).limit(1);
    return otp;
  }

  async incrementOtpAttempts(id: number): Promise<void> {
    await db.update(otpVerifications)
      .set({ attempts: sql`${otpVerifications.attempts} + 1` })
      .where(eq(otpVerifications.id, id));
  }

  async markOtpVerified(id: number): Promise<void> {
    await db.update(otpVerifications)
      .set({ verifiedAt: new Date() })
      .where(eq(otpVerifications.id, id));
  }

  async deleteOtp(id: number): Promise<void> {
    await db.delete(otpVerifications).where(eq(otpVerifications.id, id));
  }

  async cleanupExpiredOtps(): Promise<void> {
    await db.delete(otpVerifications).where(
      lte(otpVerifications.expiresAt, new Date())
    );
  }

  // User Auth Methods
  async getUserByPhone(phone: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
    return user;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId)).limit(1);
    return user;
  }

  // ==================== WALLET ====================
  async getWalletBalance(merchantId: number): Promise<WalletBalance | undefined> {
    const [balance] = await db.select().from(walletBalances).where(eq(walletBalances.merchantId, merchantId)).limit(1);
    return balance;
  }

  async createWalletBalance(data: InsertWalletBalance): Promise<WalletBalance> {
    const [balance] = await db.insert(walletBalances).values(data).returning();
    return balance;
  }

  async addFundsToWallet(
    merchantId: number, 
    amountCents: number, 
    stripePaymentIntentId: string, 
    description?: string
  ): Promise<{ balance: WalletBalance; transaction: WalletTransaction }> {
    // Get or create wallet balance
    let balance = await this.getWalletBalance(merchantId);
    if (!balance) {
      balance = await this.createWalletBalance({ merchantId, balanceCents: 0, pendingCents: 0, currency: "USD" });
    }

    const newBalanceCents = balance.balanceCents + amountCents;

    // Update balance
    const [updatedBalance] = await db.update(walletBalances)
      .set({ balanceCents: newBalanceCents, updatedAt: new Date() })
      .where(eq(walletBalances.merchantId, merchantId))
      .returning();

    // Create transaction record
    const [transaction] = await db.insert(walletTransactions).values({
      merchantId,
      type: "credit",
      amountCents,
      balanceAfterCents: newBalanceCents,
      currency: "USD",
      description: description || "Wallet top-up",
      stripePaymentIntentId,
    }).returning();

    return { balance: updatedBalance, transaction };
  }

  async debitWalletForOrder(
    merchantId: number, 
    orderId: number, 
    amountCents: number, 
    description?: string
  ): Promise<{ success: boolean; balance?: WalletBalance; transaction?: WalletTransaction; error?: string }> {
    // Get wallet balance
    const balance = await this.getWalletBalance(merchantId);
    if (!balance) {
      return { success: false, error: "Wallet not found. Please add funds first." };
    }

    if (balance.balanceCents < amountCents) {
      return { 
        success: false, 
        error: `Insufficient funds. Available: $${(balance.balanceCents / 100).toFixed(2)}, Required: $${(amountCents / 100).toFixed(2)}` 
      };
    }

    const newBalanceCents = balance.balanceCents - amountCents;

    // Update balance
    const [updatedBalance] = await db.update(walletBalances)
      .set({ balanceCents: newBalanceCents, updatedAt: new Date() })
      .where(eq(walletBalances.merchantId, merchantId))
      .returning();

    // Create transaction record
    const [transaction] = await db.insert(walletTransactions).values({
      merchantId,
      type: "debit",
      amountCents,
      balanceAfterCents: newBalanceCents,
      currency: "USD",
      description: description || "Order payment",
      orderId,
    }).returning();

    return { success: true, balance: updatedBalance, transaction };
  }

  async refundToWallet(
    merchantId: number, 
    orderId: number, 
    amountCents: number, 
    description?: string
  ): Promise<{ balance: WalletBalance; transaction: WalletTransaction }> {
    // Get or create wallet balance
    let balance = await this.getWalletBalance(merchantId);
    if (!balance) {
      balance = await this.createWalletBalance({ merchantId, balanceCents: 0, pendingCents: 0, currency: "USD" });
    }

    const newBalanceCents = balance.balanceCents + amountCents;

    // Update balance
    const [updatedBalance] = await db.update(walletBalances)
      .set({ balanceCents: newBalanceCents, updatedAt: new Date() })
      .where(eq(walletBalances.merchantId, merchantId))
      .returning();

    // Create transaction record
    const [transaction] = await db.insert(walletTransactions).values({
      merchantId,
      type: "refund",
      amountCents,
      balanceAfterCents: newBalanceCents,
      currency: "USD",
      description: description || "Order refund",
      orderId,
    }).returning();

    return { balance: updatedBalance, transaction };
  }

  async getWalletTransactions(
    merchantId: number, 
    limit: number = 50, 
    offset: number = 0
  ): Promise<{ transactions: WalletTransaction[]; total: number }> {
    const transactions = await db.select()
      .from(walletTransactions)
      .where(eq(walletTransactions.merchantId, merchantId))
      .orderBy(desc(walletTransactions.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db.select({ count: count() })
      .from(walletTransactions)
      .where(eq(walletTransactions.merchantId, merchantId));

    return { transactions, total: countResult?.count || 0 };
  }
}

export const storage = new DatabaseStorage();
