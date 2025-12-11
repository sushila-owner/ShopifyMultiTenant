import { storage } from "../storage";
import { createSupplierAdapter } from "../supplierAdapters";
import type { Order, SupplierOrder, Product, Customer, Merchant } from "@shared/schema";
import type { OrderCreateRequest, TrackingInfo } from "../supplierAdapters/types";

interface FulfillmentResult {
  success: boolean;
  supplierOrderId?: string;
  walletTransactionId?: number;
  error?: string;
  insufficientFunds?: boolean;
}

interface WalletPaymentResult {
  success: boolean;
  transactionId?: number;
  error?: string;
  insufficientFunds?: boolean;
}

class OrderFulfillmentService {
  
  async createSupplierOrderFromMerchantOrder(order: Order): Promise<FulfillmentResult[]> {
    console.log(`[OrderFulfillment] Processing order ${order.id}`);
    
    const results: FulfillmentResult[] = [];
    const items = (order.items as any[]) || [];
    
    if (items.length === 0) {
      console.log(`[OrderFulfillment] No items in order ${order.id}`);
      return results;
    }

    // Group items by supplier
    const supplierGroups = new Map<number, { product: Product; quantity: number; price: number }[]>();
    
    for (const item of items) {
      const product = await storage.getProduct(item.productId);
      if (!product || !product.supplierId) {
        console.log(`[OrderFulfillment] Product ${item.productId} not found or has no supplier`);
        continue;
      }
      
      if (!supplierGroups.has(product.supplierId)) {
        supplierGroups.set(product.supplierId, []);
      }
      
      supplierGroups.get(product.supplierId)!.push({
        product,
        quantity: item.quantity,
        price: item.price || product.supplierPrice,
      });
    }

    // Get customer info for shipping address
    const customer = order.customerId ? await storage.getCustomer(order.customerId) : null;
    const shippingAddress = this.buildShippingAddress(order, customer || null);

    // Create order for each supplier
    for (const [supplierId, supplierItems] of Array.from(supplierGroups.entries())) {
      try {
        const result = await this.createSupplierOrder(order, supplierId, supplierItems, shippingAddress);
        results.push(result);
      } catch (error: any) {
        console.error(`[OrderFulfillment] Error creating order for supplier ${supplierId}:`, error);
        results.push({
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  private async createSupplierOrder(
    order: Order,
    supplierId: number,
    items: { product: Product; quantity: number; price: number }[],
    shippingAddress: OrderCreateRequest["shippingAddress"]
  ): Promise<FulfillmentResult> {
    const supplier = await storage.getSupplier(supplierId);
    if (!supplier || !supplier.apiCredentials) {
      return { success: false, error: "Supplier not found or no credentials" };
    }

    // Create supplier order record in pending state
    const supplierOrder = await storage.createSupplierOrder({
      orderId: order.id,
      supplierId,
      merchantId: order.merchantId!,
      status: "pending",
      items: items.map(i => ({
        productId: i.product.id,
        supplierProductId: i.product.supplierProductId || "",
        variantId: i.product.variants?.[0]?.id || "",
        sku: i.product.supplierSku || "",
        quantity: i.quantity,
        price: i.price,
      })),
      totalCost: items.reduce((sum, i) => sum + i.price * i.quantity, 0),
      shippingAddress,
    });

    try {
      const adapter = createSupplierAdapter(supplier.type, supplier.apiCredentials);
      
      const orderRequest: OrderCreateRequest = {
        items: items.map(i => ({
          supplierProductId: i.product.supplierProductId || "",
          variantId: i.product.variants?.[0]?.id || "",
          sku: i.product.supplierSku || "",
          quantity: i.quantity,
          price: i.price,
        })),
        shippingAddress,
        note: `Merchant Order #${order.id}`,
      };

      const response = await adapter.createOrder(orderRequest);
      
      // Update supplier order with response
      await storage.updateSupplierOrder(supplierOrder.id, {
        supplierOrderId: response.supplierOrderId,
        status: "submitted",
        totalCost: response.totalCost,
      });

      console.log(`[OrderFulfillment] Created supplier order ${response.supplierOrderId} for merchant order ${order.id}`);
      
      return {
        success: true,
        supplierOrderId: response.supplierOrderId,
      };
    } catch (error: any) {
      await storage.updateSupplierOrder(supplierOrder.id, {
        status: "failed",
        errorMessage: error.message,
      });
      
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private buildShippingAddress(order: Order, customer: Customer | null): OrderCreateRequest["shippingAddress"] {
    const shippingInfo = order.shippingAddress as any || {};
    
    return {
      firstName: shippingInfo.firstName || customer?.firstName || "Customer",
      lastName: shippingInfo.lastName || customer?.lastName || "",
      address1: shippingInfo.address1 || shippingInfo.street || "",
      address2: shippingInfo.address2 || "",
      city: shippingInfo.city || "",
      province: shippingInfo.state || shippingInfo.province || "",
      country: shippingInfo.country || "US",
      zip: shippingInfo.zip || shippingInfo.postalCode || "",
      phone: shippingInfo.phone || customer?.phone || "",
      email: customer?.email || "",
    };
  }

  async updateTrackingInfo(supplierOrderId: number): Promise<TrackingInfo | null> {
    const supplierOrder = await storage.getSupplierOrder(supplierOrderId);
    if (!supplierOrder || !supplierOrder.supplierOrderId) {
      return null;
    }

    const supplier = await storage.getSupplier(supplierOrder.supplierId);
    if (!supplier || !supplier.apiCredentials) {
      return null;
    }

    try {
      const adapter = createSupplierAdapter(supplier.type, supplier.apiCredentials);
      const tracking = await adapter.getTracking(supplierOrder.supplierOrderId);
      
      if (tracking) {
        await storage.updateSupplierOrder(supplierOrderId, {
          tracking: {
            trackingNumber: tracking.trackingNumber,
            carrier: tracking.carrier,
            trackingUrl: tracking.trackingUrl,
            status: tracking.status,
            lastUpdate: tracking.lastUpdate,
          },
          status: this.mapTrackingStatusToOrderStatus(tracking.status),
        });

        // Update merchant order fulfillment status if we have tracking info
        if (supplierOrder.orderId && tracking.trackingNumber) {
          const order = await storage.getOrder(supplierOrder.orderId);
          if (order) {
            const items = (order.items as any[]) || [];
            const updatedItems = items.map((item: any) => {
              if (item.supplierId === supplierOrder.supplierId) {
                return {
                  ...item,
                  fulfillmentStatus: this.mapTrackingStatusToFulfillmentStatus(tracking.status),
                  trackingNumber: tracking.trackingNumber,
                  trackingUrl: tracking.trackingUrl,
                  carrier: tracking.carrier,
                };
              }
              return item;
            });
            
            await storage.updateOrder(supplierOrder.orderId, {
              items: updatedItems,
              fulfillmentStatus: this.mapTrackingStatusToFulfillmentStatus(tracking.status) as any,
            });
          }
        }
      }

      return tracking;
    } catch (error: any) {
      console.error(`[OrderFulfillment] Error getting tracking for supplier order ${supplierOrderId}:`, error);
      return null;
    }
  }

  private mapTrackingStatusToOrderStatus(trackingStatus: TrackingInfo["status"]): SupplierOrder["status"] {
    switch (trackingStatus) {
      case "pending":
        return "submitted";
      case "in_transit":
        return "shipped";
      case "out_for_delivery":
        return "shipped";
      case "delivered":
        return "delivered";
      case "exception":
        return "failed";
      default:
        return "submitted";
    }
  }

  private mapTrackingStatusToFulfillmentStatus(trackingStatus: TrackingInfo["status"]): string {
    switch (trackingStatus) {
      case "pending":
        return "unfulfilled";
      case "in_transit":
        return "fulfilled";
      case "out_for_delivery":
        return "fulfilled";
      case "delivered":
        return "fulfilled";
      case "exception":
        return "unfulfilled";
      default:
        return "unfulfilled";
    }
  }

  async checkAndUpdatePendingOrders(): Promise<void> {
    console.log("[OrderFulfillment] Checking pending supplier orders for tracking updates");
    
    const pendingOrders = await storage.getPendingSupplierOrders();
    
    for (const order of pendingOrders) {
      if (order.supplierOrderId) {
        await this.updateTrackingInfo(order.id);
      }
    }
  }

  async deductWalletForOrder(merchantId: number, orderId: number, amountCents: number): Promise<WalletPaymentResult> {
    try {
      const result = await storage.debitWalletForOrder(
        merchantId,
        orderId,
        amountCents,
        `Order fulfillment - Order #${orderId}`
      );
      
      if (!result.success) {
        return {
          success: false,
          insufficientFunds: true,
          error: result.error || "Insufficient wallet balance",
        };
      }
      
      console.log(`[OrderFulfillment] Deducted $${(amountCents / 100).toFixed(2)} from wallet for order ${orderId}`);
      
      return {
        success: true,
        transactionId: result.transaction?.id,
      };
    } catch (error: any) {
      console.error(`[OrderFulfillment] Wallet deduction failed for order ${orderId}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async fulfillOrderWithWallet(order: Order): Promise<{ success: boolean; results: FulfillmentResult[]; error?: string }> {
    console.log(`[OrderFulfillment] Starting fulfillment with wallet payment for order ${order.id}`);
    
    const totalCost = order.totalCost;
    if (!totalCost || totalCost <= 0) {
      return { success: false, results: [], error: "Order has no supplier cost" };
    }
    
    const walletResult = await this.deductWalletForOrder(order.merchantId, order.id, totalCost);
    
    if (!walletResult.success) {
      if (walletResult.insufficientFunds) {
        await storage.updateOrder(order.id, {
          internalNotes: `Awaiting wallet top-up. Required: $${(totalCost / 100).toFixed(2)}`,
        });
      }
      return { 
        success: false, 
        results: [{ 
          success: false, 
          error: walletResult.error,
          insufficientFunds: walletResult.insufficientFunds,
        }], 
        error: walletResult.error 
      };
    }
    
    const fulfillmentResults = await this.createSupplierOrderFromMerchantOrder(order);
    
    const allSuccessful = fulfillmentResults.every(r => r.success);
    
    if (allSuccessful) {
      await storage.updateOrder(order.id, {
        status: "processing",
        fulfillmentStatus: "partial",
        timeline: [
          ...(order.timeline as any[] || []),
          {
            status: "processing",
            message: `Supplier orders created. Wallet charged $${(totalCost / 100).toFixed(2)}`,
            createdAt: new Date().toISOString(),
          },
        ],
      });
    } else {
      await storage.refundToWallet(
        order.merchantId,
        order.id,
        totalCost,
        `Refund for failed fulfillment - Order #${order.id}`
      );
      
      console.log(`[OrderFulfillment] Refunded $${(totalCost / 100).toFixed(2)} due to fulfillment failure`);
    }
    
    return { 
      success: allSuccessful, 
      results: fulfillmentResults.map(r => ({ ...r, walletTransactionId: walletResult.transactionId })),
    };
  }

  async canFulfillOrder(order: Order): Promise<{ canFulfill: boolean; reason?: string }> {
    const balance = await storage.getWalletBalance(order.merchantId);
    const currentBalance = balance?.balanceCents || 0;
    const requiredAmount = order.totalCost || 0;
    
    if (requiredAmount <= 0) {
      return { canFulfill: false, reason: "Order has no supplier cost" };
    }
    
    if (currentBalance < requiredAmount) {
      return { 
        canFulfill: false, 
        reason: `Insufficient wallet balance. Need $${(requiredAmount / 100).toFixed(2)}, have $${(currentBalance / 100).toFixed(2)}` 
      };
    }
    
    return { canFulfill: true };
  }
}

export const orderFulfillmentService = new OrderFulfillmentService();
