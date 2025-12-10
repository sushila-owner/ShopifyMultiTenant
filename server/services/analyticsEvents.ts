import { WebSocket, WebSocketServer } from 'ws';
import { Server } from 'http';

interface AnalyticsEvent {
  type: 'order_created' | 'order_updated' | 'inventory_sync' | 'product_imported' | 
        'subscription_changed' | 'merchant_created' | 'dashboard_refresh';
  data: any;
  merchantId?: number;
  timestamp: Date;
}

interface ConnectedClient {
  ws: WebSocket;
  userId: number;
  role: 'admin' | 'merchant' | 'staff';
  merchantId?: number;
}

class AnalyticsEventService {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, ConnectedClient> = new Map();

  initialize(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws/analytics' });
    
    this.wss.on('connection', (ws: WebSocket, req) => {
      console.log('[Analytics] New WebSocket connection');
      
      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.type === 'auth') {
            this.clients.set(ws, {
              ws,
              userId: data.userId,
              role: data.role,
              merchantId: data.merchantId
            });
            ws.send(JSON.stringify({ type: 'auth_success', message: 'Connected to analytics stream' }));
            console.log(`[Analytics] Client authenticated: ${data.role} (user ${data.userId})`);
          }
        } catch (err) {
          console.error('[Analytics] Error parsing message:', err);
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log('[Analytics] Client disconnected');
      });

      ws.on('error', (err) => {
        console.error('[Analytics] WebSocket error:', err);
        this.clients.delete(ws);
      });
    });

    console.log('[Analytics] WebSocket server initialized on /ws/analytics');
  }

  emit(event: AnalyticsEvent) {
    if (!this.wss) return;

    const eventPayload = JSON.stringify({
      ...event,
      timestamp: event.timestamp.toISOString()
    });

    this.clients.forEach((client, ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        if (event.type === 'dashboard_refresh' || client.role === 'admin') {
          ws.send(eventPayload);
        } else if (client.merchantId && event.merchantId === client.merchantId) {
          ws.send(eventPayload);
        }
      }
    });
  }

  emitOrderCreated(order: any) {
    this.emit({
      type: 'order_created',
      data: { orderId: order.id, total: order.total, status: order.status },
      merchantId: order.merchantId,
      timestamp: new Date()
    });
  }

  emitOrderUpdated(order: any) {
    this.emit({
      type: 'order_updated',
      data: { orderId: order.id, status: order.status, total: order.total },
      merchantId: order.merchantId,
      timestamp: new Date()
    });
  }

  emitInventorySync(merchantId: number | null, productsUpdated: number) {
    this.emit({
      type: 'inventory_sync',
      data: { productsUpdated },
      merchantId: merchantId || undefined,
      timestamp: new Date()
    });
  }

  emitProductImported(merchantId: number, productCount: number) {
    this.emit({
      type: 'product_imported',
      data: { productCount },
      merchantId,
      timestamp: new Date()
    });
  }

  emitSubscriptionChanged(merchantId: number, planName: string, status: string) {
    this.emit({
      type: 'subscription_changed',
      data: { planName, status },
      merchantId,
      timestamp: new Date()
    });
  }

  emitMerchantCreated(merchant: any) {
    this.emit({
      type: 'merchant_created',
      data: { merchantId: merchant.id, businessName: merchant.businessName },
      timestamp: new Date()
    });
  }

  broadcastDashboardRefresh() {
    this.emit({
      type: 'dashboard_refresh',
      data: { message: 'Dashboard data updated' },
      timestamp: new Date()
    });
  }

  getConnectedClientsCount(): number {
    return this.clients.size;
  }
}

export const analyticsEvents = new AnalyticsEventService();
