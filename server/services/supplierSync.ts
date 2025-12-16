import { storage } from "../storage";
import { createSupplierAdapter } from "../supplierAdapters";
import type { Supplier, InsertProduct } from "@shared/schema";
import type { NormalizedProduct, NormalizedInventory } from "../supplierAdapters/types";

const SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const BATCH_SIZE = 250;

// GigaB2B permanent pricing markup (60% app profit)
// Final Price = Base Price × 1.6
const GIGAB2B_SUPPLIER_ID = 2;
const GIGAB2B_PRICE_MULTIPLIER = 1.6;

interface SyncStatus {
  isRunning: boolean;
  lastSyncAt: Date | null;
  nextSyncAt: Date | null;
  currentSupplier: string | null;
  progress: {
    suppliersTotal: number;
    suppliersCompleted: number;
    productsTotal: number;
    productsProcessed: number;
  };
  errors: { supplier: string; error: string; timestamp: Date }[];
}

class SupplierSyncService {
  private syncStatus: SyncStatus = {
    isRunning: false,
    lastSyncAt: null,
    nextSyncAt: null,
    currentSupplier: null,
    progress: {
      suppliersTotal: 0,
      suppliersCompleted: 0,
      productsTotal: 0,
      productsProcessed: 0,
    },
    errors: [],
  };
  private syncInterval: NodeJS.Timeout | null = null;

  getStatus(): SyncStatus {
    return { ...this.syncStatus };
  }

