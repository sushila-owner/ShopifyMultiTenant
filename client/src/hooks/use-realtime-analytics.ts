import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export interface AnalyticsEvent {
  type: 'order_created' | 'order_updated' | 'product_imported' | 'inventory_sync' | 'subscription_changed' | 'revenue_update';
  merchantId?: number;
  data: any;
  timestamp: string;
}

interface UseRealtimeAnalyticsOptions {
  onEvent?: (event: AnalyticsEvent) => void;
  autoInvalidate?: boolean;
}

export function useRealtimeAnalytics(options: UseRealtimeAnalyticsOptions = {}) {
  const { onEvent, autoInvalidate = true } = options;
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<AnalyticsEvent | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/analytics`;

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
        setConnectionError(null);
        reconnectAttempts.current = 0;
        console.log('[Analytics] WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const analyticsEvent: AnalyticsEvent = JSON.parse(event.data);
          setLastEvent(analyticsEvent);
          
          if (onEvent) {
            onEvent(analyticsEvent);
          }

          if (autoInvalidate) {
            switch (analyticsEvent.type) {
              case 'order_created':
              case 'order_updated':
                queryClient.invalidateQueries({ queryKey: ['/api/admin/dashboard'] });
                queryClient.invalidateQueries({ queryKey: ['/api/merchant/dashboard'] });
                queryClient.invalidateQueries({ queryKey: ['/api/admin/analytics/trends'] });
                queryClient.invalidateQueries({ queryKey: ['/api/merchant/analytics/revenue'] });
                queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
                break;
              case 'product_imported':
              case 'inventory_sync':
                queryClient.invalidateQueries({ queryKey: ['/api/admin/dashboard'] });
                queryClient.invalidateQueries({ queryKey: ['/api/merchant/dashboard'] });
                queryClient.invalidateQueries({ queryKey: ['/api/admin/products'] });
                queryClient.invalidateQueries({ queryKey: ['/api/merchant/products'] });
                break;
              case 'subscription_changed':
                queryClient.invalidateQueries({ queryKey: ['/api/admin/dashboard'] });
                queryClient.invalidateQueries({ queryKey: ['/api/merchant/subscription'] });
                break;
              case 'revenue_update':
                queryClient.invalidateQueries({ queryKey: ['/api/admin/dashboard'] });
                queryClient.invalidateQueries({ queryKey: ['/api/merchant/dashboard'] });
                queryClient.invalidateQueries({ queryKey: ['/api/admin/analytics/trends'] });
                queryClient.invalidateQueries({ queryKey: ['/api/merchant/analytics/revenue'] });
                break;
            }
          }
        } catch (err) {
          console.error('[Analytics] Failed to parse WebSocket message:', err);
        }
      };

      ws.onerror = (error) => {
        console.error('[Analytics] WebSocket error:', error);
        setConnectionError('Connection error');
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        console.log('[Analytics] WebSocket disconnected');

        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;
          console.log(`[Analytics] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          setConnectionError('Max reconnection attempts reached');
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[Analytics] Failed to create WebSocket:', err);
      setConnectionError('Failed to connect');
    }
  }, [onEvent, autoInvalidate, queryClient]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setIsConnected(false);
    reconnectAttempts.current = 0;
  }, []);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    lastEvent,
    connectionError,
    connect,
    disconnect,
  };
}

export function useRealtimeOrderUpdates(merchantId?: number) {
  const [newOrdersCount, setNewOrdersCount] = useState(0);
  const [latestOrder, setLatestOrder] = useState<any>(null);

  const { isConnected, lastEvent } = useRealtimeAnalytics({
    onEvent: (event) => {
      if (event.type === 'order_created') {
        if (!merchantId || event.merchantId === merchantId) {
          setNewOrdersCount(prev => prev + 1);
          setLatestOrder(event.data);
        }
      }
    }
  });

  const clearNewOrders = useCallback(() => {
    setNewOrdersCount(0);
  }, []);

  return {
    isConnected,
    newOrdersCount,
    latestOrder,
    clearNewOrders,
  };
}

export function useRealtimeInventoryUpdates() {
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncedProductsCount, setSyncedProductsCount] = useState(0);

  const { isConnected, lastEvent } = useRealtimeAnalytics({
    onEvent: (event) => {
      if (event.type === 'inventory_sync') {
        setLastSyncTime(new Date(event.timestamp));
        setSyncedProductsCount(event.data?.count || 0);
      }
    }
  });

  return {
    isConnected,
    lastSyncTime,
    syncedProductsCount,
  };
}
