import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface ShopifyEmbeddedContextType {
  isEmbedded: boolean;
  shop: string | null;
  host: string | null;
  isLoading: boolean;
}

const ShopifyEmbeddedContext = createContext<ShopifyEmbeddedContextType>({
  isEmbedded: false,
  shop: null,
  host: null,
  isLoading: true,
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
  const { shop, host } = getShopifyParams();

  useEffect(() => {
    async function initialize() {
      const checkEmbedded = isShopifyEmbedded();
      setEmbedded(checkEmbedded);
      
      if (checkEmbedded && host) {
        console.log("[Shopify] Running in embedded mode");
        await fetchShopifyApiKey();
        initializeAppBridge(host);
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
      }}
    >
      {children}
    </ShopifyEmbeddedContext.Provider>
  );
}

async function initializeAppBridge(host: string) {
  const apiKey = getShopifyApiKey();
  if (!apiKey) {
    console.warn("[Shopify] No API key configured for App Bridge");
    return;
  }

  try {
    const script = document.createElement("script");
    script.src = "https://cdn.shopify.com/shopifycloud/app-bridge.js";
    script.setAttribute("data-api-key", apiKey);
    
    document.head.appendChild(script);
    
    script.onload = () => {
      console.log("[Shopify] App Bridge script loaded");
      if (typeof window !== "undefined" && (window as any).shopify) {
        (window as any).shopify.config = {
          apiKey,
          host,
        };
      }
    };
  } catch (error) {
    console.error("[Shopify] Failed to initialize App Bridge:", error);
  }
}

export function useShopifyNavigation() {
  const { isEmbedded } = useShopifyEmbedded();

  const navigate = (path: string) => {
    if (isEmbedded && typeof window !== "undefined" && (window as any).shopify?.navigate) {
      (window as any).shopify.navigate(path);
    } else {
      window.location.href = path;
    }
  };

  return { navigate };
}

export function useShopifyToast() {
  const { isEmbedded } = useShopifyEmbedded();

  const showToast = (message: string, isError: boolean = false) => {
    if (isEmbedded && typeof window !== "undefined" && (window as any).shopify?.toast) {
      (window as any).shopify.toast.show(message, { isError });
    } else {
      console.log(`[Toast] ${isError ? "Error: " : ""}${message}`);
    }
  };

  return { showToast };
}

export function useShopifyModal() {
  const { isEmbedded } = useShopifyEmbedded();

  const openModal = (title: string, url: string) => {
    if (isEmbedded && typeof window !== "undefined" && (window as any).shopify?.modal) {
      (window as any).shopify.modal.open({
        title,
        url,
      });
    } else {
      window.open(url, "_blank");
    }
  };

  return { openModal };
}

export function useShopifySaveBar() {
  const { isEmbedded } = useShopifyEmbedded();

  const showSaveBar = (onSave: () => void, onDiscard: () => void) => {
    if (isEmbedded && typeof window !== "undefined" && (window as any).shopify?.saveBar) {
      (window as any).shopify.saveBar.show({
        onSave,
        onDiscard,
      });
    }
  };

  const hideSaveBar = () => {
    if (isEmbedded && typeof window !== "undefined" && (window as any).shopify?.saveBar) {
      (window as any).shopify.saveBar.hide();
    }
  };

  return { showSaveBar, hideSaveBar };
}

export function getShopifySessionToken(): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && (window as any).shopify?.idToken) {
      (window as any).shopify.idToken()
        .then((token: string) => resolve(token))
        .catch(() => resolve(null));
    } else {
      resolve(null);
    }
  });
}

export function useSessionToken() {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { isEmbedded } = useShopifyEmbedded();

  useEffect(() => {
    if (isEmbedded) {
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
  }, [isEmbedded]);

  return { token, isLoading };
}
