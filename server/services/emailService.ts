import { storage } from "../storage";
import type { Order, Merchant, Product } from "@shared/schema";

interface EmailConfig {
  provider: "console" | "sendgrid" | "mailgun" | "smtp";
  apiKey?: string;
  fromEmail: string;
  fromName: string;
}

interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

class EmailService {
  private config: EmailConfig = {
    provider: "console",
    fromEmail: "noreply@apexmartwholesale.com",
    fromName: "Apex Mart Wholesale",
  };

  constructor() {
    if (process.env.SENDGRID_API_KEY) {
      this.config.provider = "sendgrid";
      this.config.apiKey = process.env.SENDGRID_API_KEY;
    }
  }

  private async send(to: string, template: EmailTemplate): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.config.provider === "console") {
        console.log(`[Email] To: ${to}`);
        console.log(`[Email] Subject: ${template.subject}`);
        console.log(`[Email] Body: ${template.text.substring(0, 200)}...`);
        return { success: true };
      }

      if (this.config.provider === "sendgrid" && this.config.apiKey) {
        const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: to }] }],
            from: { email: this.config.fromEmail, name: this.config.fromName },
            subject: template.subject,
            content: [
              { type: "text/plain", value: template.text },
              { type: "text/html", value: template.html },
            ],
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          console.error("[Email] SendGrid error:", error);
          return { success: false, error };
        }

        return { success: true };
      }

      return { success: false, error: "No email provider configured" };
    } catch (error: any) {
      console.error("[Email] Send error:", error);
      return { success: false, error: error.message };
    }
  }

  async sendNewOrderNotification(merchant: Merchant, order: Order): Promise<void> {
    const items = (order.items as any[]) || [];
    const itemList = items.map(i => `• ${i.title} x${i.quantity}`).join("\n");
    const total = ((order.total || 0) / 100).toFixed(2);
    const profit = ((order.totalProfit || 0) / 100).toFixed(2);

    const template: EmailTemplate = {
      subject: `New Order #${order.orderNumber} - $${total}`,
      text: `
Hello ${merchant.businessName},

You have received a new order!

Order #${order.orderNumber}
Customer: ${order.customerEmail}
Total: $${total}
Your Profit: $${profit}

Items:
${itemList}

Log in to your dashboard to fulfill this order.

Best regards,
Apex Mart Wholesale
      `.trim(),
      html: `
<!DOCTYPE html>
<html>
<head><style>body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; } .container { max-width: 600px; margin: 0 auto; padding: 20px; } .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; } .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; } .highlight { background: #dbeafe; padding: 15px; border-radius: 8px; margin: 15px 0; } .btn { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px; }</style></head>
<body>
<div class="container">
  <div class="header">
    <h1 style="margin: 0;">New Order Received!</h1>
  </div>
  <div class="content">
    <p>Hello ${merchant.businessName},</p>
    <div class="highlight">
      <strong>Order #${order.orderNumber}</strong><br>
      Customer: ${order.customerEmail}<br>
      Total: <strong>$${total}</strong><br>
      Your Profit: <strong style="color: #16a34a;">$${profit}</strong>
    </div>
    <p><strong>Items:</strong></p>
    <ul>${items.map(i => `<li>${i.title} x${i.quantity}</li>`).join("")}</ul>
    <a href="#" class="btn">View Order Details</a>
    <p style="margin-top: 20px; color: #666;">Best regards,<br>Apex Mart Wholesale</p>
  </div>
</div>
</body>
</html>
      `.trim(),
    };

    await this.send(merchant.ownerEmail, template);
  }

  async sendLowStockAlert(merchant: Merchant, product: Product): Promise<void> {
    const template: EmailTemplate = {
      subject: `Low Stock Alert: ${product.title}`,
      text: `
Hello ${merchant.businessName},

Your product "${product.title}" is running low on stock.

Current Stock: ${product.inventoryQuantity} units
Threshold: ${product.lowStockThreshold} units

Please restock soon to avoid missing sales.

Best regards,
Apex Mart Wholesale
      `.trim(),
      html: `
<!DOCTYPE html>
<html>
<head><style>body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; } .container { max-width: 600px; margin: 0 auto; padding: 20px; } .header { background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; } .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; } .alert-box { background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 15px 0; }</style></head>
<body>
<div class="container">
  <div class="header">
    <h1 style="margin: 0;">⚠️ Low Stock Alert</h1>
  </div>
  <div class="content">
    <p>Hello ${merchant.businessName},</p>
    <div class="alert-box">
      <strong>${product.title}</strong><br>
      Current Stock: <strong style="color: #dc2626;">${product.inventoryQuantity}</strong> units<br>
      Threshold: ${product.lowStockThreshold} units
    </div>
    <p>Please restock soon to avoid missing sales.</p>
    <p style="margin-top: 20px; color: #666;">Best regards,<br>Apex Mart Wholesale</p>
  </div>
</div>
</body>
</html>
      `.trim(),
    };

    await this.send(merchant.ownerEmail, template);
  }

  async sendWalletLowBalanceAlert(merchant: Merchant, balance: number, threshold: number = 1000): Promise<void> {
    const balanceStr = (balance / 100).toFixed(2);
    const thresholdStr = (threshold / 100).toFixed(2);

    const template: EmailTemplate = {
      subject: `Low Wallet Balance Alert - $${balanceStr} remaining`,
      text: `
Hello ${merchant.businessName},

Your wallet balance is running low.

Current Balance: $${balanceStr}
Recommended Minimum: $${thresholdStr}

Add funds to ensure uninterrupted order fulfillment.

Best regards,
Apex Mart Wholesale
      `.trim(),
      html: `
<!DOCTYPE html>
<html>
<head><style>body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; } .container { max-width: 600px; margin: 0 auto; padding: 20px; } .header { background: #f59e0b; color: white; padding: 20px; border-radius: 8px 8px 0 0; } .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; } .balance-box { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin: 15px 0; } .btn { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px; }</style></head>
<body>
<div class="container">
  <div class="header">
    <h1 style="margin: 0;">💰 Low Wallet Balance</h1>
  </div>
  <div class="content">
    <p>Hello ${merchant.businessName},</p>
    <div class="balance-box">
      <strong>Current Balance: $${balanceStr}</strong><br>
      Recommended Minimum: $${thresholdStr}
    </div>
    <p>Add funds to ensure uninterrupted order fulfillment.</p>
    <a href="#" class="btn">Add Funds Now</a>
    <p style="margin-top: 20px; color: #666;">Best regards,<br>Apex Mart Wholesale</p>
  </div>
</div>
</body>
</html>
      `.trim(),
    };

    await this.send(merchant.ownerEmail, template);
  }

  async sendOrderFulfilledNotification(merchant: Merchant, order: Order, trackingNumber?: string): Promise<void> {
    const template: EmailTemplate = {
      subject: `Order #${order.orderNumber} has been fulfilled`,
      text: `
Hello ${merchant.businessName},

Great news! Order #${order.orderNumber} has been fulfilled and is on its way to your customer.

${trackingNumber ? `Tracking Number: ${trackingNumber}` : "Tracking information will be available soon."}

Best regards,
Apex Mart Wholesale
      `.trim(),
      html: `
<!DOCTYPE html>
<html>
<head><style>body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; } .container { max-width: 600px; margin: 0 auto; padding: 20px; } .header { background: #16a34a; color: white; padding: 20px; border-radius: 8px 8px 0 0; } .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; } .success-box { background: #dcfce7; border-left: 4px solid #16a34a; padding: 15px; margin: 15px 0; }</style></head>
<body>
<div class="container">
  <div class="header">
    <h1 style="margin: 0;">✅ Order Fulfilled!</h1>
  </div>
  <div class="content">
    <p>Hello ${merchant.businessName},</p>
    <div class="success-box">
      <strong>Order #${order.orderNumber}</strong> has been fulfilled!<br>
      ${trackingNumber ? `<br>Tracking: <strong>${trackingNumber}</strong>` : "Tracking information will be available soon."}
    </div>
    <p style="margin-top: 20px; color: #666;">Best regards,<br>Apex Mart Wholesale</p>
  </div>
</div>
</body>
</html>
      `.trim(),
    };

    await this.send(merchant.ownerEmail, template);
  }

  async sendSubscriptionExpiringNotification(merchant: Merchant, daysRemaining: number): Promise<void> {
    const template: EmailTemplate = {
      subject: `Your subscription expires in ${daysRemaining} days`,
      text: `
Hello ${merchant.businessName},

Your Apex Mart Wholesale subscription will expire in ${daysRemaining} days.

Renew now to continue enjoying uninterrupted access to our wholesale catalog and fulfillment services.

Best regards,
Apex Mart Wholesale
      `.trim(),
      html: `
<!DOCTYPE html>
<html>
<head><style>body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; } .container { max-width: 600px; margin: 0 auto; padding: 20px; } .header { background: #7c3aed; color: white; padding: 20px; border-radius: 8px 8px 0 0; } .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; } .btn { display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px; }</style></head>
<body>
<div class="container">
  <div class="header">
    <h1 style="margin: 0;">⏰ Subscription Expiring Soon</h1>
  </div>
  <div class="content">
    <p>Hello ${merchant.businessName},</p>
    <p>Your subscription expires in <strong>${daysRemaining} days</strong>.</p>
    <p>Renew now to continue enjoying uninterrupted access to our wholesale catalog and fulfillment services.</p>
    <a href="#" class="btn">Renew Subscription</a>
    <p style="margin-top: 20px; color: #666;">Best regards,<br>Apex Mart Wholesale</p>
  </div>
</div>
</body>
</html>
      `.trim(),
    };

    await this.send(merchant.ownerEmail, template);
  }

  async sendRefundProcessedNotification(merchant: Merchant, order: Order, refundAmount: number): Promise<void> {
    const refundStr = (refundAmount / 100).toFixed(2);

    const template: EmailTemplate = {
      subject: `Refund Processed for Order #${order.orderNumber}`,
      text: `
Hello ${merchant.businessName},

A refund of $${refundStr} has been processed for Order #${order.orderNumber}.

The amount has been credited back to your wallet.

Best regards,
Apex Mart Wholesale
      `.trim(),
      html: `
<!DOCTYPE html>
<html>
<head><style>body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; } .container { max-width: 600px; margin: 0 auto; padding: 20px; } .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; } .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; } .refund-box { background: #dbeafe; padding: 15px; border-radius: 8px; margin: 15px 0; }</style></head>
<body>
<div class="container">
  <div class="header">
    <h1 style="margin: 0;">💵 Refund Processed</h1>
  </div>
  <div class="content">
    <p>Hello ${merchant.businessName},</p>
    <div class="refund-box">
      <strong>Order #${order.orderNumber}</strong><br>
      Refund Amount: <strong style="color: #16a34a;">$${refundStr}</strong><br>
      <small>Amount credited to your wallet</small>
    </div>
    <p style="margin-top: 20px; color: #666;">Best regards,<br>Apex Mart Wholesale</p>
  </div>
</div>
</body>
</html>
      `.trim(),
    };

    await this.send(merchant.ownerEmail, template);
  }
}

export const emailService = new EmailService();
