import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { User, Merchant } from "@shared/schema";

type AuthUser = Omit<User, "password"> & { merchant?: Merchant };

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: { email: string; password: string; name: string; businessName: string }) => Promise<{ success: boolean; error?: string }>;
  requestPhoneOtp: (phone: string) => Promise<{ success: boolean; error?: string }>;
  verifyPhoneOtp: (phone: string, code: string, name?: string, businessName?: string) => Promise<{ success: boolean; error?: string; isNewUser?: boolean }>;
  loginWithGoogle: (credential: string, name?: string, businessName?: string) => Promise<{ success: boolean; error?: string; isNewUser?: boolean }>;
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

  const requestPhoneOtp = async (phone: string) => {
    try {
      const res = await fetch("/api/auth/phone/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (data.success) {
        return { success: true };
      }
      return { success: false, error: data.error || "Failed to send OTP" };
    } catch {
      return { success: false, error: "Network error" };
    }
  };

  const verifyPhoneOtp = async (phone: string, code: string, name?: string, businessName?: string) => {
    try {
      const res = await fetch("/api/auth/phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, name, businessName }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        const userData = { ...data.data.user, merchant: data.data.merchant };
        localStorage.setItem("apex_token", data.data.token);
        localStorage.setItem("apex_user", JSON.stringify(userData));
        setUser(userData);
        return { success: true, isNewUser: data.data.isNewUser };
      }
      return { success: false, error: data.error || "Verification failed" };
    } catch {
      return { success: false, error: "Network error" };
    }
  };

  const loginWithGoogle = async (credential: string, name?: string, businessName?: string) => {
    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential, name, businessName }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        const userData = { ...data.data.user, merchant: data.data.merchant };
        localStorage.setItem("apex_token", data.data.token);
        localStorage.setItem("apex_user", JSON.stringify(userData));
        setUser(userData);
        return { success: true, isNewUser: data.data.isNewUser };
      }
      return { success: false, error: data.error || "Google login failed" };
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
        requestPhoneOtp,
        verifyPhoneOtp,
        loginWithGoogle,
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
