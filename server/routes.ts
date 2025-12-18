import express, { type Express, Request, Response, NextFunction } from "express";
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
  insertBulkPricingRuleSchema,
  type User,
} from "@shared/schema";
import { randomUUID, randomBytes } from "crypto";
import { stripeService } from "./stripeService";
import { getStripePublishableKey, getUncachableStripeClient } from "./stripeClient";
import { supplierSyncService } from "./services/supplierSync";
import { orderFulfillmentService } from "./services/orderFulfillment";
import { analyticsEvents } from "./services/analyticsEvents";

const JWT_SECRET = process.env.SESSION_SECRET || "fallback-secret-for-development-only";
if (!process.env.SESSION_SECRET) {
  console.error("WARNING: SESSION_SECRET environment variable is not set, using fallback");
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
  await storage.seedGigaB2BSupplier();
  await storage.seedShopifyLuxuryCategories();
  await storage.seedGigaB2BCategories();
  await storage.seedSampleOrders();

  // ==================== SHOPIFY OAUTH ROUTES ====================
  // These routes handle public app installation from Shopify App Store
  
  // Import Redis helpers for distributed storage (falls back to in-memory if not configured)
  const redisModule = await import("./redis");
  const {
    getRedisClient,
    setOAuthNonce: redisSetNonce,
    getOAuthNonce: redisGetNonce,
    deleteOAuthNonce: redisDeleteNonce,
    setPendingConnection: redisSetPending,
    getPendingConnection: redisGetPending,
    deletePendingConnection: redisDeletePending,
    isRedisAvailable,
  } = redisModule;

  // Types for OAuth storage
  interface OAuthNonceData {
    shop: string;
    merchantId: number | null;  // null for automatic App Store installs
    isAppStoreInstall?: boolean;
    timestamp: number;
  }

  interface PendingConnectionData {
    domain: string;
    accessToken: string;
    scopes: string[];
    shopName: string;
    shopEmail?: string;
    merchantId: number | null;  // null for automatic App Store installs
    isAppStoreInstall?: boolean;
    timestamp: number;
  }
  
  // Initialize Redis if available
  getRedisClient();
  
  // In-memory fallback stores (used when Redis is not configured)
  const oauthNonces = new Map<string, OAuthNonceData>();
  const pendingShopifyConnections = new Map<string, PendingConnectionData>();

  // Helper functions that use Redis when available, fallback to in-memory
  async function setNonce(nonce: string, data: OAuthNonceData): Promise<void> {
    if (isRedisAvailable()) {
      await redisSetNonce(nonce, data);
    } else {
      oauthNonces.set(nonce, data);
    }
  }

  async function getNonce(nonce: string): Promise<OAuthNonceData | null> {
    if (isRedisAvailable()) {
      return await redisGetNonce(nonce);
    }
    return oauthNonces.get(nonce) || null;
  }

  async function deleteNonce(nonce: string): Promise<void> {
    if (isRedisAvailable()) {
      await redisDeleteNonce(nonce);
    } else {
      oauthNonces.delete(nonce);
    }
  }

  async function setPending(code: string, data: PendingConnectionData): Promise<void> {
    if (isRedisAvailable()) {
      await redisSetPending(code, data);
    } else {
      pendingShopifyConnections.set(code, data);
    }
  }

  async function getPending(code: string): Promise<PendingConnectionData | null> {
    if (isRedisAvailable()) {
      return await redisGetPending(code);
    }
    return pendingShopifyConnections.get(code) || null;
  }

  async function deletePending(code: string): Promise<void> {
    if (isRedisAvailable()) {
      await redisDeletePending(code);
    } else {
      pendingShopifyConnections.delete(code);
    }
  }

  // Cleanup old nonces and pending connections every 5 minutes (only for in-memory storage)
  setInterval(() => {
    if (isRedisAvailable()) return; // Redis handles TTL automatically
    const now = Date.now();
    oauthNonces.forEach((data, nonce) => {
      if (now - data.timestamp > 10 * 60 * 1000) {
        oauthNonces.delete(nonce);
      }
    });
    pendingShopifyConnections.forEach((data, code) => {
      if (now - data.timestamp > 5 * 60 * 1000) {
        pendingShopifyConnections.delete(code);
      }
    });
  }, 5 * 60 * 1000);

  // Get app URL for OAuth redirects
  function getAppUrl(req: Request): string {
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host || req.hostname;
    return `${protocol}://${host}`;
  }

  // Root URL handler for Shopify App Store installs
  // Shopify may send install requests to the App URL root with shop parameter
  app.get("/", async (req: Request, res: Response, next: NextFunction) => {
    const shop = req.query.shop as string;
    const hmac = req.query.hmac as string;
    const host = req.query.host as string;
    
    // If this is a Shopify install request (has shop and hmac), handle OAuth
    if (shop && hmac) {
      console.log(`[Shopify] Root install request for shop: ${shop}, host: ${host}`);
      
      const { 
        isShopifyConfigured, 
        getShopifyConfig, 
        validateShopDomain, 
        generateNonce, 
        buildInstallUrl 
      } = await import("./shopifyOAuth");

      if (!isShopifyConfigured()) {
        return res.status(500).send("Shopify app not configured. Please contact support.");
      }

      if (!validateShopDomain(shop)) {
        return res.status(400).send("Invalid Shopify store domain.");
      }

      const appUrl = getAppUrl(req);
      const config = getShopifyConfig(appUrl);
      if (!config) {
        return res.status(500).send("Failed to configure Shopify app.");
      }

      const nonce = generateNonce();
      await setNonce(nonce, { 
        shop, 
        merchantId: null, 
        isAppStoreInstall: true,
        host: host || null,
        timestamp: Date.now() 
      });

      const installUrl = buildInstallUrl(shop, config, nonce);
      console.log(`[Shopify] Redirecting to OAuth: ${installUrl}`);
      
      return res.redirect(installUrl);
    }
    
    // Not a Shopify request, pass to next handler (frontend)
    next();
  });

  // PUBLIC: Shopify App Store installation endpoint
  // This is the entry point when a merchant installs from Shopify App Store
  // No authentication required - merchant account will be auto-created during OAuth
  app.get("/api/shopify/install", async (req: Request, res: Response) => {
    try {
      const { 
        isShopifyConfigured, 
        getShopifyConfig, 
        validateShopDomain, 
        generateNonce, 
        buildInstallUrl 
      } = await import("./shopifyOAuth");

      if (!isShopifyConfigured()) {
        return res.status(500).send("Shopify app not configured. Please contact support.");
      }

      const shop = req.query.shop as string;
      const host = req.query.host as string;
      if (!shop) {
        return res.status(400).send("Missing shop parameter. Please install from Shopify App Store.");
      }

      if (!validateShopDomain(shop)) {
        return res.status(400).send("Invalid Shopify store domain.");
      }

      const appUrl = getAppUrl(req);
      const config = getShopifyConfig(appUrl);
      if (!config) {
        return res.status(500).send("Failed to configure Shopify app.");
      }

      const nonce = generateNonce();
      // Store nonce with null merchantId - will be created during callback
      await setNonce(nonce, { 
        shop, 
        merchantId: null, 
        isAppStoreInstall: true,
        host: host || null,
        timestamp: Date.now() 
      });

      const installUrl = buildInstallUrl(shop, config, nonce);
      console.log(`[Shopify] App Store install initiated for shop: ${shop}, host: ${host}`);
      
      res.redirect(installUrl);
    } catch (error: any) {
      console.error("[Shopify] App Store install error:", error);
      res.status(500).send("Installation failed. Please try again.");
    }
  });

  // Exchange single-use auth code for JWT (used after App Store install auto-login)
  // This prevents token injection attacks by validating the code server-side
  app.post("/api/shopify/exchange-code", async (req: Request, res: Response) => {
    try {
      const { code } = req.body;
      
      if (!code || typeof code !== "string") {
        return res.status(400).json({ success: false, error: "Missing or invalid code" });
      }
      
      // Validate auth code prefix to ensure it's an auth code, not an OAuth nonce
      if (!code.startsWith("auth_")) {
        console.error("[Shopify] Invalid auth code format - missing prefix");
        return res.status(400).json({ success: false, error: "Invalid code format" });
      }
      
      // Use dedicated auth code storage with strict TTL
      const { getAuthCode, deleteAuthCode, verifyAuthCodeDeleted } = await import("./redis");
      
      // Get auth code data - abort if Redis fails when Redis is configured
      const authResult = await getAuthCode(code);
      if (!authResult.success) {
        console.error("[Shopify] Auth code retrieval failed (Redis error):", authResult.error);
        return res.status(503).json({ success: false, error: "Service temporarily unavailable - please try again" });
      }
      
      if (!authResult.data) {
        return res.status(400).json({ success: false, error: "Invalid or expired code" });
      }
      
      const authData = authResult.data;
      
      // Immediately delete and verify deletion (single-use enforcement)
      // MUST abort if delete fails when Redis is configured
      const deleteResult = await deleteAuthCode(code);
      if (!deleteResult.success) {
        console.error("[Shopify] Auth code deletion failed (Redis error) - aborting for security:", deleteResult.error);
        return res.status(503).json({ success: false, error: "Service temporarily unavailable - please try again" });
      }
      
      const verifyResult = await verifyAuthCodeDeleted(code);
      if (!verifyResult.success) {
        console.error("[Shopify] Auth code deletion verification failed (Redis error) - aborting:", verifyResult.error);
        return res.status(503).json({ success: false, error: "Service temporarily unavailable - please try again" });
      }
      
      if (!verifyResult.data) {
        console.error("[Shopify] Auth code still exists after deletion - potential replay attack");
        return res.status(500).json({ success: false, error: "Security error - please try again" });
      }
      
      // Check code age (max 5 minutes as additional safeguard)
      if (Date.now() - authData.timestamp > 5 * 60 * 1000) {
        console.error("[Shopify] Auth code expired");
        return res.status(400).json({ success: false, error: "Code expired" });
      }
      
      // Validate required fields - merchantId must be a valid number
      const { userId, userRole, merchantId } = authData;
      
      if (!userId || !userRole || typeof merchantId !== "number" || merchantId <= 0) {
        console.error("[Shopify] Auth code missing required fields:", { userId, userRole, merchantId });
        return res.status(400).json({ success: false, error: "Invalid code data" });
      }
      
      // Verify merchant still exists before issuing JWT
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        console.error("[Shopify] Merchant no longer exists:", merchantId);
        return res.status(400).json({ success: false, error: "Merchant not found" });
      }
      
      // Generate the JWT
      const token = jwt.sign(
        { userId, role: userRole, merchantId },
        JWT_SECRET!,
        { expiresIn: "7d" }
      );
      
      console.log(`[Shopify] Auth code exchanged for JWT for merchant ${merchantId}`);
      
      return res.json({ success: true, token });
    } catch (error: any) {
      console.error("[Shopify] Code exchange error:", error);
      return res.status(500).json({ success: false, error: "Failed to exchange code" });
    }
  });

  // Install route - requires authentication to bind OAuth to specific merchant
  // Returns JSON with redirect URL so frontend can handle the redirect
  app.post("/api/shopify/oauth/install", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      const { 
        isShopifyConfigured, 
        getShopifyConfig, 
        validateShopDomain, 
        generateNonce, 
        buildInstallUrl 
      } = await import("./shopifyOAuth");

      if (!isShopifyConfigured()) {
        return res.status(500).json({ success: false, error: "Shopify app not configured" });
      }

      const merchantId = req.user?.merchantId;
      if (!merchantId) {
        return res.status(400).json({ success: false, error: "No merchant account found" });
      }

      const { shop } = req.body;
      if (!shop) {
        return res.status(400).json({ success: false, error: "Missing shop domain" });
      }

      if (!validateShopDomain(shop)) {
        return res.status(400).json({ success: false, error: "Invalid Shopify store domain" });
      }

      const appUrl = getAppUrl(req);
      const config = getShopifyConfig(appUrl);
      if (!config) {
        return res.status(500).json({ success: false, error: "Failed to get Shopify config" });
      }

      const nonce = generateNonce();
      // Bind the nonce to this specific merchant for security
      await setNonce(nonce, { shop, merchantId, timestamp: Date.now() });

      const installUrl = buildInstallUrl(shop, config, nonce);
      
      // Return the URL for the frontend to redirect to
      res.json({ success: true, redirectUrl: installUrl });
    } catch (error: any) {
      console.error("[Shopify OAuth] Install error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Callback route - Shopify redirects here after merchant authorization
  // Handles both manual installs (existing merchant) and App Store installs (auto-create merchant)
  app.get("/api/shopify/oauth/callback", async (req: Request, res: Response) => {
    try {
      const { 
        isShopifyConfigured, 
        getShopifyConfig, 
        validateHmac, 
        exchangeCodeForToken,
        getShopInfo,
        registerWebhooks
      } = await import("./shopifyOAuth");

      if (!isShopifyConfigured()) {
        return res.redirect("/merchant/integrations?error=shopify_not_configured");
      }

      const { shop, code, state, hmac } = req.query as Record<string, string>;

      if (!shop || !code || !state) {
        return res.redirect("/merchant/integrations?error=missing_params");
      }

      // Validate HMAC for security
      const appUrl = getAppUrl(req);
      const config = getShopifyConfig(appUrl);
      if (!config) {
        return res.redirect("/merchant/integrations?error=config_error");
      }

      const queryParams = { ...req.query } as Record<string, string>;
      if (!validateHmac(queryParams, config.apiSecret)) {
        console.error("[Shopify OAuth] HMAC validation failed");
        return res.redirect("/merchant/integrations?error=invalid_hmac");
      }

      // Validate state/nonce and get bound merchantId (null for App Store installs)
      const nonceData = await getNonce(state);
      if (!nonceData || nonceData.shop !== shop) {
        console.error("[Shopify OAuth] Invalid state/nonce");
        return res.redirect("/merchant/integrations?error=invalid_state");
      }
      
      const isAppStoreInstall = nonceData.isAppStoreInstall === true;
      const savedHost = nonceData.host as string | null;
      let merchantId = nonceData.merchantId;
      await deleteNonce(state);

      // Exchange code for access token
      const tokenResponse = await exchangeCodeForToken(shop, code, config);
      const { access_token, scope } = tokenResponse;

      // Get shop info to verify connection
      const shopInfo = await getShopInfo(shop, access_token);

      // For App Store installs: auto-create or find existing merchant
      if (isAppStoreInstall) {
        console.log(`[Shopify OAuth] App Store install for shop: ${shopInfo.shop.name} (${shop})`);
        
        // Check if merchant already exists with this Shopify store
        const allMerchants = await storage.getAllMerchants();
        const existingMerchant = allMerchants.find(m => {
          const store = m.shopifyStore as { domain?: string } | null;
          return store?.domain === shop || store?.domain?.includes(shop.replace('.myshopify.com', ''));
        });

        if (existingMerchant) {
          // Merchant exists - update their Shopify connection
          merchantId = existingMerchant.id;
          console.log(`[Shopify OAuth] Existing merchant found: ${merchantId}`);
        } else {
          // Create new merchant and user automatically
          const shopEmail = shopInfo.shop.email;
          const shopName = shopInfo.shop.name;
          
          // Check if user with this email already exists
          const existingUser = await storage.getUserByEmail(shopEmail);
          
          if (existingUser && existingUser.merchantId) {
            merchantId = existingUser.merchantId;
            console.log(`[Shopify OAuth] User already exists with merchant: ${merchantId}`);
          } else {
            // Create user account first if doesn't exist (we need the user id for ownerId)
            let userId: number;
            if (!existingUser) {
              const tempPassword = randomBytes(16).toString("hex");
              const hashedPassword = await bcrypt.hash(tempPassword, 10);
              
              const newUser = await storage.createUser({
                name: shopName,
                email: shopEmail,
                password: hashedPassword,
                role: "merchant",
              });
              userId = newUser.id;
            } else {
              userId = existingUser.id;
            }

            // Create new merchant with correct schema fields
            const newMerchant = await storage.createMerchant({
              businessName: shopName,
              ownerEmail: shopEmail,
              ownerId: userId,
            });
            merchantId = newMerchant.id;

            // Link user to merchant
            await storage.updateUser(userId, { merchantId: merchantId });

            console.log(`[Shopify OAuth] Created new merchant ${merchantId} for ${shopName}`);
          }
        }

        // Clear any cached ShopifyService
        const { clearMerchantShopifyService } = await import("./shopify");
        clearMerchantShopifyService(merchantId!);

        // Update merchant with Shopify connection directly
        await storage.updateMerchant(merchantId!, {
          shopifyStore: {
            domain: shop,
            accessToken: access_token,
            scopes: scope.split(","),
            installedAt: new Date().toISOString(),
            isConnected: true,
          },
        });

        // Register webhooks for automatic order sync
        try {
          await registerWebhooks(shop, access_token, appUrl);
        } catch (webhookError) {
          console.error("[Shopify OAuth] Webhook registration error:", webhookError);
        }

        console.log(`[Shopify OAuth] Successfully connected shop: ${shopInfo.shop.name} for merchant ${merchantId}`);

        // Verify merchant was actually created/found before generating auth code
        if (!merchantId) {
          console.error("[Shopify OAuth] Merchant creation failed - no merchantId available");
          return res.redirect("/login?error=merchant_creation_failed");
        }

        // Generate single-use auth code for secure auto-login (not the JWT directly)
        const users = await storage.getUsersByMerchant(merchantId);
        const user = users[0];
        if (user && JWT_SECRET) {
          // Create single-use code with "auth_" prefix to distinguish from OAuth nonces
          const { generateNonce } = await import("./shopifyOAuth");
          const { setAuthCode } = await import("./redis");
          const authCode = `auth_${generateNonce()}`;
          
          // Store auth code with dedicated storage (strict 5-minute TTL)
          // Only create auth code AFTER merchant creation is confirmed
          await setAuthCode(authCode, {
            shop,
            merchantId: merchantId,
            userId: user.id,
            userRole: user.role as string,
            timestamp: Date.now(),
          });
          
          console.log(`[Shopify OAuth] Auth code created for merchant ${merchantId}`);
          
          // For embedded apps, redirect back to Shopify Admin with proper embedded app URL
          if (savedHost) {
            try {
              // Get the SHOPIFY_API_KEY for the embedded app path
              const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
              if (SHOPIFY_API_KEY) {
                // Extract shop handle from the shop domain (e.g., "mystore" from "mystore.myshopify.com")
                const shopHandle = shop.replace('.myshopify.com', '');
                
                // Redirect to embedded app URL format: https://admin.shopify.com/store/{shop}/apps/{api_key}
                // Pass host parameter (base64 encoded) and code for auth
                const embeddedAppUrl = `https://admin.shopify.com/store/${shopHandle}/apps/${SHOPIFY_API_KEY}?host=${encodeURIComponent(savedHost)}&code=${authCode}&shop=${encodeURIComponent(shop)}`;
                console.log(`[Shopify OAuth] Embedded app redirect to: ${embeddedAppUrl}`);
                return res.redirect(embeddedAppUrl);
              }
            } catch (redirectError) {
              console.error("[Shopify OAuth] Failed to build embedded app URL:", redirectError);
            }
          }
          
          // Fallback: Redirect with secure code - not the raw JWT
          return res.redirect(`/shopify-connected?code=${authCode}&shop=${encodeURIComponent(shopInfo.shop.name)}`);
        }

        // For embedded apps without auth code, still redirect to Shopify Admin
        if (savedHost) {
          try {
            const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
            if (SHOPIFY_API_KEY) {
              const shopHandle = shop.replace('.myshopify.com', '');
              const embeddedAppUrl = `https://admin.shopify.com/store/${shopHandle}/apps/${SHOPIFY_API_KEY}?host=${encodeURIComponent(savedHost)}&shop=${encodeURIComponent(shop)}`;
              return res.redirect(embeddedAppUrl);
            }
          } catch (redirectError) {
            console.error("[Shopify OAuth] Failed to build embedded app URL:", redirectError);
          }
        }

        return res.redirect(`/dashboard?shopify_connected=true&shop=${encodeURIComponent(shopInfo.shop.name)}`);
      }

      // Manual install flow - store pending connection for frontend to finalize
      console.log(`[Shopify OAuth] Manual install for shop: ${shopInfo.shop.name} (${shop}) for merchant ${merchantId}`);

      const { generateNonce } = await import("./shopifyOAuth");
      const pendingCode = generateNonce();
      
      await setPending(pendingCode, {
        domain: shop,
        accessToken: access_token,
        scopes: scope.split(","),
        shopName: shopInfo.shop.name,
        shopEmail: shopInfo.shop.email,
        merchantId: merchantId,
        timestamp: Date.now(),
      });

      // Register webhooks for manual installs too
      try {
        await registerWebhooks(shop, access_token, appUrl);
      } catch (webhookError) {
        console.error("[Shopify OAuth] Webhook registration error:", webhookError);
      }

      // Redirect with only the secure code - no tokens in URL
      res.redirect(`/merchant/integrations?shopify_pending=${pendingCode}`);
    } catch (error: any) {
      console.error("[Shopify OAuth] Callback error:", error);
      res.redirect(`/merchant/integrations?error=oauth_failed&message=${encodeURIComponent(error.message)}`);
    }
  });

  // Save Shopify connection to merchant (called by frontend after OAuth)
  // Uses the secure pending code to retrieve token server-side - never exposes token to client
  // Validates that the pending code was issued to the same merchant now claiming it
  app.post("/api/merchant/shopify/connect", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      const { pendingCode } = req.body;

      if (!pendingCode) {
        return res.status(400).json({ success: false, error: "Missing pending code" });
      }

      const merchantId = req.user?.merchantId;
      if (!merchantId) {
        return res.status(400).json({ success: false, error: "No merchant account found" });
      }

      // Retrieve the pending connection from server-side store
      const pendingConnection = await getPending(pendingCode);
      if (!pendingConnection) {
        return res.status(400).json({ success: false, error: "Invalid or expired connection code. Please try connecting again." });
      }

      // SECURITY: Validate that the pending code belongs to this merchant
      // Prevents cross-tenant credential theft
      if (pendingConnection.merchantId !== merchantId) {
        console.error(`[Shopify] Security: Merchant ${merchantId} attempted to use pending code for merchant ${pendingConnection.merchantId}`);
        return res.status(403).json({ success: false, error: "This connection was initiated by a different merchant." });
      }

      // Remove the pending connection immediately to prevent reuse
      await deletePending(pendingCode);

      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(404).json({ success: false, error: "Merchant not found" });
      }

      // Clear any existing cached ShopifyService for this merchant
      const { clearMerchantShopifyService } = await import("./shopify");
      clearMerchantShopifyService(merchantId);

      // Update merchant with Shopify connection
      await storage.updateMerchant(merchantId, {
        shopifyStore: {
          domain: pendingConnection.domain,
          accessToken: pendingConnection.accessToken,
          scopes: pendingConnection.scopes,
          installedAt: new Date().toISOString(),
          isConnected: true,
        },
      });

      console.log(`[Shopify] Connected merchant ${merchantId} to shop ${pendingConnection.domain}`);

      res.json({ 
        success: true, 
        data: { 
          connected: true, 
          shopName: pendingConnection.shopName, 
          domain: pendingConnection.domain 
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

      // Clear cached ShopifyService
      const { clearMerchantShopifyService } = await import("./shopify");
      clearMerchantShopifyService(merchantId);

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

  // ==================== SHOPIFY WEBHOOKS ====================
  
  // Shopify orders/create webhook - receives new orders from Shopify
  // Must be registered with Shopify via Admin API after OAuth connection
  app.post("/api/shopify/webhooks/orders/create", 
    express.raw({ type: 'application/json' }),
    async (req: Request, res: Response) => {
    try {
      const hmacHeader = req.headers["x-shopify-hmac-sha256"] as string;
      const shopDomain = req.headers["x-shopify-shop-domain"] as string;
      const rawBody = req.body.toString("utf8");
      
      if (!hmacHeader || !shopDomain) {
        console.error("[Shopify Webhook] Missing required headers");
        return res.status(401).send("Unauthorized");
      }
      
      const { verifyWebhookHmac } = await import("./shopifyOAuth");
      if (!verifyWebhookHmac(rawBody, hmacHeader)) {
        console.error("[Shopify Webhook] HMAC validation failed");
        return res.status(401).send("Unauthorized");
      }
      
      const order = JSON.parse(rawBody);
      console.log(`[Shopify Webhook] Order received from ${shopDomain}: #${order.name}`);
      
      // Find merchant by shop domain
      const merchants = await storage.getAllMerchants();
      const merchant = merchants.find(m => {
        const store = m.shopifyStore as { domain?: string } | null;
        return store?.domain === shopDomain || store?.domain?.includes(shopDomain);
      });
      
      if (!merchant) {
        console.error(`[Shopify Webhook] No merchant found for shop: ${shopDomain}`);
        return res.status(200).send("OK"); // Return 200 to prevent Shopify retries
      }
      
      // Map Shopify order to our format
      const lineItems = order.line_items || [];
      const shippingAddr = order.shipping_address || {};
      
      // Look up our products by Shopify product ID
      const items: any[] = [];
      let totalCost = 0;
      let totalProfit = 0;
      
      for (const item of lineItems) {
        // Find matching merchant product by shopifyProductId
        const product = await storage.getMerchantProductByShopifyId(merchant.id, String(item.product_id));
        if (product) {
          const itemCost = (product.supplierPrice || 0) * item.quantity;
          const itemRevenue = parseFloat(item.price) * 100 * item.quantity;
          const itemProfit = itemRevenue - itemCost;
          
          items.push({
            productId: product.id,
            variantId: String(item.variant_id),
            supplierId: product.supplierId,
            title: item.title,
            variantTitle: item.variant_title,
            sku: item.sku,
            quantity: item.quantity,
            price: Math.round(parseFloat(item.price) * 100),
            cost: product.supplierPrice || 0,
            profit: Math.round(itemProfit / item.quantity),
            fulfillmentStatus: "pending",
          });
          
          totalCost += itemCost;
          totalProfit += itemProfit;
        }
      }
      
      if (items.length === 0) {
        console.log(`[Shopify Webhook] No matching products found for order ${order.name}`);
        return res.status(200).send("OK");
      }
      
      // Create order in our database
      const subtotal = Math.round(parseFloat(order.subtotal_price) * 100);
      const tax = Math.round(parseFloat(order.total_tax || "0") * 100);
      const shipping = Math.round(parseFloat(order.total_shipping_price_set?.shop_money?.amount || "0") * 100);
      const discount = Math.round(parseFloat(order.total_discounts || "0") * 100);
      const total = Math.round(parseFloat(order.total_price) * 100);
      
      const newOrder = await storage.createOrder({
        merchantId: merchant.id,
        orderNumber: order.name,
        shopifyOrderId: String(order.id),
        customerEmail: order.email || "unknown@customer.com",
        shippingAddress: {
          firstName: shippingAddr.first_name || "",
          lastName: shippingAddr.last_name || "",
          address1: shippingAddr.address1 || "",
          address2: shippingAddr.address2 || "",
          city: shippingAddr.city || "",
          province: shippingAddr.province || "",
          country: shippingAddr.country || "",
          zip: shippingAddr.zip || "",
          phone: shippingAddr.phone || "",
        },
        items,
        subtotal,
        tax,
        shipping,
        discount,
        total,
        totalCost,
        totalProfit: Math.round(totalProfit),
        status: "pending",
        paymentStatus: order.financial_status === "paid" ? "paid" : "pending",
        fulfillmentStatus: "unfulfilled",
        timeline: [{
          status: "created",
          message: `Order received from Shopify`,
          createdAt: new Date().toISOString(),
        }],
      });
      
      console.log(`[Shopify Webhook] Created order ${newOrder.id} for merchant ${merchant.id}`);
      
      // Check if merchant has auto-fulfillment enabled and sufficient wallet balance
      const merchantSettings = merchant.settings as { autoFulfillment?: boolean } | null;
      if (merchantSettings?.autoFulfillment) {
        const canFulfill = await orderFulfillmentService.canFulfillOrder(newOrder);
        if (canFulfill.canFulfill) {
          console.log(`[Shopify Webhook] Auto-fulfilling order ${newOrder.id}`);
          await orderFulfillmentService.fulfillOrderWithWallet(newOrder);
        } else {
          console.log(`[Shopify Webhook] Cannot auto-fulfill: ${canFulfill.reason}`);
        }
      }
      
      res.status(200).send("OK");
    } catch (error: any) {
      console.error("[Shopify Webhook] Error processing order:", error);
      res.status(200).send("OK"); // Return 200 to prevent Shopify retries
    }
  });

  // Shopify orders/updated webhook - receives order updates from Shopify
  app.post("/api/shopify/webhooks/orders/updated", 
    express.raw({ type: 'application/json' }),
    async (req: Request, res: Response) => {
    try {
      const hmacHeader = req.headers["x-shopify-hmac-sha256"] as string;
      const shopDomain = req.headers["x-shopify-shop-domain"] as string;
      const rawBody = req.body.toString("utf8");
      
      if (!hmacHeader || !shopDomain) {
        console.error("[Shopify Webhook] Missing required headers");
        return res.status(401).send("Unauthorized");
      }
      
      const { verifyWebhookHmac } = await import("./shopifyOAuth");
      if (!verifyWebhookHmac(rawBody, hmacHeader)) {
        console.error("[Shopify Webhook] HMAC validation failed");
        return res.status(401).send("Unauthorized");
      }
      
      const order = JSON.parse(rawBody);
      console.log(`[Shopify Webhook] Order updated from ${shopDomain}: #${order.name}`);
      
      // Find the existing order by Shopify order ID
      const existingOrder = await storage.getOrderByShopifyId(String(order.id));
      if (existingOrder) {
        // Update order status based on Shopify status
        const updates: any = {
          paymentStatus: order.financial_status === "paid" ? "paid" : 
                         order.financial_status === "refunded" ? "refunded" : "pending",
        };
        
        if (order.cancelled_at) {
          updates.status = "cancelled";
        } else if (order.fulfillment_status === "fulfilled") {
          updates.fulfillmentStatus = "fulfilled";
        }
        
        await storage.updateOrder(existingOrder.id, updates);
        console.log(`[Shopify Webhook] Updated order ${existingOrder.id}`);
      }
      
      res.status(200).send("OK");
    } catch (error: any) {
      console.error("[Shopify Webhook] Error updating order:", error);
      res.status(200).send("OK");
    }
  });

  // Shopify app/uninstalled webhook - cleanup when merchant uninstalls the app
  app.post("/api/shopify/webhooks/app/uninstalled", 
    express.raw({ type: 'application/json' }),
    async (req: Request, res: Response) => {
    try {
      const hmacHeader = req.headers["x-shopify-hmac-sha256"] as string;
      const shopDomain = req.headers["x-shopify-shop-domain"] as string;
      const rawBody = req.body.toString("utf8");
      
      if (!hmacHeader || !shopDomain) {
        console.error("[Shopify Webhook] Missing required headers");
        return res.status(401).send("Unauthorized");
      }
      
      const { verifyWebhookHmac } = await import("./shopifyOAuth");
      if (!verifyWebhookHmac(rawBody, hmacHeader)) {
        console.error("[Shopify Webhook] HMAC validation failed");
        return res.status(401).send("Unauthorized");
      }
      
      console.log(`[Shopify Webhook] App uninstalled from shop: ${shopDomain}`);
      
      // Find merchant by shop domain and disconnect
      const merchants = await storage.getAllMerchants();
      const merchant = merchants.find(m => {
        const store = m.shopifyStore as { domain?: string } | null;
        return store?.domain === shopDomain || store?.domain?.includes(shopDomain);
      });
      
      if (merchant) {
        // Clear Shopify connection
        const { clearMerchantShopifyService } = await import("./shopify");
        clearMerchantShopifyService(merchant.id);
        
        await storage.updateMerchant(merchant.id, {
          shopifyStore: {
            domain: undefined,
            accessToken: undefined,
            scopes: [],
            installedAt: undefined,
            isConnected: false,
          },
        });
        
        console.log(`[Shopify Webhook] Disconnected merchant ${merchant.id} from ${shopDomain}`);
      }
      
      res.status(200).send("OK");
    } catch (error: any) {
      console.error("[Shopify Webhook] Error processing uninstall:", error);
      res.status(200).send("OK");
    }
  });

  // Shopify app_subscriptions/update webhook - handle billing subscription changes
  app.post("/api/shopify/webhooks/app_subscriptions/update", 
    express.raw({ type: 'application/json' }),
    async (req: Request, res: Response) => {
    try {
      const hmacHeader = req.headers["x-shopify-hmac-sha256"] as string;
      const shopDomain = req.headers["x-shopify-shop-domain"] as string;
      const rawBody = req.body.toString("utf8");
      
      if (!hmacHeader || !shopDomain) {
        console.error("[Shopify Billing Webhook] Missing required headers");
        return res.status(401).send("Unauthorized");
      }
      
      const { verifyWebhookHmac } = await import("./shopifyOAuth");
      if (!verifyWebhookHmac(rawBody, hmacHeader)) {
        console.error("[Shopify Billing Webhook] HMAC validation failed");
        return res.status(401).send("Unauthorized");
      }
      
      const payload = JSON.parse(rawBody);
      const subscription = payload.app_subscription || payload;
      console.log(`[Shopify Billing Webhook] Subscription update for shop: ${shopDomain}`, subscription);
      
      // Find merchant by shop domain
      const merchants = await storage.getAllMerchants();
      const merchant = merchants.find(m => {
        const store = m.shopifyStore as { domain?: string } | null;
        return store?.domain === shopDomain || store?.domain?.includes(shopDomain);
      });
      
      if (!merchant) {
        console.error(`[Shopify Billing Webhook] Merchant not found for shop: ${shopDomain}`);
        return res.status(200).send("OK");
      }
      
      const { handleShopifySubscriptionCancelled, handleShopifySubscriptionActivated } = await import("./services/shopifyBilling");
      
      // Extract status (Shopify sends it in different cases depending on context)
      const status = (subscription.status || subscription.admin_graphql_api_id?.includes('ACTIVE') ? 'ACTIVE' : '')?.toUpperCase();
      
      // Handle subscription status changes
      if (status === "CANCELLED" || status === "EXPIRED" || status === "FROZEN") {
        await handleShopifySubscriptionCancelled(merchant.id);
        console.log(`[Shopify Billing Webhook] Cancelled subscription for merchant ${merchant.id}`);
      } else if (status === "ACTIVE") {
        // For activations via webhook, extract plan info from subscription name
        const planName = subscription.name || "";
        const planSlug = planName.toLowerCase().replace(/\s+/g, "_");
        const subscriptionId = subscription.admin_graphql_api_id || subscription.id?.toString() || "";
        
        if (subscriptionId) {
          await handleShopifySubscriptionActivated(merchant.id, subscriptionId, planSlug);
          console.log(`[Shopify Billing Webhook] Activated subscription for merchant ${merchant.id} on plan ${planSlug}`);
        }
      }
      
      res.status(200).send("OK");
    } catch (error: any) {
      console.error("[Shopify Billing Webhook] Error processing subscription update:", error);
      res.status(200).send("OK");
    }
  });

  // ==================== MERCHANT ORDERS ROUTES ====================
  
  // Get merchant orders
  app.get("/api/merchant/orders", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) {
        return res.status(400).json({ success: false, error: "No merchant account found" });
      }
      
      const { status, fulfillmentStatus, limit = "50", offset = "0" } = req.query;
      
      const orders = await storage.getOrdersByMerchant(
        merchantId,
        parseInt(limit as string),
        parseInt(offset as string),
        status as string | undefined,
        fulfillmentStatus as string | undefined
      );
      
      // Get wallet balance for each order's fulfillability
      const balance = await storage.getWalletBalance(merchantId);
      const walletBalance = balance?.balanceCents || 0;
      
      const ordersWithFulfillability = orders.orders.map(order => ({
        ...order,
        canFulfill: (order.totalCost || 0) <= walletBalance && order.fulfillmentStatus === "unfulfilled",
      }));
      
      res.json({ 
        success: true, 
        data: {
          orders: ordersWithFulfillability,
          total: orders.total,
          walletBalance,
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get single order
  app.get("/api/merchant/orders/:id", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) {
        return res.status(400).json({ success: false, error: "No merchant account found" });
      }
      
      const orderId = parseInt(req.params.id);
      const order = await storage.getOrder(orderId);
      
      if (!order || order.merchantId !== merchantId) {
        return res.status(404).json({ success: false, error: "Order not found" });
      }
      
      // Get supplier orders
      const supplierOrders = await storage.getSupplierOrdersByOrder(orderId);
      
      // Check if can fulfill
      const canFulfill = await orderFulfillmentService.canFulfillOrder(order);
      
      res.json({ 
        success: true, 
        data: { 
          order,
          supplierOrders,
          canFulfill: canFulfill.canFulfill,
          fulfillReason: canFulfill.reason,
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Fulfill order (deduct from wallet and submit to supplier)
  app.post("/api/merchant/orders/:id/fulfill", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) {
        return res.status(400).json({ success: false, error: "No merchant account found" });
      }
      
      const orderId = parseInt(req.params.id);
      const order = await storage.getOrder(orderId);
      
      if (!order || order.merchantId !== merchantId) {
        return res.status(404).json({ success: false, error: "Order not found" });
      }
      
      if (order.fulfillmentStatus !== "unfulfilled") {
        return res.status(400).json({ success: false, error: "Order already being fulfilled" });
      }
      
      // Check wallet balance
      const canFulfill = await orderFulfillmentService.canFulfillOrder(order);
      if (!canFulfill.canFulfill) {
        return res.status(402).json({ 
          success: false, 
          error: canFulfill.reason,
          insufficientFunds: true,
          redirectToWallet: true,
        });
      }
      
      // Fulfill order with wallet payment
      const result = await orderFulfillmentService.fulfillOrderWithWallet(order);
      
      if (!result.success) {
        return res.status(400).json({ 
          success: false, 
          error: result.error || "Fulfillment failed",
          results: result.results,
        });
      }
      
      res.json({ 
        success: true, 
        data: { 
          message: `Order fulfilled. $${((order.totalCost || 0) / 100).toFixed(2)} deducted from wallet.`,
          results: result.results,
        }
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
      const supplierId = req.query.supplierId ? parseInt(req.query.supplierId as string) : undefined;
      let allCategories;
      if (supplierId) {
        allCategories = await storage.getCategoriesBySupplier(supplierId);
      } else {
        allCategories = await storage.getAllCategories();
      }
      res.json({ success: true, data: allCategories });
    } catch (error: any) {
      // If categories table doesn't exist, return empty array instead of error
      if (error.message?.includes('does not exist')) {
        return res.json({ success: true, data: [] });
      }
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

  // Category Product Management - Assign products to a category/collection
  app.post("/api/admin/categories/:id/products", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const categoryId = parseInt(req.params.id);
      const { productIds } = req.body;
      
      if (!Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ success: false, error: "Product IDs array is required" });
      }

      // Get the category to get its name
      const category = await storage.getCategory(categoryId);
      if (!category) {
        return res.status(404).json({ success: false, error: "Category not found" });
      }

      // Update products with both categoryId and category name for backwards compatibility
      const updatedCount = await storage.bulkAssignCategory(productIds, categoryId, category.name);
      
      res.json({ success: true, data: { updatedCount } });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // Get products in a specific category
  app.get("/api/admin/categories/:id/products", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const categoryId = parseInt(req.params.id);
      const { page = "1", pageSize = "20" } = req.query;
      
      const products = await storage.getProductsByCategoryId(categoryId, {
        page: parseInt(page as string, 10),
        pageSize: parseInt(pageSize as string, 10),
      });
      
      res.json({ success: true, data: products });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // Remove products from a category
  app.delete("/api/admin/categories/:id/products", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const categoryId = parseInt(req.params.id);
      const { productIds } = req.body;
      
      if (!Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ success: false, error: "Product IDs array is required" });
      }

      const updatedCount = await storage.bulkRemoveFromCategory(productIds, categoryId);
      
      res.json({ success: true, data: { updatedCount } });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // Bulk Pricing Rules
  app.get("/api/admin/bulk-pricing-rules", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const supplierId = req.query.supplierId ? parseInt(req.query.supplierId as string) : undefined;
      let rules;
      if (supplierId) {
        rules = await storage.getBulkPricingRulesBySupplier(supplierId);
      } else {
        rules = await storage.getAllBulkPricingRules();
      }
      res.json({ success: true, data: rules });
    } catch (error: any) {
      if (error.message?.includes('does not exist')) {
        return res.json({ success: true, data: [] });
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/admin/bulk-pricing-rules/:id", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const rule = await storage.getBulkPricingRule(parseInt(req.params.id));
      if (!rule) {
        return res.status(404).json({ success: false, error: "Bulk pricing rule not found" });
      }
      res.json({ success: true, data: rule });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/admin/bulk-pricing-rules", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const validatedData = insertBulkPricingRuleSchema.parse(req.body);
      const rule = await storage.createBulkPricingRule(validatedData);
      res.json({ success: true, data: rule });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.put("/api/admin/bulk-pricing-rules/:id", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const rule = await storage.updateBulkPricingRule(parseInt(req.params.id), req.body);
      if (!rule) {
        return res.status(404).json({ success: false, error: "Bulk pricing rule not found" });
      }
      res.json({ success: true, data: rule });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.delete("/api/admin/bulk-pricing-rules/:id", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteBulkPricingRule(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/admin/bulk-pricing-rules/:id/apply", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const result = await storage.applyBulkPricingRule(parseInt(req.params.id));
      res.json({ success: true, data: result, message: `Applied pricing rule to ${result.updated} products` });
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
          apiCredentials: { storeDomain: "FROM_ENV", accessToken: "FROM_ENV" },
        });
      } else if (!supplier.apiCredentials || Object.keys(supplier.apiCredentials).length === 0) {
        // Update existing supplier with credentials if missing
        supplier = await storage.updateSupplier(supplier.id, {
          apiCredentials: { storeDomain: "FROM_ENV", accessToken: "FROM_ENV" },
        }) || supplier;
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

  // Sync order to GigaB2B drop shipping
  app.post("/api/admin/gigab2b/order/sync", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const { getGigaB2BService } = await import("./gigab2b");
      const gigab2b = getGigaB2BService();
      
      if (!gigab2b) {
        return res.status(400).json({
          success: false,
          error: "GigaB2B credentials not configured."
        });
      }

      const { orderId } = req.body;
      if (!orderId) {
        return res.status(400).json({ success: false, error: "Order ID is required" });
      }

      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ success: false, error: "Order not found" });
      }

      const shippingAddress = order.shippingAddress as any;
      
      const result = await gigab2b.syncOrder({
        orderNo: `APX${order.id}`,
        orderDate: new Date(order.createdAt!).toISOString().replace("T", " ").substring(0, 19),
        shipName: `${shippingAddress?.firstName || ""} ${shippingAddress?.lastName || ""}`.trim() || "Customer",
        shipPhone: shippingAddress?.phone || "0000000000",
        shipEmail: order.customerEmail || "",
        shipAddress1: (shippingAddress?.address1 || "").substring(0, 35),
        shipAddress2: (shippingAddress?.address2 || "").substring(0, 35),
        shipCity: shippingAddress?.city || "",
        shipCountry: shippingAddress?.country || "US",
        shipState: shippingAddress?.province || "",
        shipZipCode: shippingAddress?.zip || "",
        salesChannel: "APEX_MART",
        orderLines: ((order.items || []) as any[]).map((item: any) => ({
          sku: item.supplierSku || item.sku,
          qty: item.quantity,
          itemPrice: item.supplierCost || item.unitPrice,
          productName: item.title || item.sku,
        })),
        orderTotal: Number(order.supplierCost) || Number(order.totalAmount) || 0,
        customerComments: order.notes || "",
      });

      await storage.updateOrder(order.id, {
        supplierOrderId: `APX${order.id}`,
        status: "processing",
      });

      res.json({
        success: true,
        message: "Order synced to GigaB2B successfully",
        data: {
          supplierOrderId: `APX${order.id}`,
          requestId: result.requestId,
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get tracking info from GigaB2B
  app.get("/api/admin/gigab2b/order/:orderNo/tracking", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const { getGigaB2BService } = await import("./gigab2b");
      const gigab2b = getGigaB2BService();
      
      if (!gigab2b) {
        return res.status(400).json({
          success: false,
          error: "GigaB2B credentials not configured."
        });
      }

      const { orderNo } = req.params;
      const tracking = await gigab2b.getTracking(orderNo);

      if (!tracking || tracking.length === 0) {
        return res.json({
          success: true,
          data: null,
          message: "No tracking information available yet"
        });
      }

      res.json({
        success: true,
        data: tracking[0]
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
      const updateData = { ...req.body };
      
      // If category name is provided, look up the categoryId
      if (updateData.category) {
        const existingProduct = await storage.getProduct(parseInt(req.params.id));
        if (existingProduct) {
          // Find the category by name and supplierId
          const allCategories = await storage.getAllCategories();
          const matchedCategory = allCategories.find(
            (c) => c.name === updateData.category && 
            (!c.supplierId || c.supplierId === existingProduct.supplierId)
          );
          if (matchedCategory) {
            updateData.categoryId = matchedCategory.id;
          }
        }
      } else if (updateData.category === "" || updateData.category === null) {
        // Clear category
        updateData.categoryId = null;
        updateData.category = null;
      }
      
      const product = await storage.updateProduct(parseInt(req.params.id), updateData);
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

  // Bulk delete products (Admin)
  app.post("/api/admin/products/bulk-delete", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const { productIds } = req.body;
      if (!Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ success: false, error: "productIds must be a non-empty array" });
      }
      
      let deleted = 0;
      for (const id of productIds) {
        try {
          await storage.deleteProduct(parseInt(id));
          deleted++;
        } catch (e) {
          console.error(`[Admin] Failed to delete product ${id}:`, e);
        }
      }
      
      res.json({ success: true, data: { deleted, requested: productIds.length } });
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

  // Auto-categorize products (Admin) - Re-categorize uncategorized products
  app.post("/api/admin/products/auto-categorize", authMiddleware, adminOnly, async (req: AuthRequest, res: Response) => {
    try {
      const { categorizationService } = await import("./services/categorizationService");
      const { supplierId, forceRecategorize, limit = 1000 } = req.body;
      
      // Cache suppliers to avoid repeated lookups
      const supplierCache = new Map<number, any>();
      
      let categorized = 0;
      let failed = 0;
      let processed = 0;
      let page = 1;
      const batchSize = 100;
      let hasMore = true;
      
      // Process in batches to avoid memory issues
      while (hasMore && processed < limit) {
        const productsResult = await storage.getGlobalProductsPaginated({
          page,
          pageSize: batchSize
        });
        let productsToProcess = productsResult.items;
        
        if (productsToProcess.length === 0) {
          hasMore = false;
          break;
        }
        
        // Filter by supplier if specified
        if (supplierId) {
          productsToProcess = productsToProcess.filter(p => p.supplierId === supplierId);
        }
        
        // Filter to only uncategorized products unless force recategorize
        if (!forceRecategorize) {
          productsToProcess = productsToProcess.filter(p => !p.categoryId);
        }
        
        for (const product of productsToProcess) {
          if (processed >= limit) break;
          
          try {
            // Get supplier from cache or fetch
            let supplier = supplierCache.get(product.supplierId);
            if (!supplier) {
              supplier = await storage.getSupplier(product.supplierId);
              if (supplier) supplierCache.set(product.supplierId, supplier);
            }
            if (!supplier) continue;
            
            // Only use keyword matching (no AI) for bulk operations to control costs
            const match = await categorizationService.categorizeProduct(
              product.supplierId,
              supplier.type as 'gigab2b' | 'shopify',
              product.title,
              product.description || undefined,
              product.category || undefined
            );
            
            if (match && match.method === 'keyword') {
              await storage.updateProduct(product.id, {
                categoryId: match.categoryId,
                category: match.categoryName,
              });
              categorized++;
            }
            processed++;
          } catch (error) {
            failed++;
            processed++;
          }
        }
        
        page++;
        hasMore = productsResult.items.length === batchSize;
      }
      
      res.json({ 
        success: true, 
        data: { 
          processed,
          categorized,
          failed,
          skipped: processed - categorized - failed
        } 
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
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

  // ==================== WALLET ROUTES ====================
  // Get wallet balance
  app.get("/api/wallet/balance", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }
      let balance = await storage.getWalletBalance(req.user.merchantId);
      if (!balance) {
        // Create wallet if it doesn't exist
        balance = await storage.createWalletBalance({ 
          merchantId: req.user.merchantId, 
          balanceCents: 0, 
          pendingCents: 0, 
          currency: "USD" 
        });
      }
      res.json({ success: true, data: balance });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get wallet transactions
  app.get("/api/wallet/transactions", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const result = await storage.getWalletTransactions(req.user.merchantId, limit, offset);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Create Stripe PaymentIntent for wallet top-up
  app.post("/api/wallet/top-up", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const { amountCents } = req.body;
      if (!amountCents || amountCents < 500) {
        return res.status(400).json({ success: false, error: "Minimum top-up is $5.00" });
      }
      if (amountCents > 1000000) {
        return res.status(400).json({ success: false, error: "Maximum top-up is $10,000.00" });
      }

      // Get Stripe client
      const stripe = await getUncachableStripeClient();
      if (!stripe) {
        return res.status(500).json({ success: false, error: "Payment service unavailable" });
      }

      // Get merchant for Stripe customer
      const merchant = await storage.getMerchant(req.user.merchantId);
      if (!merchant) {
        return res.status(404).json({ success: false, error: "Merchant not found" });
      }

      // Create or get Stripe customer (handle live/test mode mismatch)
      let customerId = merchant.stripeCustomerId;
      
      // Verify customer exists in current Stripe mode, create new if not
      if (customerId) {
        try {
          await stripe.customers.retrieve(customerId);
        } catch (customerError: any) {
          // Customer doesn't exist in this mode (live vs test mismatch)
          console.log("[Wallet] Customer not found in current Stripe mode, creating new one");
          customerId = null;
        }
      }
      
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: merchant.ownerEmail,
          name: merchant.businessName,
          metadata: { merchantId: String(merchant.id) }
        });
        customerId = customer.id;
        await storage.updateMerchant(merchant.id, { stripeCustomerId: customerId });
      }

      // Create PaymentIntent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: "usd",
        customer: customerId,
        metadata: { 
          merchantId: String(req.user.merchantId),
          type: "wallet_topup"
        },
      });

      res.json({ 
        success: true, 
        data: { 
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          amount: amountCents
        } 
      });
    } catch (error: any) {
      console.error("[Wallet] Top-up error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Confirm wallet top-up (called after successful Stripe payment)
  app.post("/api/wallet/confirm", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const { paymentIntentId } = req.body;
      if (!paymentIntentId) {
        return res.status(400).json({ success: false, error: "Payment intent ID required" });
      }

      // Get Stripe client
      const stripe = await getUncachableStripeClient();
      if (!stripe) {
        return res.status(500).json({ success: false, error: "Payment service unavailable" });
      }

      // Verify payment intent
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (paymentIntent.status !== "succeeded") {
        return res.status(400).json({ success: false, error: "Payment not completed" });
      }

      // Check if this payment was already processed
      const { transactions } = await storage.getWalletTransactions(req.user.merchantId, 100, 0);
      const alreadyProcessed = transactions.some(t => t.stripePaymentIntentId === paymentIntentId);
      if (alreadyProcessed) {
        const balance = await storage.getWalletBalance(req.user.merchantId);
        return res.json({ success: true, data: { balance, message: "Already processed" } });
      }

      // Add funds to wallet
      const result = await storage.addFundsToWallet(
        req.user.merchantId,
        paymentIntent.amount,
        paymentIntentId,
        `Wallet top-up via Stripe`
      );

      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error("[Wallet] Confirm error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ==================== PUSH PRODUCTS TO SHOPIFY ====================
  app.post("/api/merchant/products/:id/push-to-shopify", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const productId = parseInt(req.params.id);
      const product = await storage.getProduct(productId);
      
      if (!product || product.merchantId !== req.user.merchantId) {
        return res.status(404).json({ success: false, error: "Product not found" });
      }

      if (product.shopifyProductId) {
        return res.status(400).json({ success: false, error: "Product already synced to Shopify" });
      }

      const { getShopifyServiceFromMerchant } = await import("./shopify");
      const shopifyService = await getShopifyServiceFromMerchant(req.user.merchantId);
      
      if (!shopifyService) {
        return res.status(400).json({ success: false, error: "Shopify not connected. Please connect your store first." });
      }

      const variants = (product.variants as any[]) || [];
      const images = (product.images as any[]) || [];
      const tags = (product.tags as string[]) || [];

      // Calculate total price including fulfillment fee
      const basePrice = product.merchantPrice || product.supplierPrice || 0;
      const fulfillmentFee = product.fulfillmentFee || 0;
      const totalPrice = basePrice + fulfillmentFee;

      const result = await shopifyService.createProduct({
        title: product.title,
        description: product.description || "",
        productType: product.category || "",
        tags,
        variants: variants.map(v => ({
          title: v.title || "Default Title",
          price: totalPrice,
          sku: v.sku || product.supplierSku || "",
          inventoryQuantity: v.inventoryQuantity || product.inventoryQuantity || 0,
          compareAtPrice: v.compareAtPrice,
        })),
        images: images.map(img => ({
          url: img.url,
          alt: img.alt || product.title,
        })),
      });

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      await storage.updateProduct(productId, {
        shopifyProductId: result.shopifyProductId,
        syncStatus: "synced",
        lastSyncedAt: new Date(),
      });

      res.json({ success: true, data: { shopifyProductId: result.shopifyProductId } });
    } catch (error: any) {
      console.error("[PushToShopify] Error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/merchant/products/bulk-push-to-shopify", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const { productIds } = req.body;
      if (!Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ success: false, error: "Product IDs required" });
      }

      const { getShopifyServiceFromMerchant } = await import("./shopify");
      const shopifyService = await getShopifyServiceFromMerchant(req.user.merchantId);
      
      if (!shopifyService) {
        return res.status(400).json({ success: false, error: "Shopify not connected" });
      }

      const results: { productId: number; success: boolean; shopifyProductId?: string; error?: string }[] = [];

      for (const productId of productIds) {
        const product = await storage.getProduct(productId);
        
        if (!product || product.merchantId !== req.user.merchantId) {
          results.push({ productId, success: false, error: "Not found" });
          continue;
        }

        if (product.shopifyProductId) {
          results.push({ productId, success: true, shopifyProductId: product.shopifyProductId });
          continue;
        }

        const variants = (product.variants as any[]) || [];
        const images = (product.images as any[]) || [];
        const tags = (product.tags as string[]) || [];

        // Calculate total price including fulfillment fee
        const basePrice = product.merchantPrice || product.supplierPrice || 0;
        const fulfillmentFee = product.fulfillmentFee || 0;
        const totalPrice = basePrice + fulfillmentFee;

        const result = await shopifyService.createProduct({
          title: product.title,
          description: product.description || "",
          productType: product.category || "",
          tags,
          variants: variants.map(v => ({
            title: v.title || "Default Title",
            price: totalPrice,
            sku: v.sku || product.supplierSku || "",
            inventoryQuantity: v.inventoryQuantity || product.inventoryQuantity || 0,
          })),
          images: images.map(img => ({
            url: img.url,
            alt: img.alt || product.title,
          })),
        });

        if (result.success) {
          await storage.updateProduct(productId, {
            shopifyProductId: result.shopifyProductId,
            syncStatus: "synced",
            lastSyncedAt: new Date(),
          });
          results.push({ productId, success: true, shopifyProductId: result.shopifyProductId });
        } else {
          results.push({ productId, success: false, error: result.error });
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const successCount = results.filter(r => r.success).length;
      res.json({ success: true, data: { results, successCount, totalCount: productIds.length } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ==================== RETURNS MANAGEMENT ====================
  app.get("/api/merchant/returns", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }
      const { returnsService } = await import("./services/returnsService");
      const returns = await returnsService.getReturnsByMerchant(req.user.merchantId);
      res.json({ success: true, data: returns });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/merchant/returns", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }
      const { returnsService } = await import("./services/returnsService");
      const result = await returnsService.createReturn({
        ...req.body,
        merchantId: req.user.merchantId,
      });
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/merchant/returns/:id/approve", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }
      const { returnsService } = await import("./services/returnsService");
      const result = await returnsService.approveReturn(parseInt(req.params.id), req.user.merchantId);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/merchant/returns/:id/process-refund", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }
      const { returnsService } = await import("./services/returnsService");
      const result = await returnsService.processRefund(parseInt(req.params.id), req.user.merchantId);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/merchant/returns/:id/reject", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }
      const { returnsService } = await import("./services/returnsService");
      const result = await returnsService.rejectReturn(parseInt(req.params.id), req.user.merchantId, req.body.reason);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ==================== SHIPPING CONFIGURATION ====================
  app.get("/api/merchant/shipping/zones", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }
      const { shippingService } = await import("./services/shippingService");
      const zones = await shippingService.getZones(req.user.merchantId);
      res.json({ success: true, data: zones });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/merchant/shipping/zones", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }
      const { shippingService } = await import("./services/shippingService");
      const zone = await shippingService.createZone(req.user.merchantId, req.body);
      res.json({ success: true, data: zone });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.put("/api/merchant/shipping/zones/:id", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }
      const { shippingService } = await import("./services/shippingService");
      const zone = await shippingService.updateZone(parseInt(req.params.id), req.user.merchantId, req.body);
      if (!zone) {
        return res.status(404).json({ success: false, error: "Zone not found" });
      }
      res.json({ success: true, data: zone });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete("/api/merchant/shipping/zones/:id", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }
      const { shippingService } = await import("./services/shippingService");
      const deleted = await shippingService.deleteZone(parseInt(req.params.id), req.user.merchantId);
      if (!deleted) {
        return res.status(400).json({ success: false, error: "Cannot delete zone" });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/merchant/shipping/calculate", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }
      const { shippingService } = await import("./services/shippingService");
      const rates = await shippingService.calculateShipping(req.user.merchantId, req.body);
      res.json({ success: true, data: rates });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ==================== INVENTORY SYNC ====================
  app.post("/api/merchant/inventory/sync", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }
      const { inventorySyncService } = await import("./services/inventorySyncService");
      const results = await inventorySyncService.syncMerchantProductInventory(req.user.merchantId);
      res.json({ success: true, data: { results, updatedCount: results.filter(r => r.updated).length } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/merchant/inventory/sync-status", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      const { inventorySyncService } = await import("./services/inventorySyncService");
      const status = inventorySyncService.getStatus();
      res.json({ success: true, data: status });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ==================== GDPR COMPLIANCE ====================
  app.get("/api/merchant/data-export", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }
      const { gdprService } = await import("./services/gdprService");
      const result = await gdprService.exportMerchantData(req.user.merchantId);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/merchant/data-deletion", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }
      const { confirmDelete } = req.body;
      if (!confirmDelete) {
        return res.status(400).json({ success: false, error: "Must confirm deletion" });
      }
      const { gdprService } = await import("./services/gdprService");
      const result = await gdprService.deleteMerchantData(req.user.merchantId, true);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/merchant/customers/:id/anonymize", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }
      const { gdprService } = await import("./services/gdprService");
      const result = await gdprService.anonymizeCustomer(parseInt(req.params.id), req.user.merchantId);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Shopify GDPR Webhooks (required for Shopify App Store) - with HMAC verification
  // Per Shopify requirements: 
  // - Return 200 for Shopify's automated probe requests (empty body, no HMAC)
  // - Return 401 for requests with payload but invalid/missing HMAC
  // - Return 200 for valid webhook requests with correct HMAC
  // Uses req.rawBody captured by express.json verify function in index.ts
  app.post("/api/shopify/gdpr/customers/data_request", async (req: Request, res: Response) => {
    try {
      const hmacHeader = req.headers["x-shopify-hmac-sha256"] as string;
      const rawBody = (req as any).rawBody ? (req as any).rawBody.toString("utf8") : "";
      const hasPayload = rawBody && rawBody.length > 0 && rawBody !== "{}";
      
      // Shopify automated check sends empty probe - return 200 to confirm endpoint exists
      if (!hasPayload) {
        console.log("[Shopify GDPR] Probe request received for customers/data_request - returning 200");
        return res.status(200).json({ success: true });
      }
      
      // For real webhook with payload, verify HMAC signature
      const { verifyWebhookHmac } = await import("./shopifyOAuth");
      if (!hmacHeader || !verifyWebhookHmac(rawBody, hmacHeader)) {
        console.error("[Shopify GDPR] HMAC validation failed for customers/data_request");
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { shop_domain, customer } = req.body;
      console.log(`[Shopify GDPR] Customer data request from ${shop_domain}`);
      const { gdprService } = await import("./services/gdprService");
      await gdprService.handleShopifyDataRequest(shop_domain, customer?.id);
      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error("[Shopify GDPR] Error handling data_request:", error);
      res.status(200).json({ success: true }); // Always return 200 to Shopify for processing errors
    }
  });

  app.post("/api/shopify/gdpr/customers/redact", async (req: Request, res: Response) => {
    try {
      const hmacHeader = req.headers["x-shopify-hmac-sha256"] as string;
      const rawBody = (req as any).rawBody ? (req as any).rawBody.toString("utf8") : "";
      const hasPayload = rawBody && rawBody.length > 0 && rawBody !== "{}";
      
      // Shopify automated check sends empty probe - return 200 to confirm endpoint exists
      if (!hasPayload) {
        console.log("[Shopify GDPR] Probe request received for customers/redact - returning 200");
        return res.status(200).json({ success: true });
      }
      
      // For real webhook with payload, verify HMAC signature
      const { verifyWebhookHmac } = await import("./shopifyOAuth");
      if (!hmacHeader || !verifyWebhookHmac(rawBody, hmacHeader)) {
        console.error("[Shopify GDPR] HMAC validation failed for customers/redact");
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { shop_domain, customer } = req.body;
      console.log(`[Shopify GDPR] Customer redact request from ${shop_domain}`);
      const { gdprService } = await import("./services/gdprService");
      await gdprService.handleShopifyCustomerRedact(shop_domain, customer?.id);
      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error("[Shopify GDPR] Error handling customers/redact:", error);
      res.status(200).json({ success: true });
    }
  });

  app.post("/api/shopify/gdpr/shop/redact", async (req: Request, res: Response) => {
    try {
      const hmacHeader = req.headers["x-shopify-hmac-sha256"] as string;
      const rawBody = (req as any).rawBody ? (req as any).rawBody.toString("utf8") : "";
      const hasPayload = rawBody && rawBody.length > 0 && rawBody !== "{}";
      
      // Shopify automated check sends empty probe - return 200 to confirm endpoint exists
      if (!hasPayload) {
        console.log("[Shopify GDPR] Probe request received for shop/redact - returning 200");
        return res.status(200).json({ success: true });
      }
      
      // For real webhook with payload, verify HMAC signature
      const { verifyWebhookHmac } = await import("./shopifyOAuth");
      if (!hmacHeader || !verifyWebhookHmac(rawBody, hmacHeader)) {
        console.error("[Shopify GDPR] HMAC validation failed for shop/redact");
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { shop_domain } = req.body;
      console.log(`[Shopify GDPR] Shop redact request from ${shop_domain}`);
      const { gdprService } = await import("./services/gdprService");
      await gdprService.handleShopifyShopRedact(shop_domain);
      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error("[Shopify GDPR] Error handling shop/redact:", error);
      res.status(200).json({ success: true });
    }
  });

  // Merchant-accessible categories by supplier (also accessible by admin for testing)
  app.get("/api/merchant/categories", authMiddleware, async (req: AuthRequest, res: Response) => {
    // Allow merchant, staff, or admin roles
    if (req.user?.role !== "merchant" && req.user?.role !== "staff" && req.user?.role !== "admin") {
      return res.status(403).json({ success: false, error: "Access denied" });
    }
    try {
      const supplierId = req.query.supplierId ? parseInt(req.query.supplierId as string) : undefined;
      let allCategories;
      if (supplierId) {
        allCategories = await storage.getCategoriesBySupplier(supplierId);
      } else {
        allCategories = await storage.getAllCategories();
      }
      res.json({ success: true, data: allCategories });
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

      // Calculate supplier cost for the order (the cost the merchant pays to suppliers)
      // This is based on supplier_price (not retail price) of products in the order
      const supplierCostCents = Math.round((order.totalCost || order.totalAmount || 0) * 100);
      
      if (supplierCostCents > 0) {
        // Debit wallet for order payment
        const walletResult = await storage.debitWalletForOrder(
          req.user.merchantId,
          order.id,
          supplierCostCents,
          `Order #${order.shopifyOrderId || order.id} fulfillment`
        );

        if (!walletResult.success) {
          return res.status(402).json({ 
            success: false, 
            error: walletResult.error,
            insufficientFunds: true,
            requiredAmount: supplierCostCents,
            walletUrl: "/dashboard/wallet"
          });
        }
      }

      // Create supplier orders and submit to suppliers for fulfillment
      const fulfillmentResults = await orderFulfillmentService.createSupplierOrderFromMerchantOrder(order);
      
      const allSuccessful = fulfillmentResults.every(r => r.success);
      const updatedOrder = await storage.updateOrder(parseInt(req.params.id), {
        fulfillmentStatus: allSuccessful ? "fulfilled" : "partial",
        status: allSuccessful ? "processing" : "pending",
        walletDeducted: true,
      });
      
      res.json({ 
        success: true, 
        data: updatedOrder,
        fulfillmentResults,
        walletDeducted: supplierCostCents > 0,
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
          freeForLifeThreshold: 100000000, // $1,000,000 in cents
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

  // ==================== SHOPIFY CONFIG ROUTES ====================
  
  // Get Shopify API key for App Bridge initialization (public key, not secret)
  // The API key is meant to be public per Shopify's App Bridge documentation
  app.get("/api/shopify/config", async (req: Request, res: Response) => {
    try {
      const apiKey = process.env.SHOPIFY_API_KEY;
      if (!apiKey) {
        return res.json({ success: true, data: { apiKey: null, configured: false } });
      }
      res.json({ success: true, data: { apiKey, configured: true } });
    } catch (error: any) {
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

      // Create or verify Stripe customer (handles live/test mode mismatch)
      const customerId = await stripeService.verifyOrCreateCustomer(
        merchant.stripeCustomerId,
        req.user!.email!,
        merchant.id,
        merchant.businessName
      );

      // Get base URL
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.get('host');
      const baseUrl = `${protocol}://${host}`;

      // Create checkout session
      const session = await stripeService.createCheckoutSession(
        customerId,
        priceId,
        merchant.id,
        `${baseUrl}/dashboard/subscription?success=true`,
        `${baseUrl}/dashboard/subscription?canceled=true`
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
      const returnUrl = `${protocol}://${host}/dashboard/subscription`;

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

  // Stripe webhook endpoint for subscription updates
  app.post("/api/stripe/webhook", express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
    const stripe = await getUncachableStripeClient();
    let event;

    try {
      // Parse raw body as JSON - in production, use webhook signature verification
      if (typeof req.body === 'string') {
        event = JSON.parse(req.body);
      } else if (Buffer.isBuffer(req.body)) {
        event = JSON.parse(req.body.toString());
      } else {
        event = req.body;
      }
    } catch (err: any) {
      console.error("[Webhook] Parse error:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log("[Webhook] Received event:", event.type);

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const merchantId = parseInt(session.metadata?.merchantId);
          const subscriptionId = session.subscription;
          
          if (merchantId && subscriptionId) {
            // Get subscription details from Stripe
            const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId as string);
            const priceId = stripeSubscription.items.data[0]?.price.id;
            
            // Get plan from price metadata
            const price = await stripe.prices.retrieve(priceId);
            const product = await stripe.products.retrieve(price.product as string);
            const planSlug = product.metadata.planSlug;
            
            // Find plan in our database
            const dbPlan = await storage.getPlanBySlug(planSlug);
            
            // Update merchant with subscription info
            await stripeService.updateMerchantStripeInfo(merchantId, {
              stripeSubscriptionId: subscriptionId as string,
            });
            
            // Update subscription status
            const status = stripeSubscription.status === 'trialing' ? 'trial' : 'active';
            await storage.updateMerchant(merchantId, {
              subscriptionStatus: status as any,
              subscriptionPlanId: dbPlan?.id,
              productLimit: dbPlan?.productLimit || 25,
            });
            
            // Update or create subscription record
            const existingSubscription = await storage.getSubscriptionByMerchant(merchantId);
            if (existingSubscription) {
              await storage.updateSubscription(existingSubscription.id, {
                planId: dbPlan?.id || existingSubscription.planId,
                status: status as any,
              });
            } else if (dbPlan) {
              const now = new Date();
              const periodEnd = new Date();
              periodEnd.setMonth(periodEnd.getMonth() + 1);
              await storage.createSubscription({
                merchantId,
                planId: dbPlan.id,
                status: status as any,
                currentPeriodStart: now,
                currentPeriodEnd: periodEnd,
              });
            }
            
            console.log(`[Webhook] Subscription ${subscriptionId} activated for merchant ${merchantId}`);
          }
          break;
        }
        
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const subscription = event.data.object;
          await stripeService.handleSubscriptionUpdate(subscription.id, subscription.status);
          console.log(`[Webhook] Subscription ${subscription.id} status updated to ${subscription.status}`);
          break;
        }
        
        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          if (invoice.subscription) {
            await stripeService.handleSubscriptionUpdate(invoice.subscription as string, 'past_due');
            console.log(`[Webhook] Invoice payment failed for subscription ${invoice.subscription}`);
          }
          break;
        }
        
        default:
          console.log(`[Webhook] Unhandled event type: ${event.type}`);
      }
      
      res.json({ received: true });
    } catch (error: any) {
      console.error("[Webhook] Handler error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== SHOPIFY BILLING ROUTES ====================
  const { getShopifyBillingFromMerchant, handleShopifySubscriptionActivated } = await import("./services/shopifyBilling");

  // Check if merchant has Shopify store connected for billing
  app.get("/api/shopify/billing/status", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const merchant = await storage.getMerchant(req.user.merchantId);
      const shopifyStore = merchant?.shopifyStore as { domain?: string; accessToken?: string; isConnected?: boolean } | null;
      const isConnected = !!(shopifyStore?.domain && shopifyStore?.accessToken && shopifyStore?.isConnected);

      const billingService = await getShopifyBillingFromMerchant(req.user.merchantId);
      let currentSubscription = null;
      
      if (billingService) {
        currentSubscription = await billingService.getCurrentSubscription();
      }

      res.json({
        success: true,
        data: {
          shopifyConnected: isConnected,
          storeDomain: shopifyStore?.domain || null,
          currentSubscription,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Create Shopify billing subscription
  app.post("/api/shopify/billing/checkout", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const { planSlug, billingInterval } = req.body;
      if (!planSlug) {
        return res.status(400).json({ success: false, error: "Plan slug required" });
      }

      const plan = await storage.getPlanBySlug(planSlug);
      if (!plan) {
        return res.status(404).json({ success: false, error: "Plan not found" });
      }

      const billingService = await getShopifyBillingFromMerchant(req.user.merchantId);
      if (!billingService) {
        return res.status(400).json({ success: false, error: "Shopify store not connected" });
      }

      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.get('host');
      const baseUrl = `${protocol}://${host}`;

      const interval = billingInterval === "yearly" ? "ANNUAL" : "EVERY_30_DAYS";
      const price = billingInterval === "yearly" ? plan.yearlyPrice / 100 : plan.monthlyPrice / 100;

      const result = await billingService.createSubscription(
        `${plan.displayName} Plan`,
        price,
        interval,
        `${baseUrl}/merchant/subscription?shopify_billing=success&plan=${planSlug}`,
        2,
        process.env.NODE_ENV !== "production"
      );

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.json({
        success: true,
        data: {
          confirmationUrl: result.confirmationUrl,
          subscriptionId: result.subscriptionId,
        },
      });
    } catch (error: any) {
      console.error("[ShopifyBilling] Checkout error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Confirm Shopify billing subscription (called after merchant approves)
  app.post("/api/shopify/billing/confirm", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const { planSlug } = req.body;
      if (!planSlug) {
        return res.status(400).json({ success: false, error: "Plan slug required" });
      }

      const billingService = await getShopifyBillingFromMerchant(req.user.merchantId);
      if (!billingService) {
        return res.status(400).json({ success: false, error: "Shopify store not connected" });
      }

      const currentSubscription = await billingService.getCurrentSubscription();
      if (!currentSubscription || currentSubscription.status !== "ACTIVE") {
        return res.status(400).json({ success: false, error: "No active Shopify subscription found" });
      }

      await handleShopifySubscriptionActivated(
        req.user.merchantId,
        currentSubscription.id,
        planSlug
      );

      const plan = await storage.getPlanBySlug(planSlug);
      await storage.updateMerchant(req.user.merchantId, {
        subscriptionStatus: "active",
        subscriptionPlanId: plan?.id,
        productLimit: plan?.productLimit || 25,
      });

      res.json({ success: true, data: { message: "Subscription activated via Shopify Billing" } });
    } catch (error: any) {
      console.error("[ShopifyBilling] Confirm error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Cancel Shopify billing subscription
  app.post("/api/shopify/billing/cancel", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const subscription = await storage.getSubscriptionByMerchant(req.user.merchantId);
      if (!subscription?.shopifySubscriptionId) {
        return res.status(400).json({ success: false, error: "No Shopify subscription found" });
      }

      const billingService = await getShopifyBillingFromMerchant(req.user.merchantId);
      if (!billingService) {
        return res.status(400).json({ success: false, error: "Shopify store not connected" });
      }

      const result = await billingService.cancelSubscription(subscription.shopifySubscriptionId);
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      await storage.updateSubscription(subscription.id, {
        status: "cancelled",
        cancelledAt: new Date(),
      });

      res.json({ success: true, data: { message: "Subscription cancelled" } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ==================== ANALYTICS ROUTES ====================
  const { analyticsService } = await import("./services/analyticsService");

  app.get("/api/merchant/analytics", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const period = (req.query.period as string) || "30d";
      const analytics = await analyticsService.getMerchantAnalytics(req.user.merchantId, period);
      res.json({ success: true, data: analytics });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ==================== WEBHOOK ROUTES ====================
  const { webhookService } = await import("./services/webhookService");

  app.get("/api/merchant/webhooks", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const subscriptions = await webhookService.getSubscriptions(req.user.merchantId);
      res.json({ success: true, data: subscriptions });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/merchant/webhooks", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const { url, events } = req.body;
      if (!url || !events || !Array.isArray(events)) {
        return res.status(400).json({ success: false, error: "URL and events array required" });
      }

      const subscription = await webhookService.createSubscription(req.user.merchantId, { url, events });
      res.json({ success: true, data: subscription });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.put("/api/merchant/webhooks/:id", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const id = parseInt(req.params.id);
      const subscription = await webhookService.updateSubscription(id, req.user.merchantId, req.body);
      if (!subscription) {
        return res.status(404).json({ success: false, error: "Webhook not found" });
      }
      res.json({ success: true, data: subscription });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.delete("/api/merchant/webhooks/:id", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const id = parseInt(req.params.id);
      const deleted = await webhookService.deleteSubscription(id, req.user.merchantId);
      if (!deleted) {
        return res.status(404).json({ success: false, error: "Webhook not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/merchant/webhooks/:id/test", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const id = parseInt(req.params.id);
      const result = await webhookService.testWebhook(id, req.user.merchantId);
      res.json({ success: result.success, message: result.message });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/api/merchant/webhooks/events", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const events = await webhookService.getEventLog(req.user.merchantId);
      res.json({ success: true, data: events });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ==================== BULK IMPORT ROUTES ====================
  const { bulkImportService } = await import("./services/bulkImportService");

  app.post("/api/merchant/import/orders", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const { csv } = req.body;
      if (!csv) {
        return res.status(400).json({ success: false, error: "CSV content required" });
      }

      const result = await bulkImportService.importOrders(req.user.merchantId, csv);
      res.json({ success: result.success, data: result });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/merchant/import/products", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const { csv } = req.body;
      if (!csv) {
        return res.status(400).json({ success: false, error: "CSV content required" });
      }

      const result = await bulkImportService.importProducts(req.user.merchantId, csv);
      res.json({ success: result.success, data: result });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/api/merchant/import/template/:type", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      const type = req.params.type as "orders" | "products";
      if (type !== "orders" && type !== "products") {
        return res.status(400).json({ success: false, error: "Invalid template type" });
      }

      const template = bulkImportService.getCSVTemplate(type);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=${type}-template.csv`);
      res.send(template);
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // ==================== TEAM/STAFF ROUTES ====================
  app.get("/api/team", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const users = await storage.getUsersByMerchant(req.user.merchantId);
      const safeUsers = users.map(u => {
        const { password, ...rest } = u;
        return rest;
      });
      res.json({ success: true, data: safeUsers });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/team/invitations", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const invitations = await storage.getInvitationsByMerchant(req.user.merchantId);
      res.json({ success: true, data: invitations });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/team/invite", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const { email, name, permissions } = req.body;
      if (!email || !name || !permissions) {
        return res.status(400).json({ success: false, error: "Email, name, and permissions required" });
      }

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ success: false, error: "User with this email already exists" });
      }

      const token = randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const invitation = await storage.createStaffInvitation({
        merchantId: req.user.merchantId,
        email,
        name,
        permissions,
        token,
        expiresAt,
        status: "pending",
        invitedBy: req.user.id,
      });

      console.log(`[Team] Invitation sent to ${email} for merchant ${req.user.merchantId}`);
      res.json({ success: true, data: invitation });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.delete("/api/team/:id", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      
      if (!user || user.merchantId !== req.user.merchantId) {
        return res.status(404).json({ success: false, error: "Team member not found" });
      }

      if (user.role !== "staff") {
        return res.status(400).json({ success: false, error: "Cannot remove non-staff members" });
      }

      await storage.updateUser(userId, { isActive: false });
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.delete("/api/team/invitations/:id", authMiddleware, merchantOnly, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.merchantId) {
        return res.status(400).json({ success: false, error: "No merchant associated" });
      }

      const invitationId = parseInt(req.params.id);
      const invitation = await storage.getStaffInvitation(invitationId);
      
      if (!invitation || invitation.merchantId !== req.user.merchantId) {
        return res.status(404).json({ success: false, error: "Invitation not found" });
      }

      await storage.updateStaffInvitation(invitationId, { status: "expired" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/team/accept/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ success: false, error: "Password required" });
      }

      const invitation = await storage.getStaffInvitationByToken(token);
      if (!invitation) {
        return res.status(404).json({ success: false, error: "Invitation not found" });
      }

      if (invitation.status !== "pending") {
        return res.status(400).json({ success: false, error: "Invitation already used or expired" });
      }

      if (new Date() > new Date(invitation.expiresAt!)) {
        await storage.updateStaffInvitation(invitation.id, { status: "expired" });
        return res.status(400).json({ success: false, error: "Invitation expired" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await storage.createUser({
        email: invitation.email,
        password: hashedPassword,
        name: invitation.name,
        role: "staff",
        merchantId: invitation.merchantId,
        permissions: invitation.permissions || [],
        isActive: true,
      });

      await storage.updateStaffInvitation(invitation.id, { status: "accepted" });

      const jwtToken = generateToken(user);
      const { password: _, ...userWithoutPassword } = user;

      res.json({ success: true, data: { user: userWithoutPassword, token: jwtToken } });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // ==================== TRANSLATION (DEEPL) ROUTES ====================
  const { deeplService } = await import("./deepl");

  // Check if DeepL translation service is available
  app.get("/api/translation/status", async (req: Request, res: Response) => {
    try {
      const isAvailable = deeplService.isAvailable();
      const usage = isAvailable ? await deeplService.getUsage() : null;
      
      res.json({
        success: true,
        data: {
          available: isAvailable,
          usage: usage,
          message: isAvailable 
            ? "DeepL translation service is active" 
            : "DeepL API key not configured"
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Translate text (single or batch)
  app.post("/api/translation/translate", async (req: Request, res: Response) => {
    try {
      const { text, texts, targetLang, sourceLang } = req.body;

      if (!targetLang) {
        return res.status(400).json({ success: false, error: "Target language is required" });
      }

      // Single text translation
      if (text && typeof text === "string") {
        const result = await deeplService.translateText(text, targetLang, sourceLang);
        return res.json({ success: true, data: result });
      }

      // Batch translation
      if (texts && Array.isArray(texts)) {
        const results = await deeplService.translateBatch(texts, targetLang, sourceLang);
        return res.json({ success: true, data: { translations: results } });
      }

      return res.status(400).json({ success: false, error: "Either 'text' or 'texts' is required" });
    } catch (error: any) {
      console.error("Translation error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Translate product (title, description, tags)
  app.post("/api/translation/product", async (req: Request, res: Response) => {
    try {
      const { product, targetLang } = req.body;

      if (!product || !targetLang) {
        return res.status(400).json({ 
          success: false, 
          error: "Product and targetLang are required" 
        });
      }

      const translated = await deeplService.translateProduct(product, targetLang);
      res.json({ success: true, data: translated });
    } catch (error: any) {
      console.error("Product translation error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Translate product by ID (fetches from database and translates)
  app.get("/api/translation/product/:id", async (req: Request, res: Response) => {
    try {
      const productId = parseInt(req.params.id);
      const targetLang = req.query.lang as string || 'en';

      if (isNaN(productId)) {
        return res.status(400).json({ success: false, error: "Invalid product ID" });
      }

      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ success: false, error: "Product not found" });
      }

      // If English is requested, return original
      if (targetLang === 'en') {
        return res.json({
          success: true,
          data: {
            id: product.id,
            title: product.title,
            description: product.description,
            tags: product.tags,
            translated: false
          }
        });
      }

      // Translate product content
      const translated = await deeplService.translateProduct(
        {
          title: product.title,
          description: product.description,
          tags: product.tags
        },
        targetLang
      );

      res.json({
        success: true,
        data: {
          id: product.id,
          title: translated.title,
          description: translated.description,
          tags: translated.tags,
          translated: true,
          originalTitle: product.title
        }
      });
    } catch (error: any) {
      console.error("Product translation fetch error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get supported languages
  app.get("/api/translation/languages", async (req: Request, res: Response) => {
    try {
      const languages = await deeplService.getSupportedLanguages();
      res.json({ success: true, data: languages });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return httpServer;
}
