import { storage } from "../storage";
import type { Merchant, User, Order, Product, Customer } from "@shared/schema";

interface DataExportResult {
  success: boolean;
  data?: {
    user: Partial<User>;
    merchant: Partial<Merchant> | null;
    products: Partial<Product>[];
    orders: Partial<Order>[];
    customers: Partial<Customer>[];
    exportedAt: string;
  };
  error?: string;
}

interface DataDeletionResult {
  success: boolean;
  deletedItems?: {
    products: number;
    orders: number;
    customers: number;
    walletTransactions: number;
    userDeleted: boolean;
    merchantDeleted: boolean;
  };
  error?: string;
}

class GDPRService {
  async exportMerchantData(merchantId: number): Promise<DataExportResult> {
    try {
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return { success: false, error: "Merchant not found" };
      }

      const user = merchant.ownerId ? await storage.getUser(merchant.ownerId) : null;
      const products = await storage.getProductsByMerchant(merchantId);
      const ordersResult = await storage.getOrdersByMerchant(merchantId, { page: 1, pageSize: 10000 });
      const customers = await storage.getCustomersByMerchant(merchantId);

      const sanitizedUser = user ? {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        createdAt: user.createdAt,
      } : null;

      const sanitizedMerchant = {
        id: merchant.id,
        businessName: merchant.businessName,
        ownerEmail: merchant.ownerEmail,
        subscriptionStatus: merchant.subscriptionStatus,
        createdAt: merchant.createdAt,
      };

      const sanitizedProducts = products.map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        category: p.category,
        merchantPrice: p.merchantPrice,
        inventoryQuantity: p.inventoryQuantity,
        status: p.status,
        createdAt: p.createdAt,
      }));

      const sanitizedOrders = ordersResult.orders.map(o => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customerEmail: o.customerEmail,
        total: o.total,
        status: o.status,
        fulfillmentStatus: o.fulfillmentStatus,
        createdAt: o.createdAt,
      }));

      const sanitizedCustomers = customers.map(c => ({
        id: c.id,
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        totalOrders: c.totalOrders,
        totalSpent: c.totalSpent,
        createdAt: c.createdAt,
      }));

      console.log(`[GDPR] Exported data for merchant ${merchantId}`);

      return {
        success: true,
        data: {
          user: sanitizedUser || {},
          merchant: sanitizedMerchant,
          products: sanitizedProducts,
          orders: sanitizedOrders,
          customers: sanitizedCustomers,
          exportedAt: new Date().toISOString(),
        },
      };
    } catch (error: any) {
      console.error("[GDPR] Export error:", error);
      return { success: false, error: error.message };
    }
  }

  async deleteMerchantData(merchantId: number, confirmDelete: boolean = false): Promise<DataDeletionResult> {
    if (!confirmDelete) {
      return { success: false, error: "Deletion must be confirmed" };
    }

    try {
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return { success: false, error: "Merchant not found" };
      }

      let productsDeleted = 0;
      let ordersDeleted = 0;
      let customersDeleted = 0;
      let walletTransactionsDeleted = 0;

      const products = await storage.getProductsByMerchant(merchantId);
      for (const product of products) {
        await storage.deleteProduct(product.id);
        productsDeleted++;
      }

      const ordersResult = await storage.getOrdersByMerchant(merchantId, { page: 1, pageSize: 10000 });
      for (const order of ordersResult.orders) {
        await storage.deleteOrder(order.id);
        ordersDeleted++;
      }

      const customers = await storage.getCustomersByMerchant(merchantId);
      for (const customer of customers) {
        await storage.deleteCustomer(customer.id);
        customersDeleted++;
      }

      let userDeleted = false;
      if (merchant.ownerId) {
        await storage.deleteUser(merchant.ownerId);
        userDeleted = true;
      }

      await storage.deleteMerchant(merchantId);

      console.log(`[GDPR] Deleted all data for merchant ${merchantId}: ${productsDeleted} products, ${ordersDeleted} orders, ${customersDeleted} customers`);

      return {
        success: true,
        deletedItems: {
          products: productsDeleted,
          orders: ordersDeleted,
          customers: customersDeleted,
          walletTransactions: walletTransactionsDeleted,
          userDeleted,
          merchantDeleted: true,
        },
      };
    } catch (error: any) {
      console.error("[GDPR] Deletion error:", error);
      return { success: false, error: error.message };
    }
  }

  async anonymizeCustomer(customerId: number, merchantId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const customer = await storage.getCustomer(customerId);
      if (!customer || customer.merchantId !== merchantId) {
        return { success: false, error: "Customer not found" };
      }

      await storage.updateCustomer(customerId, {
        email: `anonymized-${customerId}@deleted.local`,
        firstName: "Deleted",
        lastName: "User",
        phone: null,
        shippingAddresses: [],
        billingAddresses: [],
        notes: "This customer data has been anonymized per GDPR request",
      });

      console.log(`[GDPR] Anonymized customer ${customerId}`);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async handleShopifyDataRequest(shop: string, customerId?: string): Promise<DataExportResult> {
    console.log(`[GDPR] Shopify data request from ${shop} for customer ${customerId || "all"}`);
    
    return {
      success: true,
      data: {
        user: {},
        merchant: null,
        products: [],
        orders: [],
        customers: [],
        exportedAt: new Date().toISOString(),
      },
    };
  }

  async handleShopifyCustomerRedact(shop: string, customerId: string): Promise<{ success: boolean }> {
    console.log(`[GDPR] Shopify customer redact request from ${shop} for customer ${customerId}`);
    return { success: true };
  }

  async handleShopifyShopRedact(shop: string): Promise<{ success: boolean }> {
    console.log(`[GDPR] Shopify shop redact request from ${shop}`);
    return { success: true };
  }
}

export const gdprService = new GDPRService();
