import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  loginSchema,
  registerSchema,
  phoneLoginRequestSchema,
  phoneVerifySchema,
  googleAuthSchema,
  insertSupplierSchema,
  insertProductSchema,
  insertCustomerSchema,
  insertOrderSchema,
  insertStaffInvitationSchema,
  insertCategorySchema,
  type User,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { stripeService } from "./stripeService";
import { getStripePublishableKey, getUncachableStripeClient } from "./stripeClient";
import { supplierSyncService } from "./services/supplierSync";
import { orderFulfillmentService } from "./services/orderFulfillment";
import { analyticsEvents } from "./services/analyticsEvents";

const JWT_SECRET = process.env.SESSION_SECRET;
if (!JWT_SECRET) {
  console.error("FATAL: SESSION_SECRET environment variable is required");
}
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
  await storage.seedSampleOrders();

  // ==================== SHOPIFY OAUTH ROUTES ====================
  // These routes handle public app installation from Shopify App Store
  
  // In-memory nonce store for OAuth state validation (consider Redis for production)
  const oauthNonces = new Map<string, { shop: string; timestamp: number }>();

  // Cleanup old nonces every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [nonce, data] of oauthNonces.entries()) {
      if (now - data.timestamp > 10 * 60 * 1000) { // 10 minutes expiry
        oauthNonces.delete(nonce);
      }
    }
  }, 5 * 60 * 1000);

  // Get app URL for OAuth redirects
  function getAppUrl(req: Request): string {
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host || req.hostname;
    return `${protocol}://${host}`;
  }

  // Install route - merchants start here from Shopify App Store
  app.get("/api/shopify/oauth/install", async (req: Request, res: Response) => {
    try {
      const { 
        isShopifyConfigured, 
        getShopifyConfig, 
        validateShopDomain, 
        generateNonce, 
        buildInstallUrl 
      } = await import("./shopifyOAuth");

      if (!isShopifyConfigured()) {
        return res.status(500).json({ 
          success: false, 
          error: "Shopify app not configured. Missing SHOPIFY_API_KEY or SHOPIFY_API_SECRET." 
        });
      }

      const shop = req.query.shop as string;
      if (!shop) {
        return res.status(400).json({ success: false, error: "Missing shop parameter" });
      }

      if (!validateShopDomain(shop)) {
        return res.status(400).json({ success: false, error: "Invalid shop domain" });
      }

      const appUrl = getAppUrl(req);
      const config = getShopifyConfig(appUrl);
      if (!config) {
        return res.status(500).json({ success: false, error: "Failed to get Shopify config" });
      }

      const nonce = generateNonce();
      oauthNonces.set(nonce, { shop, timestamp: Date.now() });

      const installUrl = buildInstallUrl(shop, config, nonce);
      res.redirect(installUrl);
    } catch (error: any) {
      console.error("[Shopify OAuth] Install error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Callback route - Shopify redirects here after merchant authorization
  app.get("/api/shopify/oauth/callback", async (req: Request, res: Response) => {
    try {
      const { 
        isShopifyConfigured, 
        getShopifyConfig, 
        validateHmac, 
        exchangeCodeForToken,
        getShopInfo
      } = await import("./shopifyOAuth");

      if (!isShopifyConfigured()) {
        return res.redirect("/merchant/settings?error=shopify_not_configured");
      }

      const { shop, code, state, hmac } = req.query as Record<string, string>;

      if (!shop || !code || !state) {
        return res.redirect("/merchant/settings?error=missing_params");
      }

      // Validate HMAC for security
      const appUrl = getAppUrl(req);
      const config = getShopifyConfig(appUrl);
      if (!config) {
        return res.redirect("/merchant/settings?error=config_error");
      }

      const queryParams = { ...req.query } as Record<string, string>;
      if (!validateHmac(queryParams, config.apiSecret)) {
        console.error("[Shopify OAuth] HMAC validation failed");
        return res.redirect("/merchant/settings?error=invalid_hmac");
      }

      // Validate state/nonce
      const nonceData = oauthNonces.get(state);
      if (!nonceData || nonceData.shop !== shop) {
        console.error("[Shopify OAuth] Invalid state/nonce");
        return res.redirect("/merchant/settings?error=invalid_state");
      }
      oauthNonces.delete(state);

      // Exchange code for access token
      const tokenResponse = await exchangeCodeForToken(shop, code, config);
      const { access_token, scope } = tokenResponse;

      // Get shop info to verify connection
      const shopInfo = await getShopInfo(shop, access_token);

      console.log(`[Shopify OAuth] Successfully connected shop: ${shopInfo.shop.name} (${shop})`);

      // Store the connection temporarily in session/query for the frontend to complete
      // The frontend will call an API to associate this with the merchant
      const encodedData = encodeURIComponent(JSON.stringify({
        domain: shop,
        accessToken: access_token,
        scopes: scope.split(","),
        shopName: shopInfo.shop.name,
        shopEmail: shopInfo.shop.email,
      }));

      res.redirect(`/merchant/settings?shopify_connected=true&shopify_data=${encodedData}`);
    } catch (error: any) {
      console.error("[Shopify OAuth] Callback error:", error);
      res.redirect(`/merchant/settings?error=oauth_failed&message=${encodeURIComponent(error.message)}`);
    }
  });

  // Save Shopify connection to merchant (called by frontend after OAuth)
  app.post("/api/merchant/shopify/connect", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      const { domain, accessToken, scopes, shopName } = req.body;

      if (!domain || !accessToken) {
        return res.status(400).json({ success: false, error: "Missing domain or access token" });
      }

      const merchantId = req.user?.merchantId;
      if (!merchantId) {
        return res.status(400).json({ success: false, error: "No merchant account found" });
      }

      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(404).json({ success: false, error: "Merchant not found" });
      }

      // Update merchant with Shopify connection
      await storage.updateMerchant(merchantId, {
        shopifyStore: {
          domain,
          accessToken,
          scopes: scopes || [],
          installedAt: new Date().toISOString(),
          isConnected: true,
        },
      });

      console.log(`[Shopify] Connected merchant ${merchantId} to shop ${domain}`);

      res.json({ 
        success: true, 
        data: { 
          connected: true, 
          shopName, 
          domain 
        } 
      });
    } catch (error: any) {
      console.error("[Shopify] Connect error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Disconnect Shopify from merchant
  app.post("/api/merchant/shopify/disconnect", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) {
        return res.status(400).json({ success: false, error: "No merchant account found" });
      }

      await storage.updateMerchant(merchantId, {
        shopifyStore: {
          domain: undefined,
          accessToken: undefined,
          scopes: [],
          installedAt: undefined,
          isConnected: false,
        },
      });

      res.json({ success: true, data: { disconnected: true } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get merchant's Shopify connection status
  app.get("/api/merchant/shopify/status", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) {
        return res.status(400).json({ success: false, error: "No merchant account found" });
      }

      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(404).json({ success: false, error: "Merchant not found" });
      }

      const shopifyStore = merchant.shopifyStore as {
        domain?: string;
        isConnected?: boolean;
        scopes?: string[];
        installedAt?: string;
      } | null;

      res.json({
        success: true,
        data: {
          isConnected: shopifyStore?.isConnected || false,
          domain: shopifyStore?.domain || null,
          scopes: shopifyStore?.scopes || [],
          installedAt: shopifyStore?.installedAt || null,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

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

  // ==================== PHONE OTP AUTH ====================
  app.post("/api/auth/phone/request-otp", async (req: Request, res: Response) => {
    try {
      const { phone } = phoneLoginRequestSchema.parse(req.body);
      
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const hashedCode = await bcrypt.hash(code, 10);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      
      await storage.createOtp({
        identifier: phone,
        type: "phone_login",
        code: hashedCode,
        expiresAt,
      });

      console.log(`[OTP] Code for ${phone}: ${code}`);

      res.json({
        success: true,
        message: "OTP sent successfully",
        data: { phone, expiresIn: 600 },
      });
    } catch (error: any) {
      console.error("OTP request error:", error);
      res.status(400).json({ success: false, error: error.message || "Failed to send OTP" });
    }
  });

  app.post("/api/auth/phone/verify", async (req: Request, res: Response) => {
    try {
      const { phone, code, name, businessName } = phoneVerifySchema.parse(req.body);
      
      const otpRecord = await storage.getOtp(phone, "phone_login");
      if (!otpRecord) {
        return res.status(400).json({ success: false, error: "Invalid or expired OTP" });
      }

      if ((otpRecord.attempts ?? 0) >= 5) {
        await storage.deleteOtp(otpRecord.id);
        return res.status(400).json({ success: false, error: "Too many attempts. Please request a new code." });
      }

      const isValidCode = await bcrypt.compare(code, otpRecord.code);
      if (!isValidCode) {
        await storage.incrementOtpAttempts(otpRecord.id);
        return res.status(400).json({ success: false, error: "Invalid code" });
      }

      await storage.markOtpVerified(otpRecord.id);

      let user = await storage.getUserByPhone(phone);
      let merchant = null;
      let isNewUser = false;

      if (!user) {
        isNewUser = true;
        const userName = name || `User ${phone.slice(-4)}`;
        const userBusinessName = businessName || `${userName}'s Store`;

        user = await storage.createUser({
          phone,
          name: userName,
          role: "merchant",
          authProvider: "phone",
          isActive: true,
          isPhoneVerified: true,
          phoneVerifiedAt: new Date(),
          permissions: [],
        });

        const freePlan = await storage.getPlanByName("free");
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 14);

        merchant = await storage.createMerchant({
          businessName: userBusinessName,
          ownerEmail: `${phone}@phone.apex`,
          ownerId: user.id,
          subscriptionPlanId: freePlan?.id,
          subscriptionStatus: "trial",
          productLimit: freePlan?.productLimit || 25,
          trialEndsAt: trialEnd,
          settings: {
            branding: { companyName: userBusinessName },
            notifications: { emailOnOrder: true, emailOnLowStock: true },
            defaultPricingRule: { type: "percentage", value: 20 },
            autoFulfillment: false,
            autoSyncInventory: true,
          },
          isActive: true,
        });

        await storage.updateUser(user.id, { merchantId: merchant.id });
        user = { ...user, merchantId: merchant.id };

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
      } else {
        if (user.merchantId) {
          merchant = await storage.getMerchant(user.merchantId);
        }
        await storage.updateUser(user.id, { 
          lastLoginAt: new Date(),
          isPhoneVerified: true,
          phoneVerifiedAt: new Date(),
        });
      }

      const { password: _, ...userWithoutPassword } = user;
      const token = generateToken(userWithoutPassword);

      res.json({
        success: true,
        data: {
          user: userWithoutPassword,
          merchant,
          token,
          isNewUser,
        },
      });
    } catch (error: any) {
      console.error("Phone verify error:", error);
      res.status(400).json({ success: false, error: error.message || "Verification failed" });
    }
  });

  // ==================== GOOGLE OAUTH ====================
  app.post("/api/auth/google", async (req: Request, res: Response) => {
    try {
      const { credential, name: providedName, businessName: providedBusinessName } = googleAuthSchema.parse(req.body);
      
      const googleClientId = process.env.GOOGLE_CLIENT_ID;
      if (!googleClientId) {
        return res.status(500).json({ success: false, error: "Google OAuth not configured" });
      }

      const verifyResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
      if (!verifyResponse.ok) {
        return res.status(400).json({ success: false, error: "Invalid Google token" });
      }
      
      const payload = await verifyResponse.json();
      
      if (payload.aud !== googleClientId) {
        return res.status(400).json({ success: false, error: "Token not issued for this application" });
      }
      
      const { sub: googleId, email, name: googleName, picture } = payload;
      
      if (!googleId || !email) {
        return res.status(400).json({ success: false, error: "Invalid Google token" });
      }

      let user = await storage.getUserByGoogleId(googleId);
      let merchant = null;
      let isNewUser = false;

      if (!user) {
        user = await storage.getUserByEmail(email);
        
        if (user) {
          await storage.updateUser(user.id, { 
            googleId,
            avatar: picture || user.avatar,
            isEmailVerified: true,
            emailVerifiedAt: new Date(),
          });
        } else {
          isNewUser = true;
          const userName = providedName || googleName || email.split('@')[0];
          const userBusinessName = providedBusinessName || `${userName}'s Store`;

          user = await storage.createUser({
            email,
            name: userName,
            role: "merchant",
            authProvider: "google",
            googleId,
            avatar: picture,
            isActive: true,
            isEmailVerified: true,
            emailVerifiedAt: new Date(),
            permissions: [],
          });

          const freePlan = await storage.getPlanByName("free");
          const trialEnd = new Date();
          trialEnd.setDate(trialEnd.getDate() + 14);

          merchant = await storage.createMerchant({
            businessName: userBusinessName,
            ownerEmail: email,
            ownerId: user.id,
            subscriptionPlanId: freePlan?.id,
            subscriptionStatus: "trial",
            productLimit: freePlan?.productLimit || 25,
            trialEndsAt: trialEnd,
            settings: {
              branding: { companyName: userBusinessName },
              notifications: { emailOnOrder: true, emailOnLowStock: true },
              defaultPricingRule: { type: "percentage", value: 20 },
              autoFulfillment: false,
              autoSyncInventory: true,
            },
            isActive: true,
          });

          await storage.updateUser(user.id, { merchantId: merchant.id });
          user = { ...user, merchantId: merchant.id };

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
        }
      }

      if (!merchant && user.merchantId) {
        merchant = await storage.getMerchant(user.merchantId);
      }

      await storage.updateUser(user.id, { lastLoginAt: new Date() });

      const { password: _, ...userWithoutPassword } = user;
      const token = generateToken(userWithoutPassword);

      res.json({
        success: true,
        data: {
          user: userWithoutPassword,
          merchant,
          token,
          isNewUser,
        },
      });
    } catch (error: any) {
      console.error("Google auth error:", error);
      res.status(400).json({ success: false, error: error.message || "Google authentication failed" });
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

  // Admin Analytics - Revenue Chart
  app.get("/api/admin/analytics/revenue", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const chartData = await storage.getRevenueChart(undefined, days);
      res.json({ success: true, data: chartData });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Admin Analytics - Top Products
  app.get("/api/admin/analytics/top-products", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const topProducts = await storage.getTopProducts(undefined, limit);
      res.json({ success: true, data: topProducts });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Admin Analytics - Order Status Breakdown
  app.get("/api/admin/analytics/order-status", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const breakdown = await storage.getOrderStatusBreakdown();
      res.json({ success: true, data: breakdown });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Admin Analytics - Recent Activity
  app.get("/api/admin/analytics/activity", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const activity = await storage.getRecentActivity(undefined, limit);
      res.json({ success: true, data: activity });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Real-time analytics status
  app.get("/api/admin/analytics/realtime-status", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const connectedClients = analyticsEvents.getConnectedClientsCount();
      res.json({ success: true, data: { connectedClients, wsPath: '/ws/analytics' } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Categories
  app.get("/api/admin/categories", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const allCategories = await storage.getAllCategories();
      res.json({ success: true, data: allCategories });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/admin/categories/:id", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const category = await storage.getCategory(parseInt(req.params.id));
      if (!category) {
        return res.status(404).json({ success: false, error: "Category not found" });
      }
      res.json({ success: true, data: category });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/admin/categories", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const validatedData = insertCategorySchema.parse(req.body);
      const existingCategory = await storage.getCategoryBySlug(validatedData.slug);
      if (existingCategory) {
        return res.status(400).json({ success: false, error: "Category with this slug already exists" });
      }
      const category = await storage.createCategory(validatedData);
      res.json({ success: true, data: category });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.put("/api/admin/categories/:id", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const category = await storage.updateCategory(parseInt(req.params.id), req.body);
      if (!category) {
        return res.status(404).json({ success: false, error: "Category not found" });
      }
      res.json({ success: true, data: category });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.delete("/api/admin/categories/:id", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteCategory(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
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

  // Get single supplier
  app.get("/api/admin/suppliers/:id", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const supplier = await storage.getSupplier(parseInt(req.params.id));
      if (!supplier) {
        return res.status(404).json({ success: false, error: "Supplier not found" });
      }
      res.json({ success: true, data: supplier });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Test supplier connection
  app.post("/api/admin/suppliers/:id/test", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const { createSupplierAdapter, validateCredentials } = await import("./supplierAdapters");
      
      const supplier = await storage.getSupplier(parseInt(req.params.id));
      if (!supplier) {
        return res.status(404).json({ success: false, error: "Supplier not found" });
      }

      const credentials = supplier.apiCredentials as any;
      const validation = validateCredentials(supplier.type as any, credentials);
      if (!validation.valid) {
        return res.status(400).json({ 
          success: false, 
          error: `Missing credentials: ${validation.missingFields.join(", ")}` 
        });
      }

      const adapter = createSupplierAdapter(supplier.type as any, credentials);
      const result = await adapter.testConnection();

      await storage.updateSupplier(supplier.id, {
        connectionStatus: result.success ? "connected" : "failed",
        lastConnectionTest: new Date(),
        connectionError: result.success ? null : result.message,
      });

      res.json({ success: result.success, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Test credentials before saving
  app.post("/api/admin/suppliers/test-credentials", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const { createSupplierAdapter, validateCredentials } = await import("./supplierAdapters");
      
      const { type, credentials } = req.body;
      if (!type || !credentials) {
        return res.status(400).json({ success: false, error: "Type and credentials are required" });
      }

      const validation = validateCredentials(type, credentials);
      if (!validation.valid) {
        return res.status(400).json({ 
          success: false, 
          error: `Missing credentials: ${validation.missingFields.join(", ")}` 
        });
      }

      const adapter = createSupplierAdapter(type, credentials);
      const result = await adapter.testConnection();

      res.json({ success: result.success, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get credential field labels for UI
  app.get("/api/admin/suppliers/credential-fields/:type", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const { getCredentialFieldLabels, getRequiredCredentialFields } = await import("./supplierAdapters");
      
      const type = req.params.type as any;
      const fields = getCredentialFieldLabels(type);
      const required = getRequiredCredentialFields(type);

      res.json({ success: true, data: { fields, required } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Sync products from a supplier
  app.post("/api/admin/suppliers/:id/sync", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const { createSupplierAdapter } = await import("./supplierAdapters");
      
      const supplier = await storage.getSupplier(parseInt(req.params.id));
      if (!supplier) {
        return res.status(404).json({ success: false, error: "Supplier not found" });
      }

      const adapter = createSupplierAdapter(supplier.type as any, supplier.apiCredentials as any);
      
      let page = 1;
      const pageSize = 50;
      let totalSynced = 0;
      let hasMore = true;

      while (hasMore) {
        const result = await adapter.fetchProducts(page, pageSize);
        
        for (const product of result.items) {
          const existingProducts = await storage.getProductsBySupplier(supplier.id);
          const existing = existingProducts.find(p => p.supplierProductId === product.supplierProductId);
          
          if (existing) {
            await storage.updateProduct(existing.id, {
              title: product.title,
              description: product.description,
              category: product.category,
              tags: product.tags,
              images: product.images,
              variants: product.variants,
              supplierPrice: product.supplierPrice,
              inventoryQuantity: product.variants[0]?.inventoryQuantity || 0,
              lastSyncedAt: new Date(),
            });
          } else {
            await storage.createProduct({
              supplierId: supplier.id,
              title: product.title,
              description: product.description,
              category: product.category,
              tags: product.tags,
              images: product.images,
              variants: product.variants,
              supplierProductId: product.supplierProductId,
              supplierSku: product.supplierSku,
              supplierPrice: product.supplierPrice,
              inventoryQuantity: product.variants[0]?.inventoryQuantity || 0,
              isGlobal: true,
              status: "active",
              lastSyncedAt: new Date(),
            });
          }
          totalSynced++;
        }

        hasMore = result.hasMore;
        page++;
        
        if (page > 10) break;
      }

      await storage.updateSupplier(supplier.id, {
        totalProducts: totalSynced,
        config: {
          ...supplier.config as any,
          lastSyncAt: new Date().toISOString(),
        },
      });

      res.json({ 
        success: true, 
        data: { 
          synced: totalSynced,
          message: `Synced ${totalSynced} products from ${supplier.name}` 
        } 
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
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

  // Get sync progress
  app.get("/api/admin/shopify/sync/progress", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const { getActiveSyncProgress } = await import("./shopify");
      const progress = getActiveSyncProgress();
      res.json({ success: true, data: progress });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Start background sync - returns immediately and syncs in background
  app.post("/api/admin/shopify/sync", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const { getShopifyService, getActiveSyncProgress } = await import("./shopify");
      const shopify = getShopifyService();
      if (!shopify) {
        return res.status(400).json({ 
          success: false, 
          error: "Shopify credentials not configured." 
        });
      }

      // Check if sync is already running
      const currentProgress = getActiveSyncProgress();
      if (currentProgress && currentProgress.status === "running") {
        return res.status(400).json({
          success: false,
          error: "A sync is already in progress. Please wait for it to complete.",
          data: currentProgress
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

      // Get existing products for this supplier (for update detection)
      const existingProducts = await storage.getProductsBySupplier(supplier.id);
      const existingProductMap = new Map<string, number>();
      for (const p of existingProducts) {
        if (p.supplierProductId) {
          existingProductMap.set(p.supplierProductId, p.id);
        }
      }

      // Return immediately - sync runs in background
      res.json({ 
        success: true, 
        message: "Sync started in background (BATCH mode). Poll /api/admin/shopify/sync/progress for updates.",
        data: {
          supplier: supplier.name,
          existingProducts: existingProducts.length
        }
      });

      // Run BATCH sync in background (much faster - inserts 250 products per batch)
      const supplierId = supplier.id;
      shopify.syncProductsBatch(
        supplierId,
        existingProductMap,
        async (productsData) => {
          return await storage.batchUpsertProducts(productsData, existingProductMap);
        },
        (progress) => {
          console.log(`[Sync Progress] ${progress.savedProducts}/${progress.totalProducts} products (${progress.createdProducts} new, ${progress.updatedProducts} updated, ${progress.errors} errors)`);
        }
      ).catch(err => {
        console.error("[Shopify Sync] Background sync failed:", err);
      });

    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================
  // SHOPIFY SUPPLIER API (GigaB2B-style features)
  // ============================================

  // Product Details - Access details of a single product
  app.get("/api/shopify/products/:productId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { getShopifyService } = await import("./shopify");
      const shopify = getShopifyService();
      if (!shopify) {
        return res.status(400).json({ success: false, error: "Shopify not configured" });
      }
      const details = await shopify.getProductDetails(req.params.productId);
      res.json({ success: true, data: details });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Product Price - Access B2B product prices
  app.get("/api/shopify/products/:productId/price", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { getShopifyService } = await import("./shopify");
      const shopify = getShopifyService();
      if (!shopify) {
        return res.status(400).json({ success: false, error: "Shopify not configured" });
      }
      const pricing = await shopify.getProductPrice(req.params.productId);
      res.json({ success: true, data: pricing });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Product Inventory - Access inventory information
  app.get("/api/shopify/products/:productId/inventory", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { getShopifyService } = await import("./shopify");
      const shopify = getShopifyService();
      if (!shopify) {
        return res.status(400).json({ success: false, error: "Shopify not configured" });
      }
      const inventory = await shopify.getProductInventory(req.params.productId);
      res.json({ success: true, data: inventory });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Sync Drop Shipping Orders - Get orders for drop shipping
  app.get("/api/shopify/orders", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { getShopifyService } = await import("./shopify");
      const shopify = getShopifyService();
      if (!shopify) {
        return res.status(400).json({ success: false, error: "Shopify not configured" });
      }
      const status = req.query.status as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const orders = await shopify.getDropShippingOrders(status, limit);
      res.json({ success: true, data: orders });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Order Status - Query order status by order ID
  app.get("/api/shopify/orders/:orderId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { getShopifyService } = await import("./shopify");
      const shopify = getShopifyService();
      if (!shopify) {
        return res.status(400).json({ success: false, error: "Shopify not configured" });
      }
      const status = await shopify.getOrderStatus(req.params.orderId);
      res.json({ success: true, data: status });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Tracking Number - Query available tracking for an order
  app.get("/api/shopify/orders/:orderId/tracking", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { getShopifyService } = await import("./shopify");
      const shopify = getShopifyService();
      if (!shopify) {
        return res.status(400).json({ success: false, error: "Shopify not configured" });
      }
      const tracking = await shopify.getTrackingNumber(req.params.orderId);
      res.json({ success: true, data: tracking });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Create Fulfillment with Tracking (for drop shipping)
  app.post("/api/shopify/orders/:orderId/fulfillment", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { getShopifyService } = await import("./shopify");
      const shopify = getShopifyService();
      if (!shopify) {
        return res.status(400).json({ success: false, error: "Shopify not configured" });
      }
      const { trackingNumber, trackingCompany, trackingUrl } = req.body;
      if (!trackingNumber) {
        return res.status(400).json({ success: false, error: "trackingNumber is required" });
      }
      const result = await shopify.createFulfillment(req.params.orderId, trackingNumber, trackingCompany, trackingUrl);
      if (result.success) {
        res.json({ success: true, data: { fulfillmentId: result.fulfillmentId } });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GigaB2B supplier integration
  app.get("/api/admin/gigab2b/test", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const { getGigaB2BService } = await import("./gigab2b");
      const gigab2b = getGigaB2BService();
      if (!gigab2b) {
        return res.status(400).json({ 
          success: false, 
          error: "GigaB2B credentials not configured. Please set GIGAB2B_CLIENT_ID and GIGAB2B_CLIENT_SECRET." 
        });
      }
      const result = await gigab2b.testConnection();
      res.json({ success: result.success, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Debug endpoint to test GigaB2B API with provided signature
  app.get("/api/admin/gigab2b/debug", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    const clientId = process.env.GIGAB2B_CLIENT_ID;
    const clientSecret = process.env.GIGAB2B_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      return res.status(400).json({ error: "Missing GigaB2B credentials" });
    }

    // Test with user-provided signature values
    const timestamp = req.query.timestamp as string || String(Date.now());
    const nonce = req.query.nonce as string || "abc1234567";
    const sign = req.query.sign as string;
    const apiPath = req.query.path as string || "/product/list";

    const results: any[] = [];
    const baseUrls = [
      "https://openapi.gigab2b.com",
      "https://www.gigab2b.com/openApi",
      "https://api.gigab2b.com"
    ];

    for (const baseUrl of baseUrls) {
      const params = new URLSearchParams({
        clientId,
        timestamp,
        nonce,
        sign: sign || "test",
        page: "1",
        pageSize: "1"
      });
      
      const url = `${baseUrl}${apiPath}?${params.toString()}`;
      
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: { "Accept": "application/json" }
        });
        const text = await response.text();
        results.push({
          baseUrl,
          path: apiPath,
          fullUrl: url.substring(0, 100) + "...",
          status: response.status,
          response: text.substring(0, 300)
        });
      } catch (e: any) {
        results.push({ baseUrl, path: apiPath, error: e.message });
      }
    }

    res.json({ 
      clientIdPrefix: clientId.substring(0, 10) + "...",
      timestamp,
      nonce,
      signProvided: !!sign,
      results 
    });
  });

  // Get GigaB2B sync progress
  app.get("/api/admin/gigab2b/sync/progress", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const { getGigaB2BService } = await import("./gigab2b");
      const gigab2b = getGigaB2BService();
      if (!gigab2b) {
        return res.json({ success: true, data: { status: "idle" } });
      }
      const progress = gigab2b.getSyncProgress();
      res.json({ success: true, data: progress });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Start GigaB2B background sync
  app.post("/api/admin/gigab2b/sync", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const { getGigaB2BService } = await import("./gigab2b");
      const gigab2b = getGigaB2BService();
      if (!gigab2b) {
        return res.status(400).json({ 
          success: false, 
          error: "GigaB2B credentials not configured." 
        });
      }

      // Check if sync is already running
      const currentProgress = gigab2b.getSyncProgress();
      if (currentProgress && currentProgress.status === "running") {
        return res.status(400).json({
          success: false,
          error: "A sync is already in progress. Please wait for it to complete.",
          data: currentProgress
        });
      }

      // Test connection first
      const connectionTest = await gigab2b.testConnection();
      if (!connectionTest.success) {
        return res.status(400).json({ 
          success: false, 
          error: `GigaB2B connection failed: ${connectionTest.error}` 
        });
      }

      // Find or create GigaB2B supplier
      let supplier = (await storage.getAllSuppliers()).find(s => s.type === "gigab2b");
      if (!supplier) {
        supplier = await storage.createSupplier({
          name: connectionTest.accountName || "GigaB2B",
          type: "gigab2b",
          description: "Products from GigaB2B wholesale marketplace",
          isActive: true,
          createdBy: req.user!.id,
        });
      }

      // Return immediately - sync runs in background
      res.json({ 
        success: true, 
        message: "Sync started in background. Poll /api/admin/gigab2b/sync/progress for updates.",
        data: {
          supplier: supplier.name
        }
      });

      // Run sync in background
      const supplierId = supplier.id;
      gigab2b.syncAllProducts(
        supplierId,
        async (productsData) => {
          const existingProductMap = new Map<string, number>();
          return await storage.batchUpsertProducts(productsData, existingProductMap);
        }
      ).catch(err => {
        console.error("[GigaB2B Sync] Background sync failed:", err);
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

  // Global Products (Paginated for 60k+ products)
  app.get("/api/admin/products", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const { 
        page = "1", 
        pageSize = "50", 
        search,
        supplierId,
        category,
        categoryId,
        status,
        sortBy = "createdAt",
        sortDirection = "desc"
      } = req.query;

      const paginatedProducts = await storage.getGlobalProductsPaginated({
        page: parseInt(page as string, 10) || 1,
        pageSize: Math.min(parseInt(pageSize as string, 10) || 50, 100),
        search: search as string | undefined,
        supplierId: supplierId && supplierId !== "all" ? parseInt(supplierId as string, 10) : undefined,
        category: category as string | undefined,
        categoryId: categoryId && categoryId !== "all" ? parseInt(categoryId as string, 10) : undefined,
        sortBy: (sortBy as "createdAt" | "price" | "title" | "stock") || "createdAt",
        sortDirection: (sortDirection as "asc" | "desc") || "desc"
      });

      const suppliers = await storage.getActiveSuppliers();
      res.json({ 
        success: true, 
        data: { 
          products: paginatedProducts.items,
          suppliers,
          pagination: {
            total: paginatedProducts.total,
            page: paginatedProducts.page,
            pageSize: paginatedProducts.pageSize,
            totalPages: paginatedProducts.totalPages
          }
        } 
      });
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

  // ==================== SUPPLIER SYNC STATUS ====================
  app.get("/api/admin/sync/status", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const status = supplierSyncService.getStatus();
      res.json({ success: true, data: status });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/admin/sync/run", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      // Run sync in background, don't wait for completion
      supplierSyncService.runSync().catch(err => console.error("[Admin] Manual sync error:", err));
      res.json({ success: true, message: "Sync started" });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ==================== SUPPLIER ORDER FULFILLMENT ====================
  // Get pending supplier orders for fulfillment
  app.get("/api/admin/supplier-orders/pending", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const orders = await storage.getPendingSupplierOrders();
      res.json({ success: true, data: orders });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Submit order to supplier for fulfillment
  app.post("/api/admin/supplier-orders/:id/submit", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const { createSupplierAdapter } = await import("./supplierAdapters");
      
      const supplierOrder = await storage.getSupplierOrder(parseInt(req.params.id));
      if (!supplierOrder) {
        return res.status(404).json({ success: false, error: "Supplier order not found" });
      }

      const supplier = await storage.getSupplier(supplierOrder.supplierId);
      if (!supplier) {
        return res.status(404).json({ success: false, error: "Supplier not found" });
      }

      const adapter = createSupplierAdapter(supplier.type as any, supplier.apiCredentials as any);
      
      const result = await adapter.createOrder({
        orderId: supplierOrder.orderId.toString(),
        items: (supplierOrder.items || []).map(item => ({
          sku: item.sku,
          quantity: item.quantity,
          price: item.price,
        })),
        shippingAddress: supplierOrder.shippingAddress || {
          firstName: "",
          lastName: "",
          address1: "",
          city: "",
          country: "",
          zip: "",
        },
      });

      await storage.updateSupplierOrder(supplierOrder.id, {
        status: result.success ? "submitted" : "failed",
        supplierOrderId: result.orderId,
        submittedAt: new Date(),
        errorMessage: result.success ? undefined : result.message,
      });

      res.json({ success: result.success, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get fulfillment/tracking info from supplier
  app.get("/api/admin/supplier-orders/:id/tracking", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const { createSupplierAdapter } = await import("./supplierAdapters");
      
      const supplierOrder = await storage.getSupplierOrder(parseInt(req.params.id));
      if (!supplierOrder) {
        return res.status(404).json({ success: false, error: "Supplier order not found" });
      }

      if (!supplierOrder.supplierOrderId) {
        return res.status(400).json({ success: false, error: "Order not yet submitted to supplier" });
      }

      const supplier = await storage.getSupplier(supplierOrder.supplierId);
      if (!supplier) {
        return res.status(404).json({ success: false, error: "Supplier not found" });
      }

      const adapter = createSupplierAdapter(supplier.type as any, supplier.apiCredentials as any);
      const result = await adapter.getFulfillment(supplierOrder.supplierOrderId);

      if (result.success && result.trackingNumber) {
        await storage.updateSupplierOrder(supplierOrder.id, {
          tracking: {
            trackingNumber: result.trackingNumber,
            carrier: result.carrier,
            trackingUrl: result.trackingUrl,
            status: result.status,
            lastUpdate: new Date().toISOString(),
          },
          status: result.status === "delivered" ? "delivered" : result.status === "shipped" ? "shipped" : supplierOrder.status,
        });
      }

      res.json({ success: result.success, data: result });
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

  // Merchant Analytics - Revenue Chart
  app.get("/api/merchant/analytics/revenue", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }
      const days = parseInt(req.query.days as string) || 30;
      const chartData = await storage.getRevenueChart(req.user.merchantId, days);
      res.json({ success: true, data: chartData });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Merchant Analytics - Top Products
  app.get("/api/merchant/analytics/top-products", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }
      const limit = parseInt(req.query.limit as string) || 10;
      const topProducts = await storage.getTopProducts(req.user.merchantId, limit);
      res.json({ success: true, data: topProducts });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Merchant Analytics - Order Status Breakdown
  app.get("/api/merchant/analytics/order-status", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }
      const breakdown = await storage.getOrderStatusBreakdown(req.user.merchantId);
      res.json({ success: true, data: breakdown });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Merchant Analytics - Recent Activity
  app.get("/api/merchant/analytics/activity", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }
      const limit = parseInt(req.query.limit as string) || 20;
      const activity = await storage.getRecentActivity(req.user.merchantId, limit);
      res.json({ success: true, data: activity });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Product Catalog (global products for import) - Server-side pagination for 60k+ products
  app.get("/api/merchant/catalog", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      const { 
        page = "1", 
        pageSize = "50", 
        search,
        supplierId,
        category,
        priceMin,
        priceMax,
        inStock,
        sortBy = "createdAt",
        sortDirection = "desc"
      } = req.query;

      console.log("[MerchantCatalog] Fetching products with params:", { page, pageSize, search, supplierId, category });
      
      const paginatedProducts = await storage.getGlobalProductsPaginated({
        page: parseInt(page as string, 10) || 1,
        pageSize: Math.min(parseInt(pageSize as string, 10) || 50, 100), // Max 100 per page
        search: search as string | undefined,
        supplierId: supplierId ? parseInt(supplierId as string, 10) : undefined,
        category: category as string | undefined,
        priceMin: priceMin ? parseFloat(priceMin as string) : undefined,
        priceMax: priceMax ? parseFloat(priceMax as string) : undefined,
        inStock: inStock === "true" ? true : inStock === "false" ? false : undefined,
        sortBy: (sortBy as "createdAt" | "price" | "title" | "stock") || "createdAt",
        sortDirection: (sortDirection as "asc" | "desc") || "desc"
      });

      console.log("[MerchantCatalog] Fetched products:", { count: paginatedProducts.items.length, total: paginatedProducts.total });
      
      const suppliers = await storage.getActiveSuppliers();
      res.json({ 
        success: true, 
        data: { 
          products: paginatedProducts.items,
          suppliers,
          pagination: {
            total: paginatedProducts.total,
            page: paginatedProducts.page,
            pageSize: paginatedProducts.pageSize,
            totalPages: paginatedProducts.totalPages
          }
        } 
      });
    } catch (error: any) {
      console.error("[MerchantCatalog] Error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // AI-Powered Product Search
  app.get("/api/search/products", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { q, limit = "50", global = "true" } = req.query;
      
      if (!q || typeof q !== "string") {
        return res.status(400).json({ success: false, error: "Search query required" });
      }

      const { aiProductSearch } = await import("./services/ai-search");
      
      const results = await aiProductSearch(q, {
        limit: parseInt(limit as string),
        merchantId: req.user?.merchantId || undefined,
        isGlobal: global === "true",
      });

      res.json({ success: true, data: results });
    } catch (error: any) {
      console.error("Search error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Search Suggestions (autocomplete)
  app.get("/api/search/suggestions", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { q } = req.query;
      
      if (!q || typeof q !== "string" || q.length < 2) {
        return res.json({ success: true, data: [] });
      }

      const { getSearchSuggestions } = await import("./services/ai-search");
      const suggestions = await getSearchSuggestions(q);

      res.json({ success: true, data: suggestions });
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

  // Get single merchant product (or global catalog product for viewing)
  app.get("/api/merchant/products/:id", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }
      const productId = parseInt(req.params.id);
      const product = await storage.getProduct(productId);
      
      if (!product) {
        return res.status(404).json({ success: false, error: "Product not found" });
      }
      
      // Allow viewing if: 1) belongs to this merchant, or 2) is a global catalog product (merchantId is null)
      if (product.merchantId !== null && product.merchantId !== req.user.merchantId) {
        return res.status(403).json({ success: false, error: "Access denied" });
      }
      
      res.json({ success: true, data: product });
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

      // Create supplier orders and submit to suppliers for fulfillment
      const fulfillmentResults = await orderFulfillmentService.createSupplierOrderFromMerchantOrder(order);
      
      const allSuccessful = fulfillmentResults.every(r => r.success);
      const updatedOrder = await storage.updateOrder(parseInt(req.params.id), {
        fulfillmentStatus: allSuccessful ? "fulfilled" : "partial",
        status: allSuccessful ? "processing" : "pending",
      });
      
      res.json({ 
        success: true, 
        data: updatedOrder,
        fulfillmentResults,
      });
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

      // Get existing merchant to preserve existing settings
      const existingMerchant = await storage.getMerchant(req.user.merchantId);
      if (!existingMerchant) {
        return res.status(404).json({ success: false, error: "Merchant not found" });
      }

      const existingSettings = (existingMerchant.settings as any) || {};

      const {
        businessName,
        primaryColor,
        emailOnOrder,
        emailOnLowStock,
        smsNotifications,
        defaultPricingType,
        defaultPricingValue,
        autoFulfillment,
        autoSyncInventory,
      } = req.body;

      // Structure the settings object properly, merging with existing
      const updateData: any = {};
      
      if (businessName !== undefined) {
        updateData.businessName = businessName;
      }

      // Build settings object, merging with existing
      const settings: any = { ...existingSettings };
      
      if (primaryColor !== undefined) {
        settings.branding = { ...(existingSettings.branding || {}), primaryColor };
      }
      
      if (emailOnOrder !== undefined || emailOnLowStock !== undefined || smsNotifications !== undefined) {
        settings.notifications = {
          ...(existingSettings.notifications || {}),
          emailOnOrder: emailOnOrder ?? existingSettings.notifications?.emailOnOrder ?? true,
          emailOnLowStock: emailOnLowStock ?? existingSettings.notifications?.emailOnLowStock ?? true,
          smsNotifications: smsNotifications ?? existingSettings.notifications?.smsNotifications ?? false,
        };
      }
      
      if (defaultPricingType !== undefined || defaultPricingValue !== undefined) {
        settings.defaultPricingRule = {
          type: defaultPricingType || existingSettings.defaultPricingRule?.type || "percentage",
          value: defaultPricingValue ?? existingSettings.defaultPricingRule?.value ?? 20,
        };
      }
      
      if (autoFulfillment !== undefined) {
        settings.autoFulfillment = autoFulfillment;
      }
      
      if (autoSyncInventory !== undefined) {
        settings.autoSyncInventory = autoSyncInventory;
      }

      updateData.settings = settings;

      const merchant = await storage.updateMerchant(req.user.merchantId, updateData);
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

  // ==================== S3 IMAGE UPLOAD ROUTES ====================
  
  // Get signed URL for direct browser upload (tenant-scoped)
  app.post("/api/upload/signed-url", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { filename, contentType, folder = "products" } = req.body;
      
      if (!filename || !contentType) {
        return res.status(400).json({ success: false, error: "Filename and contentType required" });
      }

      // Validate folder
      const allowedFolders = ["products", "suppliers", "avatars", "ads"];
      if (!allowedFolders.includes(folder)) {
        return res.status(400).json({ success: false, error: "Invalid folder" });
      }

      const { getSignedUploadUrl } = await import("./services/s3-storage");
      
      // Build secure context with user/merchant scoping
      const context = {
        userId: req.user!.id,
        merchantId: req.user?.merchantId || undefined,
        folder: folder as "products" | "suppliers" | "avatars" | "ads",
      };

      const result = await getSignedUploadUrl(filename, contentType, context);

      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error("S3 signed URL error:", error);
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // Delete an image from S3 (tenant-scoped with ownership check)
  app.delete("/api/upload/:key(*)", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { key } = req.params;
      
      if (!key) {
        return res.status(400).json({ success: false, error: "Image key required" });
      }

      const { deleteImage } = await import("./services/s3-storage");
      
      const context = {
        userId: req.user!.id,
        merchantId: req.user?.merchantId || undefined,
      };

      await deleteImage(key, context);

      res.json({ success: true, message: "Image deleted successfully" });
    } catch (error: any) {
      console.error("S3 delete error:", error);
      if (error.message.includes("Access denied")) {
        return res.status(403).json({ success: false, error: error.message });
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get signed download URL for an image (tenant-scoped)
  app.get("/api/upload/download/:key(*)", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { key } = req.params;
      
      if (!key) {
        return res.status(400).json({ success: false, error: "Image key required" });
      }

      const { getSignedDownloadUrl } = await import("./services/s3-storage");
      
      const context = {
        userId: req.user!.id,
        merchantId: req.user?.merchantId || undefined,
      };

      const url = await getSignedDownloadUrl(key, context);

      res.json({ success: true, data: { url } });
    } catch (error: any) {
      if (error.message.includes("Access denied")) {
        return res.status(403).json({ success: false, error: error.message });
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ==================== STRIPE SUBSCRIPTION ROUTES ====================
  
  // Get Stripe publishable key for frontend
  app.get("/api/stripe/config", async (req: Request, res: Response) => {
    try {
      const publishableKey = getStripePublishableKey();
      res.json({ success: true, data: { publishableKey } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get subscription plans with Stripe prices
  app.get("/api/stripe/plans", async (req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      
      // Get all products with metadata
      const products = await stripe.products.list({ active: true, limit: 10 });
      
      // Get all prices
      const prices = await stripe.prices.list({ active: true, limit: 50 });
      
      // Combine products with their prices
      const plans = products.data
        .filter(p => p.metadata.planSlug) // Only our subscription products
        .map(product => {
          const productPrices = prices.data.filter(price => price.product === product.id);
          // Get the most recent (lowest ID = oldest, so we want highest/newest) monthly and yearly prices
          const monthlyPrices = productPrices
            .filter(p => p.recurring?.interval === 'month')
            .sort((a, b) => b.created - a.created); // Sort by creation date, newest first
          const yearlyPrices = productPrices
            .filter(p => p.recurring?.interval === 'year')
            .sort((a, b) => b.created - a.created); // Sort by creation date, newest first
          const monthlyPrice = monthlyPrices[0]; // Get the newest price
          const yearlyPrice = yearlyPrices[0]; // Get the newest price
          
          return {
            id: product.id,
            name: product.name,
            description: product.description,
            slug: product.metadata.planSlug,
            productLimit: parseInt(product.metadata.productLimit || '-1'),
            features: product.metadata,
            monthlyPriceId: monthlyPrice?.id,
            monthlyAmount: monthlyPrice?.unit_amount || 0,
            yearlyPriceId: yearlyPrice?.id,
            yearlyAmount: yearlyPrice?.unit_amount || 0,
          };
        })
        .sort((a, b) => a.monthlyAmount - b.monthlyAmount);
      
      res.json({ success: true, data: plans });
    } catch (error: any) {
      console.error("Error fetching Stripe plans:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Create checkout session for subscription
  app.post("/api/stripe/checkout", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      const { priceId, billingInterval } = req.body;
      
      if (!priceId) {
        return res.status(400).json({ success: false, error: "Price ID required" });
      }

      const merchant = await storage.getMerchant(req.user!.merchantId!);
      if (!merchant) {
        return res.status(404).json({ success: false, error: "Merchant not found" });
      }

      // Create or get Stripe customer
      let customerId = merchant.stripeCustomerId;
      if (!customerId) {
        const customer = await stripeService.createCustomer(
          req.user!.email!,
          merchant.id,
          merchant.businessName
        );
        customerId = customer.id;
        await stripeService.updateMerchantStripeInfo(merchant.id, { stripeCustomerId: customerId });
      }

      // Get base URL
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.get('host');
      const baseUrl = `${protocol}://${host}`;

      // Create checkout session
      const session = await stripeService.createCheckoutSession(
        customerId,
        priceId,
        merchant.id,
        `${baseUrl}/merchant/subscription?success=true`,
        `${baseUrl}/merchant/subscription?canceled=true`
      );

      res.json({ success: true, data: { url: session.url } });
    } catch (error: any) {
      console.error("Checkout error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Create customer portal session for managing subscription
  app.post("/api/stripe/portal", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      const merchant = await storage.getMerchant(req.user!.merchantId!);
      if (!merchant || !merchant.stripeCustomerId) {
        return res.status(404).json({ success: false, error: "No Stripe customer found" });
      }

      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.get('host');
      const returnUrl = `${protocol}://${host}/merchant/subscription`;

      const session = await stripeService.createCustomerPortalSession(
        merchant.stripeCustomerId,
        returnUrl
      );

      res.json({ success: true, data: { url: session.url } });
    } catch (error: any) {
      console.error("Portal error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get current subscription status
  app.get("/api/stripe/subscription", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      const merchant = await storage.getMerchant(req.user!.merchantId!);
      if (!merchant) {
        return res.status(404).json({ success: false, error: "Merchant not found" });
      }

      let stripeSubscription = null;
      if (merchant.stripeSubscriptionId) {
        const stripe = await getUncachableStripeClient();
        stripeSubscription = await stripe.subscriptions.retrieve(merchant.stripeSubscriptionId);
      }

      const subscription = await storage.getSubscriptionByMerchant(merchant.id);
      const plan = subscription ? await storage.getPlan(subscription.planId) : null;

      res.json({
        success: true,
        data: {
          merchant: {
            id: merchant.id,
            businessName: merchant.businessName,
            subscriptionStatus: merchant.subscriptionStatus,
            stripeCustomerId: merchant.stripeCustomerId,
            stripeSubscriptionId: merchant.stripeSubscriptionId,
          },
          subscription,
          plan,
          stripeSubscription: stripeSubscription ? {
            id: stripeSubscription.id,
            status: stripeSubscription.status,
            currentPeriodEnd: (stripeSubscription as any).current_period_end,
            cancelAtPeriodEnd: (stripeSubscription as any).cancel_at_period_end,
          } : null,
        },
      });
    } catch (error: any) {
      console.error("Subscription fetch error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return httpServer;
}
