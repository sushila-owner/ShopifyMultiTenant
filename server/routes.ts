import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  loginSchema,
  registerSchema,
  insertSupplierSchema,
  insertProductSchema,
  insertCustomerSchema,
  insertOrderSchema,
  insertStaffInvitationSchema,
  type User,
} from "@shared/schema";
import { randomUUID } from "crypto";

const JWT_SECRET = process.env.SESSION_SECRET || "apex-mart-secret-key";
const JWT_EXPIRES_IN = "7d";

interface AuthRequest extends Request {
  user?: Omit<User, "password">;
}

function generateToken(user: Omit<User, "password">): string {
  return jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; email: string; role: string };
    
    const user = await storage.getUser(decoded.userId);
    if (!user) {
      return res.status(401).json({ success: false, error: "User not found" });
    }

    const { password: _, ...userWithoutPassword } = user;
    req.user = userWithoutPassword;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: "Invalid token" });
  }
}

function adminOnly(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ success: false, error: "Admin access required" });
  }
  next();
}

function merchantOnly(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== "merchant" && req.user?.role !== "staff") {
    return res.status(403).json({ success: false, error: "Merchant access required" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Seed data on startup
  await storage.seedDefaultPlans();
  await storage.seedAdminUser();

  // ==================== AUTH ROUTES ====================
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const validatedData = registerSchema.parse(req.body);

      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(400).json({ success: false, error: "Email already registered" });
      }

      const hashedPassword = await bcrypt.hash(validatedData.password, 10);

      const user = await storage.createUser({
        email: validatedData.email,
        password: hashedPassword,
        name: validatedData.name,
        role: "merchant",
        isActive: true,
        isEmailVerified: false,
        permissions: [],
      });

      const freePlan = await storage.getPlanByName("free");
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 14);

      const merchant = await storage.createMerchant({
        businessName: validatedData.businessName,
        ownerEmail: validatedData.email,
        ownerId: user.id,
        businessType: validatedData.businessType,
        subscriptionPlanId: freePlan?.id,
        subscriptionStatus: "trial",
        productLimit: freePlan?.productLimit || 25,
        trialEndsAt: trialEnd,
        settings: {
          branding: { companyName: validatedData.businessName },
          notifications: { emailOnOrder: true, emailOnLowStock: true },
          defaultPricingRule: { type: "percentage", value: 20 },
          autoFulfillment: false,
          autoSyncInventory: true,
        },
        isActive: true,
      });

      await storage.updateUser(user.id, { merchantId: merchant.id });

      if (freePlan) {
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        await storage.createSubscription({
          merchantId: merchant.id,
          planId: freePlan.id,
          status: "trial",
          billingInterval: "monthly",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          trialStart: now,
          trialEnd: trialEnd,
        });
      }

      const { password: _, ...userWithoutPassword } = user;
      const token = generateToken(userWithoutPassword);

      res.json({
        success: true,
        data: {
          user: { ...userWithoutPassword, merchantId: merchant.id },
          merchant,
          token,
        },
      });
    } catch (error: any) {
      console.error("Registration error:", error);
      res.status(400).json({ success: false, error: error.message || "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const validatedData = loginSchema.parse(req.body);

      const user = await storage.getUserByEmail(validatedData.email);
      if (!user) {
        return res.status(401).json({ success: false, error: "Invalid email or password" });
      }

      const isValidPassword = await bcrypt.compare(validatedData.password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ success: false, error: "Invalid email or password" });
      }

      if (!user.isActive) {
        return res.status(401).json({ success: false, error: "Account is disabled" });
      }

      await storage.updateUser(user.id, { lastLoginAt: new Date() });

      let merchant = null;
      if (user.merchantId) {
        merchant = await storage.getMerchant(user.merchantId);
      }

      const { password: _, ...userWithoutPassword } = user;
      const token = generateToken(userWithoutPassword);

      res.json({
        success: true,
        data: {
          user: userWithoutPassword,
          merchant,
          token,
        },
      });
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(400).json({ success: false, error: error.message || "Login failed" });
    }
  });

  app.get("/api/auth/me", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      let merchant = null;
      if (req.user?.merchantId) {
        merchant = await storage.getMerchant(req.user.merchantId);
      }

      res.json({
        success: true,
        data: {
          user: req.user,
          merchant,
        },
      });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // ==================== ADMIN ROUTES ====================
  app.get("/api/admin/dashboard", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const stats = await storage.getAdminDashboardStats();
      res.json({ success: true, data: stats });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Suppliers
  app.get("/api/admin/suppliers", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const suppliers = await storage.getAllSuppliers();
      res.json({ success: true, data: suppliers });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/admin/suppliers", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const data = { ...req.body, createdBy: req.user!.id };
      const supplier = await storage.createSupplier(data);
      res.json({ success: true, data: supplier });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.put("/api/admin/suppliers/:id", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const supplier = await storage.updateSupplier(parseInt(req.params.id), req.body);
      if (!supplier) {
        return res.status(404).json({ success: false, error: "Supplier not found" });
      }
      res.json({ success: true, data: supplier });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.delete("/api/admin/suppliers/:id", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteSupplier(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // Shopify supplier integration
  app.get("/api/admin/shopify/test", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const { getShopifyService } = await import("./shopify");
      const shopify = getShopifyService();
      if (!shopify) {
        return res.status(400).json({ 
          success: false, 
          error: "Shopify credentials not configured. Please set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN." 
        });
      }
      const result = await shopify.testConnection();
      res.json({ success: result.success, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/admin/shopify/sync", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const { getShopifyService } = await import("./shopify");
      const shopify = getShopifyService();
      if (!shopify) {
        return res.status(400).json({ 
          success: false, 
          error: "Shopify credentials not configured." 
        });
      }

      // Test connection first
      const connectionTest = await shopify.testConnection();
      if (!connectionTest.success) {
        return res.status(400).json({ 
          success: false, 
          error: `Shopify connection failed: ${connectionTest.error}` 
        });
      }

      // Find or create Shopify supplier
      let supplier = (await storage.getAllSuppliers()).find(s => s.type === "shopify");
      if (!supplier) {
        supplier = await storage.createSupplier({
          name: connectionTest.shopName || "Shopify Store",
          type: "shopify",
          description: `Products synced from ${connectionTest.shopName}`,
          isActive: true,
          createdBy: req.user!.id,
        });
      }

      // Get products from Shopify
      const shopifyProducts = await shopify.getProducts();
      
      // Get existing products for this supplier
      const existingProducts = await storage.getProductsBySupplier(supplier.id);
      const existingProductIds = new Set(existingProducts.map(p => p.supplierProductId));

      let created = 0;
      let updated = 0;
      let errors = 0;

      for (const shopifyProduct of shopifyProducts) {
        try {
          const productData = shopify.transformToProduct(shopifyProduct, supplier.id);
          
          if (existingProductIds.has(shopifyProduct.id.toString())) {
            // Update existing product
            const existing = existingProducts.find(p => p.supplierProductId === shopifyProduct.id.toString());
            if (existing) {
              await storage.updateProduct(existing.id, {
                ...productData,
                id: undefined, // Don't update ID
              } as any);
              updated++;
            }
          } else {
            // Create new product
            await storage.createProduct(productData);
            created++;
          }
        } catch (err: any) {
          console.error(`Error syncing product ${shopifyProduct.id}:`, err.message);
          errors++;
        }
      }

      res.json({ 
        success: true, 
        data: { 
          supplier: supplier.name,
          totalProducts: shopifyProducts.length,
          created, 
          updated, 
          errors 
        } 
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Merchants
  app.get("/api/admin/merchants", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const merchants = await storage.getAllMerchants();
      res.json({ success: true, data: merchants });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/admin/merchants/:id", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const merchant = await storage.getMerchant(parseInt(req.params.id));
      if (!merchant) {
        return res.status(404).json({ success: false, error: "Merchant not found" });
      }
      res.json({ success: true, data: merchant });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.put("/api/admin/merchants/:id", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const merchant = await storage.updateMerchant(parseInt(req.params.id), req.body);
      if (!merchant) {
        return res.status(404).json({ success: false, error: "Merchant not found" });
      }
      res.json({ success: true, data: merchant });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // Global Products
  app.get("/api/admin/products", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const products = await storage.getGlobalProducts();
      res.json({ success: true, data: products });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/admin/products", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const product = await storage.createProduct({
        ...req.body,
        isGlobal: true,
        merchantId: null,
      });
      res.json({ success: true, data: product });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/api/admin/products/:id", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const product = await storage.getProduct(parseInt(req.params.id));
      if (!product) {
        return res.status(404).json({ success: false, error: "Product not found" });
      }
      res.json({ success: true, data: product });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.put("/api/admin/products/:id", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const product = await storage.updateProduct(parseInt(req.params.id), req.body);
      if (!product) {
        return res.status(404).json({ success: false, error: "Product not found" });
      }
      res.json({ success: true, data: product });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.delete("/api/admin/products/:id", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteProduct(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // Update single product pricing/markup
  app.patch("/api/admin/products/:id/pricing", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const { pricingRule } = req.body;
      if (!pricingRule || !["percentage", "fixed"].includes(pricingRule.type) || typeof pricingRule.value !== "number") {
        return res.status(400).json({ success: false, error: "Invalid pricing rule. Must include type (percentage/fixed) and numeric value." });
      }
      const product = await storage.updateProductPricing(parseInt(req.params.id), pricingRule);
      if (!product) {
        return res.status(404).json({ success: false, error: "Product not found" });
      }
      res.json({ success: true, data: product });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // Bulk update product pricing/markup
  app.patch("/api/admin/products/bulk-pricing", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const { productIds, pricingRule } = req.body;
      if (!Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ success: false, error: "productIds must be a non-empty array" });
      }
      if (!pricingRule || !["percentage", "fixed"].includes(pricingRule.type) || typeof pricingRule.value !== "number") {
        return res.status(400).json({ success: false, error: "Invalid pricing rule. Must include type (percentage/fixed) and numeric value." });
      }
      const result = await storage.bulkUpdateProductPricing(productIds, pricingRule);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // All Orders (Admin)
  app.get("/api/admin/orders", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const merchants = await storage.getAllMerchants();
      let allOrders: any[] = [];
      for (const merchant of merchants) {
        const orders = await storage.getOrdersByMerchant(merchant.id);
        allOrders = [...allOrders, ...orders.map(o => ({ ...o, merchantName: merchant.businessName }))];
      }
      allOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      res.json({ success: true, data: allOrders });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Plans (Admin)
  app.get("/api/admin/plans", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const plans = await storage.getAllPlans();
      res.json({ success: true, data: plans });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ==================== MERCHANT ROUTES ====================
  app.get("/api/merchant/dashboard", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }
      const stats = await storage.getMerchantDashboardStats(req.user.merchantId);
      res.json({ success: true, data: stats });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Product Catalog (global products for import)
  app.get("/api/merchant/catalog", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      const products = await storage.getGlobalProducts();
      const suppliers = await storage.getActiveSuppliers();
      res.json({ success: true, data: { products, suppliers } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // My Products (merchant's imported products)
  app.get("/api/merchant/products", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }
      const products = await storage.getProductsByMerchant(req.user.merchantId);
      res.json({ success: true, data: products });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/merchant/products/import", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const { productId, pricingRule } = req.body;
      const globalProduct = await storage.getProduct(productId);
      
      if (!globalProduct) {
        return res.status(404).json({ success: false, error: "Product not found" });
      }

      const merchant = await storage.getMerchant(req.user.merchantId);
      if (!merchant) {
        return res.status(404).json({ success: false, error: "Merchant not found" });
      }

      const currentProducts = await storage.getProductsByMerchant(req.user.merchantId);
      if (currentProducts.length >= (merchant.productLimit || 50)) {
        return res.status(400).json({ success: false, error: "Product limit reached. Upgrade your plan." });
      }

      let merchantPrice = globalProduct.supplierPrice;
      if (pricingRule) {
        if (pricingRule.type === "fixed") {
          merchantPrice = globalProduct.supplierPrice + pricingRule.value;
        } else if (pricingRule.type === "percentage") {
          merchantPrice = Math.round(globalProduct.supplierPrice * (1 + pricingRule.value / 100));
        }
      }

      const importedProduct = await storage.createProduct({
        merchantId: req.user.merchantId,
        supplierId: globalProduct.supplierId,
        title: globalProduct.title,
        description: globalProduct.description,
        category: globalProduct.category,
        tags: globalProduct.tags,
        images: globalProduct.images,
        variants: globalProduct.variants,
        supplierProductId: globalProduct.supplierProductId,
        supplierSku: globalProduct.supplierSku,
        supplierPrice: globalProduct.supplierPrice,
        merchantPrice,
        pricingRule,
        inventoryQuantity: globalProduct.inventoryQuantity,
        lowStockThreshold: globalProduct.lowStockThreshold,
        trackInventory: globalProduct.trackInventory,
        status: "active",
        isGlobal: false,
        syncStatus: "synced",
        importedAt: new Date(),
      });

      await storage.updateMerchant(req.user.merchantId, {
        currentProductCount: currentProducts.length + 1,
      });

      res.json({ success: true, data: importedProduct });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.put("/api/merchant/products/:id", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const product = await storage.getProduct(parseInt(req.params.id));
      if (!product || product.merchantId !== req.user.merchantId) {
        return res.status(404).json({ success: false, error: "Product not found" });
      }

      const updatedProduct = await storage.updateProduct(parseInt(req.params.id), req.body);
      res.json({ success: true, data: updatedProduct });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.delete("/api/merchant/products/:id", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const product = await storage.getProduct(parseInt(req.params.id));
      if (!product || product.merchantId !== req.user.merchantId) {
        return res.status(404).json({ success: false, error: "Product not found" });
      }

      await storage.deleteProduct(parseInt(req.params.id));

      const remainingProducts = await storage.getProductsByMerchant(req.user.merchantId);
      await storage.updateMerchant(req.user.merchantId, {
        currentProductCount: remainingProducts.length,
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // Orders
  app.get("/api/merchant/orders", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }
      const orders = await storage.getOrdersByMerchant(req.user.merchantId);
      res.json({ success: true, data: orders });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/merchant/orders/:id", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const order = await storage.getOrder(parseInt(req.params.id));
      if (!order || order.merchantId !== req.user.merchantId) {
        return res.status(404).json({ success: false, error: "Order not found" });
      }

      res.json({ success: true, data: order });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.put("/api/merchant/orders/:id", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const order = await storage.getOrder(parseInt(req.params.id));
      if (!order || order.merchantId !== req.user.merchantId) {
        return res.status(404).json({ success: false, error: "Order not found" });
      }

      const updatedOrder = await storage.updateOrder(parseInt(req.params.id), req.body);
      res.json({ success: true, data: updatedOrder });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/merchant/orders/:id/fulfill", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const order = await storage.getOrder(parseInt(req.params.id));
      if (!order || order.merchantId !== req.user.merchantId) {
        return res.status(404).json({ success: false, error: "Order not found" });
      }

      const updatedOrder = await storage.updateOrder(parseInt(req.params.id), {
        fulfillmentStatus: "fulfilled",
        status: "completed",
      });
      res.json({ success: true, data: updatedOrder });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // Customers
  app.get("/api/merchant/customers", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }
      const customers = await storage.getCustomersByMerchant(req.user.merchantId);
      res.json({ success: true, data: customers });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/merchant/customers", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const customer = await storage.createCustomer({
        ...req.body,
        merchantId: req.user.merchantId,
      });
      res.json({ success: true, data: customer });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/api/merchant/customers/:id", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const customer = await storage.getCustomer(parseInt(req.params.id));
      if (!customer || customer.merchantId !== req.user.merchantId) {
        return res.status(404).json({ success: false, error: "Customer not found" });
      }

      const orders = await storage.getOrdersByCustomer(customer.id);
      res.json({ success: true, data: { customer, orders } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.put("/api/merchant/customers/:id", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const customer = await storage.getCustomer(parseInt(req.params.id));
      if (!customer || customer.merchantId !== req.user.merchantId) {
        return res.status(404).json({ success: false, error: "Customer not found" });
      }

      const updatedCustomer = await storage.updateCustomer(parseInt(req.params.id), req.body);
      res.json({ success: true, data: updatedCustomer });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // Team Management
  app.get("/api/merchant/team", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const teamMembers = await storage.getUsersByMerchant(req.user.merchantId);
      const invitations = await storage.getInvitationsByMerchant(req.user.merchantId);

      res.json({
        success: true,
        data: {
          members: teamMembers.map(m => {
            const { password: _, ...member } = m;
            return member;
          }),
          invitations,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/merchant/team/invite", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const { email, name, permissions } = req.body;

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ success: false, error: "User with this email already exists" });
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const invitation = await storage.createStaffInvitation({
        merchantId: req.user.merchantId,
        email,
        name,
        permissions: permissions || [],
        invitedBy: req.user.id,
        status: "pending",
        token: randomUUID(),
        expiresAt,
      });

      res.json({ success: true, data: invitation });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/merchant/team/accept/:token", async (req: Request, res: Response) => {
    try {
      const invitation = await storage.getStaffInvitationByToken(req.params.token);
      
      if (!invitation) {
        return res.status(404).json({ success: false, error: "Invitation not found" });
      }

      if (invitation.status !== "pending") {
        return res.status(400).json({ success: false, error: "Invitation already used or expired" });
      }

      if (new Date(invitation.expiresAt) < new Date()) {
        await storage.updateStaffInvitation(invitation.id, { status: "expired" });
        return res.status(400).json({ success: false, error: "Invitation expired" });
      }

      const { password } = req.body;
      if (!password || password.length < 8) {
        return res.status(400).json({ success: false, error: "Password must be at least 8 characters" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await storage.createUser({
        email: invitation.email,
        password: hashedPassword,
        name: invitation.name,
        role: "staff",
        merchantId: invitation.merchantId,
        isActive: true,
        isEmailVerified: true,
        permissions: invitation.permissions || [],
      });

      await storage.updateStaffInvitation(invitation.id, { status: "accepted" });

      const { password: _, ...userWithoutPassword } = user;
      const token = generateToken(userWithoutPassword);

      res.json({
        success: true,
        data: {
          user: userWithoutPassword,
          token,
        },
      });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // Settings
  app.get("/api/merchant/settings", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const merchant = await storage.getMerchant(req.user.merchantId);
      if (!merchant) {
        return res.status(404).json({ success: false, error: "Merchant not found" });
      }

      res.json({ success: true, data: merchant });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.put("/api/merchant/settings", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const merchant = await storage.updateMerchant(req.user.merchantId, req.body);
      res.json({ success: true, data: merchant });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // Subscription
  app.get("/api/merchant/subscription", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const subscription = await storage.getSubscriptionByMerchant(req.user.merchantId);
      const plans = await storage.getActivePlans();

      let currentPlan = null;
      if (subscription) {
        currentPlan = await storage.getPlan(subscription.planId);
      }

      // Get FREE FOR LIFE plan for progress tracking
      const freeForLifePlan = await storage.getPlanBySlug("free_for_life");

      res.json({
        success: true,
        data: {
          subscription,
          currentPlan,
          availablePlans: plans,
          freeForLifePlan,
          freeForLifeThreshold: 5000000, // $50,000 in cents
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Upgrade subscription
  app.post("/api/merchant/subscription/upgrade", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const { planSlug, billingInterval } = req.body;

      const newPlan = await storage.getPlanBySlug(planSlug);
      if (!newPlan) {
        return res.status(404).json({ success: false, error: "Plan not found" });
      }

      const subscription = await storage.getSubscriptionByMerchant(req.user.merchantId);
      if (!subscription) {
        return res.status(404).json({ success: false, error: "No subscription found" });
      }

      // Update subscription
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + (billingInterval === "yearly" ? 12 : 1));

      const updatedSubscription = await storage.updateSubscription(subscription.id, {
        planId: newPlan.id,
        planSlug: newPlan.slug,
        status: "active",
        billingInterval: billingInterval || "monthly",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        adsEnabled: (newPlan.dailyAdsLimit || 0) > 0,
        dailyAdsLimit: newPlan.dailyAdsLimit || 0,
      });

      // Update merchant's product limit
      await storage.updateMerchant(req.user.merchantId, {
        subscriptionPlanId: newPlan.id,
        subscriptionStatus: "active",
        productLimit: newPlan.productLimit,
      });

      res.json({ success: true, data: updatedSubscription });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // Check FREE FOR LIFE eligibility
  app.post("/api/merchant/subscription/check-free-for-life", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const unlocked = await storage.checkAndUnlockFreeForLife(req.user.merchantId);
      const subscription = await storage.getSubscriptionByMerchant(req.user.merchantId);

      res.json({
        success: true,
        data: {
          unlocked,
          subscription,
          lifetimeSales: subscription?.lifetimeSales || 0,
          progressPercentage: subscription?.progressToFreeForLife || 0,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ==================== AD CREATIVES ROUTES ====================
  app.get("/api/merchant/ads", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const adCreatives = await storage.getAdCreativesByMerchant(req.user.merchantId);
      const subscription = await storage.getSubscriptionByMerchant(req.user.merchantId);
      const currentPlan = subscription ? await storage.getPlan(subscription.planId) : null;

      const todaysCount = await storage.getTodaysAdCreativeCount(req.user.merchantId);
      const dailyLimit = subscription?.dailyAdsLimit ?? currentPlan?.dailyAdsLimit ?? 0;

      res.json({
        success: true,
        data: {
          ads: adCreatives,
          adsEnabled: subscription?.adsEnabled ?? false,
          dailyLimit: dailyLimit === -1 ? "unlimited" : dailyLimit,
          adsGeneratedToday: todaysCount,
          remainingToday: dailyLimit === -1 ? "unlimited" : Math.max(0, dailyLimit - todaysCount),
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/merchant/ads/generate", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const subscription = await storage.getSubscriptionByMerchant(req.user.merchantId);
      if (!subscription?.adsEnabled) {
        return res.status(403).json({ success: false, error: "Ads feature not enabled for your plan" });
      }

      const dailyLimit = subscription.dailyAdsLimit ?? 0;
      const todaysCount = await storage.getTodaysAdCreativeCount(req.user.merchantId);

      if (dailyLimit !== -1 && todaysCount >= dailyLimit) {
        return res.status(403).json({ 
          success: false, 
          error: "Daily ad generation limit reached. Upgrade your plan for more.",
          data: { dailyLimit, generated: todaysCount }
        });
      }

      const { productId, platform, format } = req.body;

      // For now, generate a placeholder ad creative (AI integration would go here)
      const adCreative = await storage.createAdCreative({
        merchantId: req.user.merchantId,
        productId: productId || null,
        platform: platform || "general",
        format: format || "square",
        headline: "Your Amazing Product",
        adCopy: "Discover the best deals on quality products. Limited time offer!",
        callToAction: "Shop Now",
        hashtags: ["#deals", "#shopping", "#sale"],
        isAiGenerated: true,
      });

      res.json({ success: true, data: adCreative });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/merchant/ads/:id/download", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const adCreative = await storage.getAdCreative(parseInt(req.params.id));
      if (!adCreative || adCreative.merchantId !== req.user.merchantId) {
        return res.status(404).json({ success: false, error: "Ad creative not found" });
      }

      const updated = await storage.incrementAdDownloadCount(adCreative.id);
      res.json({ success: true, data: updated });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // Notifications
  app.get("/api/notifications", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const notifications = await storage.getNotificationsByUser(req.user!.id);
      res.json({ success: true, data: notifications });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.put("/api/notifications/:id/read", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const notification = await storage.markNotificationRead(parseInt(req.params.id));
      res.json({ success: true, data: notification });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // Public Plans
  app.get("/api/plans", async (req: Request, res: Response) => {
    try {
      const plans = await storage.getActivePlans();
      res.json({ success: true, data: plans });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Suppliers (public for catalog browsing)
  app.get("/api/suppliers", async (req: Request, res: Response) => {
    try {
      const suppliers = await storage.getActiveSuppliers();
      const publicSuppliers = suppliers.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        description: s.description,
        logo: s.logo,
        rating: s.rating,
        totalProducts: s.totalProducts,
      }));
      res.json({ success: true, data: publicSuppliers });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return httpServer;
}
