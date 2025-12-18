import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { I18nProvider } from "@/lib/i18n";
import { CurrencyProvider } from "@/lib/currency";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin-sidebar";
import { MerchantSidebar } from "@/components/merchant-sidebar";
import { DashboardHeader } from "@/components/dashboard-header";

import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import FeaturesPage from "@/pages/features";
import PricingPage from "@/pages/pricing";
import AboutPage from "@/pages/about";
import BlogPage from "@/pages/blog";
import CareersPage from "@/pages/careers";
import PrivacyPage from "@/pages/privacy";
import TermsPage from "@/pages/terms";
import SecurityPage from "@/pages/security";

import AdminDashboard from "@/pages/admin/dashboard";
import AdminSuppliers from "@/pages/admin/suppliers";
import AdminMerchants from "@/pages/admin/merchants";
import AdminProducts from "@/pages/admin/products";
import AdminProductDetail from "@/pages/admin/product-detail";
import AdminCategories from "@/pages/admin/categories";
import AdminPricingRules from "@/pages/admin/pricing-rules";
import AdminOrders from "@/pages/admin/orders";
import AdminAnalytics from "@/pages/admin/analytics";
import AdminReports from "@/pages/admin/reports";
import AdminPlans from "@/pages/admin/plans";
import AdminNotifications from "@/pages/admin/notifications";
import AdminSettings from "@/pages/admin/settings";

import MerchantDashboard from "@/pages/merchant/dashboard";
import CatalogPage from "@/pages/merchant/catalog";
import MyProductsPage from "@/pages/merchant/products";
import MerchantProductDetail from "@/pages/merchant/product-detail";
import MerchantOrdersPage from "@/pages/merchant/orders";
import CustomersPage from "@/pages/merchant/customers";
import AnalyticsPage from "@/pages/merchant/analytics";
import IntegrationsPage from "@/pages/merchant/integrations";
import SubscriptionPage from "@/pages/merchant/subscription";
import WalletPage from "@/pages/merchant/wallet";
import SettingsPage from "@/pages/merchant/settings";
import ShopifyConnected from "@/pages/shopify-connected";

function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (requireAdmin && user.role !== "admin") {
    return <Redirect to="/dashboard" />;
  }

  if (!requireAdmin && user.role === "admin") {
    return <Redirect to="/admin" />;
  }

  return <>{children}</>;
}