  start(): void {
    if (this.syncInterval) {
      console.log("[SupplierSync] Already running");
      return;
    }

    console.log("[SupplierSync] Starting automated sync service (every 15 minutes)");
    
    // Run initial sync after 1 minute (let server fully start)
    setTimeout(() => {
      this.runSync().catch(err => console.error("[SupplierSync] Initial sync error:", err));
    }, 60000);

    // Schedule recurring sync
    this.syncInterval = setInterval(() => {
      this.runSync().catch(err => console.error("[SupplierSync] Scheduled sync error:", err));
    }, SYNC_INTERVAL_MS);

    this.syncStatus.nextSyncAt = new Date(Date.now() + 60000);
  }

  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log("[SupplierSync] Stopped");
    }
  }

  async runSync(): Promise<void> {
    if (this.syncStatus.isRunning) {
      console.log("[SupplierSync] Sync already in progress, skipping");
      return;
    }

    this.syncStatus.isRunning = true;
    this.syncStatus.errors = [];
    console.log("[SupplierSync] Starting sync for all suppliers");

    try {
      const suppliers = await storage.getActiveSuppliers();
      console.log(`[SupplierSync] Found ${suppliers.length} active suppliers:`, suppliers.map(s => `${s.name} (${s.type})`).join(", "));
      this.syncStatus.progress.suppliersTotal = suppliers.length;
      this.syncStatus.progress.suppliersCompleted = 0;

      for (const supplier of suppliers) {
        try {
          await this.syncSupplier(supplier);
          this.syncStatus.progress.suppliersCompleted++;
        } catch (error: any) {
          console.error(`[SupplierSync] Error syncing supplier ${supplier.name}:`, error.message);
          this.syncStatus.errors.push({
            supplier: supplier.name,
            error: error.message,
            timestamp: new Date(),
          });
        }
      }

      this.syncStatus.lastSyncAt = new Date();
      this.syncStatus.nextSyncAt = new Date(Date.now() + SYNC_INTERVAL_MS);
      console.log(`[SupplierSync] Sync completed. Next sync at ${this.syncStatus.nextSyncAt.toISOString()}`);
    } finally {
      this.syncStatus.isRunning = false;
      this.syncStatus.currentSupplier = null;
    }
  }

  private async syncSupplier(supplier: Supplier): Promise<void> {
    this.syncStatus.currentSupplier = supplier.name;
    console.log(`[SupplierSync] Syncing supplier: ${supplier.name} (${supplier.type})`);

    const credentials = supplier.apiCredentials;
    if (!credentials || Object.keys(credentials).length === 0) {
      console.log(`[SupplierSync] Skipping ${supplier.name} - no credentials configured`);
      return;
    }

    const adapter = createSupplierAdapter(supplier.type, credentials);

    // Test connection first
    const connectionResult = await adapter.testConnection();
    if (!connectionResult.success) {
      await storage.updateSupplier(supplier.id, {
        connectionStatus: "error",
        connectionError: connectionResult.message,
        lastConnectionTest: new Date(),
      });
      throw new Error(`Connection test failed: ${connectionResult.message}`);
    }

    await storage.updateSupplier(supplier.id, {
      connectionStatus: "connected",
      connectionError: null,
      lastConnectionTest: new Date(),
    });

    // Sync products - supports both page-based and cursor-based pagination
    let page = 1;
    let totalSynced = 0;
    let hasMore = true;
    let cursor: string | undefined = undefined;

    while (hasMore) {
      // For Shopify (cursor-based): pass cursor as 3rd param
      // For GigaB2B (page-based): uses page param
      const result = supplier.type === "shopify" 
        ? await (adapter as any).fetchProducts(page, BATCH_SIZE, cursor)
        : await adapter.fetchProducts(page, BATCH_SIZE);
      
      if (result.items.length === 0) {
        break;
      }

      // Process batch of products
      for (const product of result.items) {
        await this.upsertProduct(supplier.id, product);
        totalSynced++;
        this.syncStatus.progress.productsProcessed++;
      }

      console.log(`[SupplierSync] ${supplier.name}: Synced page ${page} (${result.items.length} products)`);
      
      hasMore = result.hasMore;
      cursor = result.nextCursor; // For cursor-based pagination
      page++;
      
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Update supplier stats
    await storage.updateSupplier(supplier.id, {
      totalProducts: totalSynced,
      config: {
        ...((supplier.config as any) || {}),
        lastSyncAt: new Date().toISOString(),
        nextSyncAt: new Date(Date.now() + SYNC_INTERVAL_MS).toISOString(),
      },
    });

    console.log(`[SupplierSync] ${supplier.name}: Completed - ${totalSynced} products synced`);
  }

  private async upsertProduct(supplierId: number, product: NormalizedProduct): Promise<void> {
    // Check if product already exists
    const existingProducts = await storage.getProductsBySupplierProductId(supplierId, product.supplierProductId);
    
    // Apply GigaB2B permanent 60% markup (Final Price = Base Price × 1.6)
    const isGigaB2B = supplierId === GIGAB2B_SUPPLIER_ID;
    const finalPrice = isGigaB2B 
      ? Math.round(product.supplierPrice * GIGAB2B_PRICE_MULTIPLIER * 100) / 100
      : product.supplierPrice;
    
    const productData: Partial<InsertProduct> = {
      supplierId,
      title: product.title,
      description: product.description,
      tags: product.tags,
      images: product.images,
      variants: product.variants,
      supplierProductId: product.supplierProductId,
      supplierSku: product.supplierSku,
      supplierPrice: product.supplierPrice,
      merchantPrice: finalPrice,
      inventoryQuantity: product.variants[0]?.inventoryQuantity || 0,
      status: "active",
      isGlobal: true,
      syncStatus: "synced",
      lastSyncedAt: new Date(),
    };

    if (existingProducts && existingProducts.length > 0) {
      const existingProduct = existingProducts[0];
      // Preserve admin-assigned category if it exists (categoryId is set)
      // Only update category if no admin assignment was made
      if (!existingProduct.categoryId) {
        (productData as any).category = product.category || "Uncategorized";
      }
      // Update existing product (preserving categoryId and category if admin-assigned)
      await storage.updateProduct(existingProduct.id, productData);
    } else {
      // Create new product with supplier category
      (productData as any).category = product.category || "Uncategorized";
      await storage.createProduct(productData as InsertProduct);
    }
  }

  // Sync inventory for specific products (can be called on-demand)
  async syncInventory(supplierId: number, productIds?: string[]): Promise<NormalizedInventory[]> {
    const supplier = await storage.getSupplier(supplierId);
    if (!supplier || !supplier.apiCredentials) {
      throw new Error("Supplier not found or no credentials");
    }

    const adapter = createSupplierAdapter(supplier.type, supplier.apiCredentials);
    const inventory = await adapter.fetchInventory(productIds);

    // Update inventory in database
    for (const item of inventory) {
      const products = await storage.getProductsBySupplierProductId(supplierId, item.supplierProductId);
      if (products && products.length > 0) {
        await storage.updateProduct(products[0].id, {
          inventoryQuantity: item.quantity,
          lastSyncedAt: new Date(),
        });
      }
    }

    return inventory;
  }
}

export const supplierSyncService = new SupplierSyncService();
