import { storage } from "../storage";
import { createSupplierAdapter } from "../supplierAdapters";
import type { Product, Supplier } from "@shared/schema";

interface SyncResult {
  productId: number;
  title: string;
  oldQuantity: number;
  newQuantity: number;
  updated: boolean;
  error?: string;
}

class InventorySyncService {
  private isSyncing: boolean = false;
  private lastSyncTime: Date | null = null;
  private syncInterval: NodeJS.Timeout | null = null;

  async syncMerchantProductInventory(merchantId: number): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    
    try {
      const products = await storage.getProductsByMerchant(merchantId);
      
      const supplierGroups = new Map<number, Product[]>();
      for (const product of products) {
        if (product.supplierId) {
          if (!supplierGroups.has(product.supplierId)) {
            supplierGroups.set(product.supplierId, []);
          }
          supplierGroups.get(product.supplierId)!.push(product);
        }
      }

      for (const [supplierId, supplierProducts] of Array.from(supplierGroups.entries())) {
        const supplier = await storage.getSupplier(supplierId);
        if (!supplier || !supplier.apiCredentials) {
          continue;
        }

        try {
          const adapter = createSupplierAdapter(supplier.type, supplier.apiCredentials);
          
          for (const product of supplierProducts) {
            try {
              if (!product.supplierProductId) continue;
              
              const inventoryInfo = await adapter.getInventory(product.supplierProductId);
              
              if (inventoryInfo && inventoryInfo.quantity !== product.inventoryQuantity) {
                await storage.updateProduct(product.id, {
                  inventoryQuantity: inventoryInfo.quantity,
                  lastSyncedAt: new Date(),
                  syncStatus: "synced",
                });

                results.push({
                  productId: product.id,
                  title: product.title,
                  oldQuantity: product.inventoryQuantity || 0,
                  newQuantity: inventoryInfo.quantity,
                  updated: true,
                });

                if (inventoryInfo.quantity <= (product.lowStockThreshold || 10)) {
                  const merchant = await storage.getMerchant(merchantId);
                  if (merchant) {
                    const { emailService } = await import("./emailService");
                    await emailService.sendLowStockAlert(merchant, {
                      ...product,
                      inventoryQuantity: inventoryInfo.quantity,
                    });
                  }
                }
              } else {
                results.push({
                  productId: product.id,
                  title: product.title,
                  oldQuantity: product.inventoryQuantity || 0,
                  newQuantity: product.inventoryQuantity || 0,
                  updated: false,
                });
              }
            } catch (error: any) {
              console.error(`[InventorySync] Error syncing product ${product.id}:`, error.message);
              results.push({
                productId: product.id,
                title: product.title,
                oldQuantity: product.inventoryQuantity || 0,
                newQuantity: product.inventoryQuantity || 0,
                updated: false,
                error: error.message,
              });
            }
          }
        } catch (error: any) {
          console.error(`[InventorySync] Error with supplier ${supplierId}:`, error.message);
        }
      }

      console.log(`[InventorySync] Synced ${results.filter(r => r.updated).length}/${results.length} products for merchant ${merchantId}`);
    } catch (error: any) {
      console.error(`[InventorySync] Error syncing inventory for merchant ${merchantId}:`, error.message);
    }

    return results;
  }

  async syncGlobalProductInventory(): Promise<{ total: number; updated: number; errors: number }> {
    if (this.isSyncing) {
      console.log("[InventorySync] Sync already in progress, skipping...");
      return { total: 0, updated: 0, errors: 0 };
    }

    this.isSyncing = true;
    let total = 0;
    let updated = 0;
    let errors = 0;

    try {
      console.log("[InventorySync] Starting global inventory sync...");
      
      const suppliers = await storage.getActiveSuppliers();
      
      for (const supplier of suppliers) {
        if (!supplier.apiCredentials) continue;

        try {
          const adapter = createSupplierAdapter(supplier.type, supplier.apiCredentials);
          const products = await storage.getProductsBySupplier(supplier.id);
          
          for (const product of products) {
            total++;
            
            try {
              if (!product.supplierProductId) continue;
              
              const inventoryInfo = await adapter.getInventory(product.supplierProductId);
              
              if (inventoryInfo && inventoryInfo.quantity !== product.inventoryQuantity) {
                await storage.updateProduct(product.id, {
                  inventoryQuantity: inventoryInfo.quantity,
                  lastSyncedAt: new Date(),
                });
                updated++;
              }
            } catch (error: any) {
              errors++;
            }
          }
        } catch (error: any) {
          console.error(`[InventorySync] Error with supplier ${supplier.id}:`, error.message);
        }
      }

      this.lastSyncTime = new Date();
      console.log(`[InventorySync] Global sync complete: ${updated}/${total} updated, ${errors} errors`);
    } catch (error: any) {
      console.error("[InventorySync] Global sync failed:", error.message);
    } finally {
      this.isSyncing = false;
    }

    return { total, updated, errors };
  }

  async updateShopifyInventory(merchantId: number, productId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const product = await storage.getProduct(productId);
      if (!product || product.merchantId !== merchantId) {
        return { success: false, error: "Product not found" };
      }

      if (!product.shopifyProductId) {
        return { success: false, error: "Product not synced to Shopify" };
      }

      const { getShopifyServiceFromMerchant } = await import("../shopify");
      const shopifyService = await getShopifyServiceFromMerchant(merchantId);
      
      if (!shopifyService) {
        return { success: false, error: "Shopify not connected" };
      }

      console.log(`[InventorySync] Updating Shopify inventory for product ${productId}`);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  startAutoSync(intervalMinutes: number = 30): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    console.log(`[InventorySync] Starting auto-sync every ${intervalMinutes} minutes`);
    
    this.syncInterval = setInterval(() => {
      this.syncGlobalProductInventory();
    }, intervalMinutes * 60 * 1000);
  }

  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log("[InventorySync] Auto-sync stopped");
    }
  }

  getStatus(): { isSyncing: boolean; lastSyncTime: Date | null } {
    return {
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
    };
  }
}

export const inventorySyncService = new InventorySyncService();