function AdminLayout({ children }: { children: React.ReactNode }) {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AdminSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <DashboardHeader />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function MerchantLayout({ children }: { children: React.ReactNode }) {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex min-h-screen w-full">
        <MerchantSidebar />
        <div className="flex flex-col flex-1 min-w-0 min-h-screen">
          <DashboardHeader />
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function SmartHomePage() {
  const { user, isLoading, embeddedAuthError } = useAuth();
  
  // Check if we're in embedded mode (has shop/host params)
  const urlParams = new URLSearchParams(window.location.search);
  const isEmbedded = urlParams.has("host") || urlParams.has("shop");
  const shop = urlParams.get("shop");
  
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center flex-col gap-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        {isEmbedded && <p className="text-sm text-muted-foreground">Connecting to your store...</p>}
      </div>
    );
  }
  
  // Redirect authenticated users to dashboard
  if (user) {
    if (user.role === "admin") {
      return <Redirect to="/admin" />;
    }
    return <Redirect to="/dashboard" />;
  }
  
  // If embedded but not authenticated, show helpful message
  if (isEmbedded && embeddedAuthError) {
    return (
      <div className="flex h-screen items-center justify-center flex-col gap-4 p-8 text-center">
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg max-w-md">
          <h2 className="font-semibold mb-2">Connection Issue</h2>
          <p className="text-sm mb-4">{embeddedAuthError}</p>
          {shop && (
            <p className="text-xs text-muted-foreground">
              Store: {shop}
            </p>
          )}
        </div>
        <p className="text-sm text-muted-foreground max-w-md">
          If this is your first time using the app, please uninstall and reinstall it from the Shopify App Store.
        </p>
      </div>
    );
  }
  
  // If embedded without error, try refreshing
  if (isEmbedded) {
    return (
      <div className="flex h-screen items-center justify-center flex-col gap-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }
  
  // Show landing page for non-embedded, non-authenticated users
  return <LandingPage />;
}

function Router() {
  return (
    <Switch>
      {/* Public Routes */}
      <Route path="/" component={SmartHomePage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/features" component={FeaturesPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/about" component={AboutPage} />
      <Route path="/blog" component={BlogPage} />
      <Route path="/careers" component={CareersPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/security" component={SecurityPage} />

      {/* Admin Routes */}
      <Route path="/admin">
        <ProtectedRoute requireAdmin>
          <AdminLayout>
            <AdminDashboard />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/suppliers">
        <ProtectedRoute requireAdmin>
          <AdminLayout>
            <AdminSuppliers />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/merchants">
        <ProtectedRoute requireAdmin>
          <AdminLayout>
            <AdminMerchants />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/products">
        <ProtectedRoute requireAdmin>
          <AdminLayout>
            <AdminProducts />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/products/:id">
        <ProtectedRoute requireAdmin>
          <AdminLayout>
            <AdminProductDetail />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/categories">
        <ProtectedRoute requireAdmin>
          <AdminLayout>
            <AdminCategories />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/pricing-rules">
        <ProtectedRoute requireAdmin>
          <AdminLayout>
            <AdminPricingRules />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/orders">
        <ProtectedRoute requireAdmin>
          <AdminLayout>
            <AdminOrders />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/analytics">
        <ProtectedRoute requireAdmin>
          <AdminLayout>
            <AdminAnalytics />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/reports">
        <ProtectedRoute requireAdmin>
          <AdminLayout>
            <AdminReports />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/plans">
        <ProtectedRoute requireAdmin>
          <AdminLayout>
            <AdminPlans />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/notifications">
        <ProtectedRoute requireAdmin>
          <AdminLayout>
            <AdminNotifications />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/settings">
        <ProtectedRoute requireAdmin>
          <AdminLayout>
            <AdminSettings />
          </AdminLayout>
        </ProtectedRoute>
      </Route>

      {/* Merchant Routes */}
      <Route path="/dashboard">
        <ProtectedRoute>
          <MerchantLayout>
            <MerchantDashboard />
          </MerchantLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/catalog">
        <ProtectedRoute>
          <MerchantLayout>
            <CatalogPage />
          </MerchantLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/catalog/:id">
        <ProtectedRoute>
          <MerchantLayout>
            <MerchantProductDetail />
          </MerchantLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/products">
        <ProtectedRoute>
          <MerchantLayout>
            <MyProductsPage />
          </MerchantLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/products/:id">
        <ProtectedRoute>
          <MerchantLayout>
            <MerchantProductDetail />
          </MerchantLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/orders">
        <ProtectedRoute>
          <MerchantLayout>
            <MerchantOrdersPage />
          </MerchantLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/customers">
        <ProtectedRoute>
          <MerchantLayout>
            <CustomersPage />
          </MerchantLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/analytics">
        <ProtectedRoute>
          <MerchantLayout>
            <AnalyticsPage />
          </MerchantLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/integrations">
        <ProtectedRoute>
          <MerchantLayout>
            <IntegrationsPage />
          </MerchantLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/subscription">
        <ProtectedRoute>
          <MerchantLayout>
            <SubscriptionPage />
          </MerchantLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/wallet">
        <ProtectedRoute>
          <MerchantLayout>
            <WalletPage />
          </MerchantLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/settings">
        <ProtectedRoute>
          <MerchantLayout>
            <SettingsPage />
          </MerchantLayout>
        </ProtectedRoute>
      </Route>

      {/* Shopify Auto-Connect Route (no auth required) */}
      <Route path="/shopify-connected" component={ShopifyConnected} />

      {/* Fallback */}
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <CurrencyProvider>
            <AuthProvider>
              <TooltipProvider>
                <Router />
                <Toaster />
              </TooltipProvider>
            </AuthProvider>
          </CurrencyProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
