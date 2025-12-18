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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function initAuth() {
      // Check for auth code in URL (from Shopify App Store install)
      const urlParams = new URLSearchParams(window.location.search);
      const authCode = urlParams.get("code");
      
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
            console.log("[Auth] Successfully authenticated via Shopify");
            localStorage.setItem("apex_token", data.token);
            localStorage.setItem("apex_user", JSON.stringify(data.user));
            setUser(data.user);
            
            // Clean up URL by removing the code param
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete("code");
            window.history.replaceState({}, "", cleanUrl.toString());
            
            setIsLoading(false);
            return;
          } else {
            console.error("[Auth] Code exchange failed:", data.error);
          }
        } catch (error) {
          console.error("[Auth] Code exchange error:", error);
        }
      }
      
      // Check localStorage for existing session
      const storedUser = localStorage.getItem("apex_user");
      const token = localStorage.getItem("apex_token");
      if (storedUser && token) {
        try {
          setUser(JSON.parse(storedUser));
        } catch {
          localStorage.removeItem("apex_user");
          localStorage.removeItem("apex_token");
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
