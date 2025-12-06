import { storage } from "../storage";
import { createSupplierAdapter } from "../supplierAdapters";
import type { Order, SupplierOrder, Product, Customer } from "@shared/schema";
import type { OrderCreateRequest, TrackingInfo } from "../supplierAdapters/types";

interface FulfillmentResult {
  success: boolean;
  supplierOrderId?: string;
  error?: string;
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

        // Update merchant order tracking if we have tracking info
        if (supplierOrder.orderId && tracking.trackingNumber) {
          await storage.updateOrder(supplierOrder.orderId, {
            trackingNumber: tracking.trackingNumber,
            trackingUrl: tracking.trackingUrl,
            fulfillmentStatus: this.mapTrackingStatusToFulfillmentStatus(tracking.status) as any,
          });
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
}

export const orderFulfillmentService = new OrderFulfillmentService();
