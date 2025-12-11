import { storage } from "../storage";
import { webhookService } from "./webhookService";

export interface ImportResult {
  success: boolean;
  totalRows: number;
  successCount: number;
  errorCount: number;
  errors: Array<{ row: number; error: string }>;
}

export interface OrderImportRow {
  orderNumber?: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState?: string;
  shippingCountry: string;
  shippingZip: string;
  items: string;
  subtotal: number;
  shippingCost?: number;
  taxAmount?: number;
  totalAmount: number;
  notes?: string;
}

class BulkImportService {
  async parseCSV(csvContent: string): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
    const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) {
      throw new Error("Empty CSV file");
    }

    const headers = this.parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      if (values.length === 0 || values.every(v => !v.trim())) continue;

      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx]?.trim() || "";
      });
      rows.push(row);
    }

    return { headers, rows };
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  async importOrders(merchantId: number, csvContent: string): Promise<ImportResult> {
    const { headers, rows } = await this.parseCSV(csvContent);

    const requiredFields = ["customername", "customeremail", "totalamount"];
    const missing = requiredFields.filter(f => !headers.includes(f.toLowerCase().replace(/\s/g, "")));
    if (missing.length > 0) {
      throw new Error(`Missing required columns: ${missing.join(", ")}`);
    }

    const result: ImportResult = {
      success: true,
      totalRows: rows.length,
      successCount: 0,
      errorCount: 0,
      errors: [],
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        await this.createOrderFromRow(merchantId, row, i + 2);
        result.successCount++;
      } catch (error: any) {
        result.errorCount++;
        result.errors.push({ row: i + 2, error: error.message });
      }
    }

    result.success = result.errorCount === 0;
    return result;
  }

  private async createOrderFromRow(merchantId: number, row: Record<string, string>, rowNum: number): Promise<void> {
    const customerName = row["customername"] || row["customer_name"] || row["name"];
    const customerEmail = row["customeremail"] || row["customer_email"] || row["email"];
    
    if (!customerName) throw new Error("Customer name is required");
    if (!customerEmail) throw new Error("Customer email is required");

    const totalAmount = this.parseAmount(row["totalamount"] || row["total_amount"] || row["total"]);
    if (isNaN(totalAmount) || totalAmount <= 0) {
      throw new Error("Invalid total amount");
    }

    let customer = await storage.getCustomerByEmail(merchantId, customerEmail);
    if (!customer) {
      const nameParts = customerName.split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";
      
      customer = await storage.createCustomer({
        merchantId,
        email: customerEmail,
        firstName,
        lastName,
        phone: row["customerphone"] || row["customer_phone"] || row["phone"] || null,
        addresses: [{
          firstName,
          lastName,
          address1: row["shippingaddress"] || row["shipping_address"] || row["address"] || "",
          city: row["shippingcity"] || row["shipping_city"] || row["city"] || "",
          province: row["shippingstate"] || row["shipping_state"] || row["state"] || "",
          country: row["shippingcountry"] || row["shipping_country"] || row["country"] || "US",
          zip: row["shippingzip"] || row["shipping_zip"] || row["zip"] || "",
        }],
      });
    }

    const subtotal = this.parseAmount(row["subtotal"]) || totalAmount;
    const shippingCost = this.parseAmount(row["shippingcost"] || row["shipping_cost"] || row["shipping"]) || 0;
    const taxAmount = this.parseAmount(row["taxamount"] || row["tax_amount"] || row["tax"]) || 0;

    const customerFullName = `${customer.firstName} ${customer.lastName}`.trim();
    
    const order = await storage.createOrder({
      merchantId,
      customerId: customer.id,
      customerName: customerFullName,
      customerEmail: customer.email!,
      orderNumber: row["ordernumber"] || row["order_number"] || `IMP-${Date.now()}-${rowNum}`,
      subtotal: Math.round(subtotal * 100),
      shippingCost: Math.round(shippingCost * 100),
      taxAmount: Math.round(taxAmount * 100),
      totalAmount: Math.round(totalAmount * 100),
      status: "pending",
      paymentStatus: "pending",
      fulfillmentStatus: "unfulfilled",
      shippingAddress: {
        firstName: customer.firstName,
        lastName: customer.lastName,
        address1: row["shippingaddress"] || row["shipping_address"] || row["address"] || "",
        city: row["shippingcity"] || row["shipping_city"] || row["city"] || "",
        province: row["shippingstate"] || row["shipping_state"] || row["state"] || "",
        country: row["shippingcountry"] || row["shipping_country"] || row["country"] || "US",
        zip: row["shippingzip"] || row["shipping_zip"] || row["zip"] || "",
      },
      notes: row["notes"] || null,
    });

    webhookService.triggerEvent("order.created", merchantId, { orderId: order.id });
  }

  private parseAmount(value: string | undefined): number {
    if (!value) return 0;
    const cleaned = value.replace(/[^0-9.-]/g, "");
    return parseFloat(cleaned) || 0;
  }

  async importProducts(merchantId: number, csvContent: string): Promise<ImportResult> {
    const { headers, rows } = await this.parseCSV(csvContent);

    const requiredFields = ["title", "price"];
    const missing = requiredFields.filter(f => !headers.includes(f.toLowerCase()));
    if (missing.length > 0) {
      throw new Error(`Missing required columns: ${missing.join(", ")}`);
    }

    const result: ImportResult = {
      success: true,
      totalRows: rows.length,
      successCount: 0,
      errorCount: 0,
      errors: [],
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        await this.createProductFromRow(merchantId, row);
        result.successCount++;
      } catch (error: any) {
        result.errorCount++;
        result.errors.push({ row: i + 2, error: error.message });
      }
    }

    result.success = result.errorCount === 0;
    return result;
  }

  private async createProductFromRow(merchantId: number, row: Record<string, string>): Promise<void> {
    const title = row["title"] || row["name"] || row["product_name"];
    if (!title) throw new Error("Title is required");

    const price = this.parseAmount(row["price"]);
    if (isNaN(price) || price <= 0) {
      throw new Error("Invalid price");
    }

    const costPrice = this.parseAmount(row["costprice"] || row["cost"]) || price * 0.7;
    const sku = row["sku"] || `IMP-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    
    await storage.createProduct({
      merchantId,
      supplierId: 1,
      title,
      description: row["description"] || null,
      supplierPrice: costPrice,
      merchantPrice: price,
      inventoryQuantity: parseInt(row["inventory"] || row["quantity"] || row["stock"] || "0") || 0,
      category: row["category"] || null,
      tags: row["tags"]?.split(",").map(t => t.trim()) || [],
      isGlobal: false,
      status: "active",
      variants: [{
        id: sku,
        sku: sku,
        barcode: row["barcode"] || undefined,
        title: "Default",
        price: Math.round(price * 100),
        compareAtPrice: row["compareatprice"] ? Math.round(this.parseAmount(row["compareatprice"]) * 100) : undefined,
        cost: Math.round(costPrice * 100),
        inventoryQuantity: parseInt(row["inventory"] || row["quantity"] || row["stock"] || "0") || 0,
      }],
    });
  }

  getCSVTemplate(type: "orders" | "products"): string {
    if (type === "orders") {
      return `orderNumber,customerName,customerEmail,customerPhone,shippingAddress,shippingCity,shippingState,shippingCountry,shippingZip,subtotal,shippingCost,taxAmount,totalAmount,notes
ORD-001,John Doe,john@example.com,555-1234,123 Main St,New York,NY,US,10001,99.99,5.99,8.50,114.48,Rush order
ORD-002,Jane Smith,jane@example.com,555-5678,456 Oak Ave,Los Angeles,CA,US,90001,149.99,0,12.00,161.99,`;
    } else {
      return `title,description,sku,price,compareAtPrice,costPrice,inventory,category,vendor,tags
Sample Product,A great product description,SKU-001,29.99,39.99,15.00,100,Electronics,Acme Corp,"new,featured,sale"
Another Product,Another description,SKU-002,49.99,,25.00,50,Clothing,Fashion Inc,"trending"`;
    }
  }
}

export const bulkImportService = new BulkImportService();
