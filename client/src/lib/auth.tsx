import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { User, Merchant } from "@shared/schema";

type AuthUser = Omit<User, "password"> & { merchant?: Merchant };

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: { email: string; password: string; name: string; businessName: string }) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isAdmin: boolean;
  isMerchant: boolean;
  isStaff: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper to check if we're in Shopify embedded mode
function isShopifyEmbedded(): boolean {
  const urlParams = new URLSearchParams(window.location.search);
  const host = urlParams.get("host");
  if (!host) return false;
  try {
    const decoded = atob(host);
    return decoded.includes("admin.shopify.com") || decoded.includes("myshopify.com");
  } catch {
    return false;
  }
}

// Helper to get Shopify session token from App Bridge
async function getShopifySessionToken(maxRetries = 10): Promise<string | null> {
  for (let i = 0; i < maxRetries; i++) {
    if (window.shopify?.idToken) {
      try {
        const token = await window.shopify.idToken();
        if (token) return token;
      } catch (e) {
        console.log("[Auth] Session token attempt", i + 1, "failed:", e);
      }
    }
    // Wait for App Bridge to initialize
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

// Extend window type for App Bridge
declare global {
  interface Window {
    shopify?: {
      idToken: () => Promise<string>;
      config?: { apiKey: string; host: string };
    };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function initAuth() {
      const urlParams = new URLSearchParams(window.location.search);
      const shop = urlParams.get("shop");
      const host = urlParams.get("host");
      const authCode = urlParams.get("code");
      const isEmbedded = isShopifyEmbedded();
      
      console.log("[Auth] Init:", { isEmbedded, shop, hasHost: !!host, hasCode: !!authCode });
      
      // Method 1: Auth code exchange (from OAuth callback)
      if (authCode && authCode.startsWith("auth_")) {
        console.log("[Auth] Exchanging auth code for token...");
        try {
          const res = await fetch("/api/shopify/exchange-code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: authCode }),
          });
          const data = await res.json();
          
          if (data.success && data.token && data.user) {
            console.log("[Auth] Successfully authenticated via auth code");
            localStorage.setItem("apex_token", data.token);
            localStorage.setItem("apex_user", JSON.stringify(data.user));
            setUser(data.user);
            
            // Clean up URL
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete("code");
            window.history.replaceState({}, "", cleanUrl.toString());
            
            setIsLoading(false);
            return;
          }
          console.error("[Auth] Code exchange failed:", data.error);
        } catch (error) {
          console.error("[Auth] Code exchange error:", error);
        }
      }
      
      // Method 2: Check localStorage for existing session
      const storedUser = localStorage.getItem("apex_user");
      const storedToken = localStorage.getItem("apex_token");
      if (storedUser && storedToken) {
        try {
          setUser(JSON.parse(storedUser));
          setIsLoading(false);
          console.log("[Auth] Restored session from localStorage");
          return;
        } catch {
          localStorage.removeItem("apex_user");
          localStorage.removeItem("apex_token");
        }
      }
      
      // Method 3: Shopify Session Token auth (for embedded mode)
      if (isEmbedded && shop) {
        console.log("[Auth] Attempting Shopify Session Token auth...");
        
        // Wait for App Bridge to be ready
        const sessionToken = await getShopifySessionToken();
        
        if (sessionToken) {
          try {
            const res = await fetch("/api/shopify/session-auth", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionToken, shop }),
            });
            const data = await res.json();
            
            if (data.success && data.token && data.user) {
              console.log("[Auth] Successfully authenticated via Shopify Session Token");
              localStorage.setItem("apex_token", data.token);
              localStorage.setItem("apex_user", JSON.stringify(data.user));
              setUser(data.user);
              setIsLoading(false);
              return;
            }
            console.error("[Auth] Session token auth failed:", data.error);
          } catch (error) {
            console.error("[Auth] Session token auth error:", error);
          }
        } else {
          console.log("[Auth] Could not get Shopify Session Token");
        }
      }
      
      setIsLoading(false);
    }
    
    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        const userData = { ...data.data.user, merchant: data.data.merchant };
        localStorage.setItem("apex_token", data.data.token);
        localStorage.setItem("apex_user", JSON.stringify(userData));
        setUser(userData);
        return { success: true };
      }
      return { success: false, error: data.error || data.message || "Login failed" };
    } catch {
      return { success: false, error: "Network error" };
    }
  };

  const register = async (data: { email: string; password: string; name: string; businessName: string }) => {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.success && result.data) {
        const userData = { ...result.data.user, merchant: result.data.merchant };
        localStorage.setItem("apex_token", result.data.token);
        localStorage.setItem("apex_user", JSON.stringify(userData));
        setUser(userData);
        return { success: true };
      }
      return { success: false, error: result.error || result.message || "Registration failed" };
    } catch {
      return { success: false, error: "Network error" };
    }
  };

  const logout = () => {
    localStorage.removeItem("apex_token");
    localStorage.removeItem("apex_user");
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        register,
        logout,
        isAdmin: user?.role === "admin",
        isMerchant: user?.role === "merchant",
        isStaff: user?.role === "staff",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
