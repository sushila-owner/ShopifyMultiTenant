import { storage } from "../storage";
import { emailService } from "./emailService";
import type { Order, Merchant } from "@shared/schema";

export interface ReturnRequest {
  orderId: number;
  merchantId: number;
  items: {
    productId: number;
    quantity: number;
    reason: string;
  }[];
  reason: string;
  customerNotes?: string;
}

export interface ReturnResult {
  success: boolean;
  returnId?: number;
  refundAmount?: number;
  error?: string;
}

interface Return {
  id: number;
  orderId: number;
  merchantId: number;
  status: "pending" | "approved" | "rejected" | "completed" | "cancelled";
  items: ReturnRequest["items"];
  reason: string;
  customerNotes?: string;
  refundAmount: number;
  refundedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

class ReturnsService {
  private returns: Map<number, Return> = new Map();
  private nextId: number = 1;

  async createReturn(request: ReturnRequest): Promise<ReturnResult> {
    try {
      const order = await storage.getOrder(request.orderId);
      if (!order) {
        return { success: false, error: "Order not found" };
      }

      if (order.merchantId !== request.merchantId) {
        return { success: false, error: "Order does not belong to this merchant" };
      }

      if (order.status === "refunded") {
        return { success: false, error: "Order has already been refunded" };
      }

      let refundAmount = 0;
      const orderItems = (order.items as any[]) || [];
      
      for (const returnItem of request.items) {
        const orderItem = orderItems.find(i => i.productId === returnItem.productId);
        if (!orderItem) {
          return { success: false, error: `Product ${returnItem.productId} not found in order` };
        }
        
        if (returnItem.quantity > orderItem.quantity) {
          return { success: false, error: `Cannot return more than ordered quantity for product ${returnItem.productId}` };
        }

        refundAmount += (orderItem.price || 0) * returnItem.quantity;
      }

      const returnRecord: Return = {
        id: this.nextId++,
        orderId: request.orderId,
        merchantId: request.merchantId,
        status: "pending",
        items: request.items,
        reason: request.reason,
        customerNotes: request.customerNotes,
        refundAmount,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.returns.set(returnRecord.id, returnRecord);

      console.log(`[Returns] Created return #${returnRecord.id} for order #${order.orderNumber}, refund amount: $${(refundAmount / 100).toFixed(2)}`);

      return {
        success: true,
        returnId: returnRecord.id,
        refundAmount,
      };
    } catch (error: any) {
      console.error("[Returns] Create return error:", error);
      return { success: false, error: error.message };
    }
  }

  async approveReturn(returnId: number, merchantId: number): Promise<ReturnResult> {
    try {
      const returnRecord = this.returns.get(returnId);
      if (!returnRecord) {
        return { success: false, error: "Return not found" };
      }

      if (returnRecord.merchantId !== merchantId) {
        return { success: false, error: "Return does not belong to this merchant" };
      }

      if (returnRecord.status !== "pending") {
        return { success: false, error: `Return is already ${returnRecord.status}` };
      }

      returnRecord.status = "approved";
      returnRecord.updatedAt = new Date();
      this.returns.set(returnId, returnRecord);

      console.log(`[Returns] Approved return #${returnId}`);

      return { success: true, returnId, refundAmount: returnRecord.refundAmount };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async processRefund(returnId: number, merchantId: number): Promise<ReturnResult> {
    try {
      const returnRecord = this.returns.get(returnId);
      if (!returnRecord) {
        return { success: false, error: "Return not found" };
      }

      if (returnRecord.merchantId !== merchantId) {
        return { success: false, error: "Return does not belong to this merchant" };
      }

      if (returnRecord.status !== "approved") {
        return { success: false, error: "Return must be approved before refunding" };
      }

      const order = await storage.getOrder(returnRecord.orderId);
      if (!order) {
        return { success: false, error: "Order not found" };
      }

      const refundResult = await storage.refundToWallet(
        merchantId,
        returnRecord.orderId,
        returnRecord.refundAmount,
        `Refund for return #${returnId} - Order #${order.orderNumber}`
      );

      if (!refundResult.success) {
        return { success: false, error: "Failed to process wallet refund" };
      }

      returnRecord.status = "completed";
      returnRecord.refundedAt = new Date();
      returnRecord.updatedAt = new Date();
      this.returns.set(returnId, returnRecord);

      await storage.updateOrder(returnRecord.orderId, {
        status: returnRecord.refundAmount === order.total ? "refunded" : "completed",
        timeline: [
          ...((order.timeline as any[]) || []),
          {
            status: "refunded",
            message: `Return #${returnId} processed. $${(returnRecord.refundAmount / 100).toFixed(2)} refunded to wallet.`,
            createdAt: new Date().toISOString(),
          },
        ],
      });

      const merchant = await storage.getMerchant(merchantId);
      if (merchant) {
        await emailService.sendRefundProcessedNotification(merchant, order, returnRecord.refundAmount);
      }

      console.log(`[Returns] Processed refund for return #${returnId}: $${(returnRecord.refundAmount / 100).toFixed(2)}`);

      return {
        success: true,
        returnId,
        refundAmount: returnRecord.refundAmount,
      };
    } catch (error: any) {
      console.error("[Returns] Process refund error:", error);
      return { success: false, error: error.message };
    }
  }

  async rejectReturn(returnId: number, merchantId: number, reason?: string): Promise<ReturnResult> {
    try {
      const returnRecord = this.returns.get(returnId);
      if (!returnRecord) {
        return { success: false, error: "Return not found" };
      }

      if (returnRecord.merchantId !== merchantId) {
        return { success: false, error: "Return does not belong to this merchant" };
      }

      if (returnRecord.status !== "pending") {
        return { success: false, error: `Return is already ${returnRecord.status}` };
      }

      returnRecord.status = "rejected";
      returnRecord.updatedAt = new Date();
      if (reason) {
        returnRecord.customerNotes = `Rejected: ${reason}`;
      }
      this.returns.set(returnId, returnRecord);

      console.log(`[Returns] Rejected return #${returnId}`);

      return { success: true, returnId };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getReturnsByMerchant(merchantId: number): Promise<Return[]> {
    const merchantReturns: Return[] = [];
    for (const returnRecord of this.returns.values()) {
      if (returnRecord.merchantId === merchantId) {
        merchantReturns.push(returnRecord);
      }
    }
    return merchantReturns.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getReturn(returnId: number): Promise<Return | null> {
    return this.returns.get(returnId) || null;
  }

  async getReturnsByOrder(orderId: number): Promise<Return[]> {
    const orderReturns: Return[] = [];
    for (const returnRecord of this.returns.values()) {
      if (returnRecord.orderId === orderId) {
        orderReturns.push(returnRecord);
      }
    }
    return orderReturns;
  }
}

export const returnsService = new ReturnsService();
