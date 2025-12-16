import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";

interface ShopifyEmbeddedContextType {
  isEmbedded: boolean;
  shop: string | null;
  host: string | null;
  isLoading: boolean;
  appBridge: ShopifyAppBridge | null;
}

interface ShopifyAppBridge {
  config: { apiKey: string; host: string };
  toast: {
    show: (message: string, options?: { duration?: number; isError?: boolean }) => void;
  };
  modal: {
    open: (options: { title: string; url: string; size?: string }) => void;
  };
  saveBar: {
    show: () => void;
    hide: () => void;
    leaveConfirmation: { disable: () => void; enable: () => void };
  };
  loading: (isLoading: boolean) => void;
  resourcePicker: (options: { type: string; action: string }) => Promise<any>;
}

declare global {
  interface Window {
    shopify?: ShopifyAppBridge & {
      idToken: () => Promise<string>;
      sessionToken?: { get: () => Promise<string> };
    };
  }
}

const ShopifyEmbeddedContext = createContext<ShopifyEmbeddedContextType>({
  isEmbedded: false,
  shop: null,
  host: null,
  isLoading: true,
  appBridge: null,
});

export function useShopifyEmbedded() {
  return useContext(ShopifyEmbeddedContext);
}

function getShopifyParams(): { shop: string | null; host: string | null } {
  if (typeof window === "undefined") {
    return { shop: null, host: null };
  }

  const urlParams = new URLSearchParams(window.location.search);
  const shop = urlParams.get("shop");
  const host = urlParams.get("host");

  return { shop, host };
}

export function isShopifyEmbedded(): boolean {
  const { host } = getShopifyParams();
  if (!host) return false;
  
  try {
    const decoded = atob(host);
    return decoded.includes("admin.shopify.com") || decoded.includes("myshopify.com");
  } catch {
    return false;
  }
}

let cachedApiKey: string | null = null;

export async function fetchShopifyApiKey(): Promise<string> {
  if (cachedApiKey) {
    return cachedApiKey;
  }
  
  try {
    const response = await fetch("/api/shopify/config");
    const data = await response.json();
    if (data.success && data.data?.apiKey) {
      cachedApiKey = data.data.apiKey;
      return cachedApiKey || "";
    }
  } catch (error) {
    console.error("[Shopify] Failed to fetch API key:", error);
  }
  
  return "";
}

export function getShopifyApiKey(): string {
  return cachedApiKey || import.meta.env.VITE_SHOPIFY_API_KEY || "";
}

interface ShopifyProviderProps {
  children: ReactNode;
}

export function ShopifyProvider({ children }: ShopifyProviderProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [embedded, setEmbedded] = useState(false);
  const [appBridge, setAppBridge] = useState<ShopifyAppBridge | null>(null);
  const { shop, host } = getShopifyParams();
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    
    async function initialize() {
      const checkEmbedded = isShopifyEmbedded();
      setEmbedded(checkEmbedded);
      
      if (checkEmbedded && host) {
        console.log("[Shopify] Running in embedded mode");
        const apiKey = await fetchShopifyApiKey();
        
        if (apiKey) {
          const bridge = await initializeAppBridge(apiKey, host);
          setAppBridge(bridge);
        }
      }
      
      setIsLoading(false);
    }
    
    initialize();
  }, [host]);

  return (
    <ShopifyEmbeddedContext.Provider
      value={{
        isEmbedded: embedded,
        shop,
        host,
        isLoading,
        appBridge,
      }}
    >
      {children}
    </ShopifyEmbeddedContext.Provider>
  );
}

function loadAppBridgeScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.shopify) {
      resolve();
      return;
    }
    
    const existingScript = document.querySelector('script[src*="app-bridge.js"]');
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve());
      existingScript.addEventListener("error", () => reject(new Error("Failed to load App Bridge")));
      return;
    }
    
    const script = document.createElement("script");
    script.src = "https://cdn.shopify.com/shopifycloud/app-bridge.js";
    script.async = true;
    
    script.onload = () => {
      console.log("[Shopify] App Bridge script loaded");
      resolve();
    };
    
    script.onerror = () => {
      reject(new Error("Failed to load App Bridge script"));
    };
    
    document.head.appendChild(script);
  });
}

