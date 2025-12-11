import { storage } from "../storage";

export interface WebhookSubscription {
  id: number;
  merchantId: number;
  url: string;
  events: string[];
  secret: string;
  isActive: boolean;
  createdAt: Date;
  lastTriggeredAt?: Date;
  failureCount: number;
}

export interface WebhookEvent {
  type: string;
  merchantId: number;
  payload: any;
  timestamp: Date;
}

export type WebhookEventType = 
  | "order.created"
  | "order.updated"
  | "order.fulfilled"
  | "order.cancelled"
  | "inventory.low"
  | "inventory.updated"
  | "product.created"
  | "product.updated"
  | "product.deleted"
  | "wallet.credited"
  | "wallet.debited"
  | "subscription.changed";

class WebhookService {
  private subscriptions: Map<number, WebhookSubscription> = new Map();
  private eventLog: WebhookEvent[] = [];
  private nextId = 1;

  async getSubscriptions(merchantId: number): Promise<WebhookSubscription[]> {
    return Array.from(this.subscriptions.values()).filter(s => s.merchantId === merchantId);
  }

  async createSubscription(merchantId: number, data: {
    url: string;
    events: string[];
  }): Promise<WebhookSubscription> {
    const secret = this.generateSecret();
    const subscription: WebhookSubscription = {
      id: this.nextId++,
      merchantId,
      url: data.url,
      events: data.events,
      secret,
      isActive: true,
      createdAt: new Date(),
      failureCount: 0,
    };
    
    this.subscriptions.set(subscription.id, subscription);
    console.log(`[Webhook] Created subscription ${subscription.id} for merchant ${merchantId}`);
    return subscription;
  }

  async updateSubscription(id: number, merchantId: number, updates: Partial<{
    url: string;
    events: string[];
    isActive: boolean;
  }>): Promise<WebhookSubscription | null> {
    const subscription = this.subscriptions.get(id);
    if (!subscription || subscription.merchantId !== merchantId) {
      return null;
    }

    const updated = { ...subscription, ...updates };
    this.subscriptions.set(id, updated);
    return updated;
  }

  async deleteSubscription(id: number, merchantId: number): Promise<boolean> {
    const subscription = this.subscriptions.get(id);
    if (!subscription || subscription.merchantId !== merchantId) {
      return false;
    }
    
    this.subscriptions.delete(id);
    return true;
  }

  async triggerEvent(event: WebhookEventType, merchantId: number, payload: any): Promise<void> {
    this.eventLog.push({
      type: event,
      merchantId,
      payload,
      timestamp: new Date(),
    });

    const subscriptions = await this.getSubscriptions(merchantId);
    const relevantSubscriptions = subscriptions.filter(
      s => s.isActive && s.events.includes(event)
    );

    for (const subscription of relevantSubscriptions) {
      this.sendWebhook(subscription, event, payload).catch(error => {
        console.error(`[Webhook] Failed to send to ${subscription.url}:`, error.message);
      });
    }
  }

  private async sendWebhook(subscription: WebhookSubscription, event: string, payload: any): Promise<void> {
    const timestamp = Date.now();
    const signature = this.generateSignature(subscription.secret, timestamp, payload);

    try {
      const response = await fetch(subscription.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Event": event,
          "X-Webhook-Timestamp": timestamp.toString(),
          "X-Webhook-Signature": signature,
        },
        body: JSON.stringify({
          event,
          timestamp: new Date().toISOString(),
          payload,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      subscription.lastTriggeredAt = new Date();
      subscription.failureCount = 0;
      this.subscriptions.set(subscription.id, subscription);
      
      console.log(`[Webhook] Sent ${event} to ${subscription.url}`);
    } catch (error: any) {
      subscription.failureCount++;
      this.subscriptions.set(subscription.id, subscription);

      if (subscription.failureCount >= 10) {
        subscription.isActive = false;
        this.subscriptions.set(subscription.id, subscription);
        console.log(`[Webhook] Disabled subscription ${subscription.id} after 10 failures`);
      }
      
      throw error;
    }
  }

  async testWebhook(id: number, merchantId: number): Promise<{ success: boolean; message: string }> {
    const subscription = this.subscriptions.get(id);
    if (!subscription || subscription.merchantId !== merchantId) {
      return { success: false, message: "Subscription not found" };
    }

    try {
      await this.sendWebhook(subscription, "test.ping", { message: "Test webhook from Apex Mart" });
      return { success: true, message: "Webhook test successful" };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  async getEventLog(merchantId: number, limit: number = 50): Promise<WebhookEvent[]> {
    return this.eventLog
      .filter(e => e.merchantId === merchantId)
      .slice(-limit)
      .reverse();
  }

  private generateSecret(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "whsec_";
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private generateSignature(secret: string, timestamp: number, payload: any): string {
    const crypto = require("crypto");
    const data = `${timestamp}.${JSON.stringify(payload)}`;
    return crypto.createHmac("sha256", secret).update(data).digest("hex");
  }
}

export const webhookService = new WebhookService();
