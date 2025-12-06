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

import AdminDashboard from "@/pages/admin/dashboard";
import AdminSuppliers from "@/pages/admin/suppliers";
import AdminMerchants from "@/pages/admin/merchants";
import AdminProducts from "@/pages/admin/products";
import AdminProductDetail from "@/pages/admin/product-detail";
import AdminOrders from "@/pages/admin/orders";

import MerchantDashboard from "@/pages/merchant/dashboard";
import CatalogPage from "@/pages/merchant/catalog";
import MyProductsPage from "@/pages/merchant/products";
import MerchantProductDetail from "@/pages/merchant/product-detail";
import MerchantOrdersPage from "@/pages/merchant/orders";
import CustomersPage from "@/pages/merchant/customers";
import AnalyticsPage from "@/pages/merchant/analytics";
import IntegrationsPage from "@/pages/merchant/integrations";
import TeamPage from "@/pages/merchant/team";
import SubscriptionPage from "@/pages/merchant/subscription";
import SettingsPage from "@/pages/merchant/settings";

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
      <div className="flex h-screen w-full">
        <MerchantSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <DashboardHeader />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function Router() {
  return (
    <Switch>
      {/* Public Routes */}
      <Route path="/" component={LandingPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />

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
            <AdminDashboard />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/reports">
        <ProtectedRoute requireAdmin>
          <AdminLayout>
            <AdminDashboard />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/plans">
        <ProtectedRoute requireAdmin>
          <AdminLayout>
            <AdminDashboard />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/notifications">
        <ProtectedRoute requireAdmin>
          <AdminLayout>
            <AdminDashboard />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/settings">
        <ProtectedRoute requireAdmin>
          <AdminLayout>
            <AdminDashboard />
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
      <Route path="/dashboard/team">
        <ProtectedRoute>
          <MerchantLayout>
            <TeamPage />
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
      <Route path="/dashboard/settings">
        <ProtectedRoute>
          <MerchantLayout>
            <SettingsPage />
          </MerchantLayout>
        </ProtectedRoute>
      </Route>

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