async function initializeAppBridge(apiKey: string, host: string): Promise<ShopifyAppBridge | null> {
  if (!apiKey) {
    console.warn("[Shopify] No API key configured for App Bridge");
    return null;
  }

  try {
    await loadAppBridgeScript();
    
    const maxWaitTime = 5000;
    const checkInterval = 100;
    let elapsed = 0;
    
    while (!window.shopify && elapsed < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      elapsed += checkInterval;
    }
    
    if (!window.shopify) {
      console.error("[Shopify] App Bridge not available after script load");
      return null;
    }
    
    window.shopify.config = { apiKey, host };
    
    console.log("[Shopify] App Bridge initialized with config:", { apiKey: apiKey.slice(0, 8) + "...", host: host.slice(0, 20) + "..." });
    
    return window.shopify as ShopifyAppBridge;
  } catch (error) {
    console.error("[Shopify] Failed to initialize App Bridge:", error);
    return null;
  }
}

export function useShopifyNavigation() {
  const { isEmbedded } = useShopifyEmbedded();

  const navigate = (path: string) => {
    if (isEmbedded) {
      const fullUrl = new URL(path, window.location.origin);
      const { host, shop } = getShopifyParams();
      if (host) fullUrl.searchParams.set("host", host);
      if (shop) fullUrl.searchParams.set("shop", shop);
      
      window.location.href = fullUrl.toString();
    } else {
      window.location.href = path;
    }
  };

  return { navigate };
}

export function useShopifyToast() {
  const { isEmbedded, appBridge } = useShopifyEmbedded();

  const showToast = (message: string, isError: boolean = false) => {
    if (isEmbedded && appBridge?.toast) {
      appBridge.toast.show(message, { isError, duration: 5000 });
    } else {
      console.log(`[Toast] ${isError ? "Error: " : ""}${message}`);
    }
  };

  return { showToast };
}

export function useShopifyModal() {
  const { isEmbedded, appBridge } = useShopifyEmbedded();

  const openModal = (title: string, url: string) => {
    if (isEmbedded && appBridge?.modal) {
      appBridge.modal.open({
        title,
        url,
        size: "large",
      });
    } else {
      window.open(url, "_blank");
    }
  };

  return { openModal };
}

export function useShopifySaveBar() {
  const { isEmbedded, appBridge } = useShopifyEmbedded();

  const showSaveBar = () => {
    if (isEmbedded && appBridge?.saveBar) {
      appBridge.saveBar.show();
    }
  };

  const hideSaveBar = () => {
    if (isEmbedded && appBridge?.saveBar) {
      appBridge.saveBar.hide();
    }
  };

  return { showSaveBar, hideSaveBar };
}

export async function getShopifySessionToken(): Promise<string | null> {
  try {
    if (window.shopify?.idToken) {
      return await window.shopify.idToken();
    }
    
    if (window.shopify?.sessionToken?.get) {
      return await window.shopify.sessionToken.get();
    }
    
    return null;
  } catch (error) {
    console.error("[Shopify] Failed to get session token:", error);
    return null;
  }
}

export function useSessionToken() {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { isEmbedded, appBridge } = useShopifyEmbedded();

  useEffect(() => {
    if (isEmbedded && appBridge) {
      getShopifySessionToken()
        .then((t) => {
          setToken(t);
          setIsLoading(false);
        })
        .catch(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, [isEmbedded, appBridge]);

  return { token, isLoading };
}

export function useShopifyLoading() {
  const { isEmbedded, appBridge } = useShopifyEmbedded();

  const setLoading = (loading: boolean) => {
    if (isEmbedded && appBridge?.loading) {
      appBridge.loading(loading);
    }
  };

  return { setLoading };
}
