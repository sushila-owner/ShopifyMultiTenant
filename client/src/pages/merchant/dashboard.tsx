import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Package,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  Users,
  ArrowRight,
  Clock,
  Plug,
  AlertCircle,
} from "lucide-react";
import { SiShopify } from "react-icons/si";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import type { MerchantDashboardStats, Order, Product } from "@shared/schema";

export default function MerchantDashboard() {
  const { user } = useAuth();

  const { data: stats, isLoading: statsLoading } = useQuery<MerchantDashboardStats>({
    queryKey: ["/api/merchant/dashboard"],
  });

  const { data: recentOrders, isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ["/api/merchant/orders"],
  });

  const { data: products, isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/merchant/products"],
  });

  const productUsage = stats ? (stats.currentProductCount / stats.productLimit) * 100 : 0;
  const isShopifyConnected = user?.merchant?.shopifyStore?.isConnected;

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-dashboard-title">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {user?.name?.split(" ")[0] || "Merchant"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isShopifyConnected ? (
            <Badge variant="outline" className="gap-1">
              <SiShopify className="h-3 w-3 text-[#95BF47]" />
              Shopify Connected
            </Badge>
          ) : (
            <Link href="/dashboard/integrations">
              <Button variant="outline" className="gap-2" data-testid="button-connect-shopify">
                <Plug className="h-4 w-4" />
                Connect Shopify
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Subscription Warning */}
      {stats && productUsage > 80 && (
        <Card className="border-chart-4 bg-chart-4/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-chart-4" />
              <div className="flex-1">
                <p className="font-medium">Approaching product limit</p>
                <p className="text-sm text-muted-foreground">
                  You've used {stats.currentProductCount} of {stats.productLimit} products.
                  Upgrade your plan for more.
                </p>
              </div>
              <Link href="/dashboard/subscription">
                <Button size="sm" data-testid="button-upgrade-plan">Upgrade</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-stat-revenue">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  ${stats?.totalRevenue.toLocaleString() || 0}
                </div>
                <div className="flex items-center text-xs text-chart-2">
                  <TrendingUp className="mr-1 h-3 w-3" />
                  <span>${stats?.revenueToday.toLocaleString() || 0} today</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-stat-profit">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold text-chart-2">
                  ${stats?.totalProfit.toLocaleString() || 0}
                </div>
                <div className="flex items-center text-xs text-chart-2">
                  <TrendingUp className="mr-1 h-3 w-3" />
                  <span>${stats?.profitToday.toLocaleString() || 0} today</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-stat-orders">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stats?.totalOrders || 0}</div>
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="text-chart-4">
                    <Clock className="mr-1 h-3 w-3" />
                    {stats?.pendingOrders || 0} pending
                  </Badge>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-stat-customers">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stats?.totalCustomers || 0}</div>
                <div className="text-xs text-muted-foreground">Lifetime customers</div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Product Usage */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Product Usage</CardTitle>
            <CardDescription>
              {stats?.currentProductCount || 0} of {stats?.productLimit || 50} products
            </CardDescription>
          </div>
          <Link href="/dashboard/catalog">
            <Button variant="outline" size="sm" className="gap-1" data-testid="button-browse-catalog">
              Browse Catalog
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <Progress value={productUsage} className="h-3" />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>Used</span>
            <span>{Math.round(productUsage)}%</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Orders */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Recent Orders</CardTitle>
              <CardDescription>Latest orders from your store</CardDescription>
            </div>
            <Link href="/dashboard/orders">
              <Button variant="ghost" size="sm" className="gap-1" data-testid="button-view-orders">
                View all
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {ordersLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentOrders && recentOrders.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentOrders.slice(0, 5).map((order) => (
                    <TableRow key={order.id} data-testid={`row-order-${order.id}`}>
                      <TableCell>
                        <p className="font-medium">{order.orderNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </p>
                      </TableCell>
                      <TableCell>{order.customerEmail}</TableCell>
                      <TableCell>
                        <Badge
                          variant={order.status === "completed" ? "default" : "outline"}
                        >
                          {order.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ${((order.total || 0) / 100).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No orders yet</p>
                <p className="text-sm">Orders will appear here when you receive them</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* My Products */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>My Products</CardTitle>
              <CardDescription>Products in your catalog</CardDescription>
            </div>
            <Link href="/dashboard/products">
              <Button variant="ghost" size="sm" className="gap-1" data-testid="button-view-products">
                View all
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {productsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-12 w-12 rounded-md" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            ) : products && products.length > 0 ? (
              <div className="space-y-4">
                {products.slice(0, 5).map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    data-testid={`card-product-${product.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-background">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium line-clamp-1">{product.title}</p>
                        <p className="text-xs text-muted-foreground">
                          ${product.merchantPrice?.toFixed(2) || product.supplierPrice.toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <Badge variant={product.status === "active" ? "default" : "secondary"}>
                      {product.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No products imported</p>
                <Link href="/dashboard/catalog">
                  <Button variant="ghost" className="mt-2">
                    Browse the catalog
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks to manage your store</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <Link href="/dashboard/catalog">
              <Button variant="outline" className="w-full justify-start gap-2 h-auto py-4" data-testid="button-import-products">
                <Package className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <p className="font-medium">Import Products</p>
                  <p className="text-xs text-muted-foreground">From catalog</p>
                </div>
              </Button>
            </Link>
            <Link href="/dashboard/orders">
              <Button variant="outline" className="w-full justify-start gap-2 h-auto py-4" data-testid="button-manage-orders">
                <ShoppingCart className="h-5 w-5 text-chart-2" />
                <div className="text-left">
                  <p className="font-medium">Manage Orders</p>
                  <p className="text-xs text-muted-foreground">View & fulfill</p>
                </div>
              </Button>
            </Link>
            <Link href="/dashboard/customers">
              <Button variant="outline" className="w-full justify-start gap-2 h-auto py-4" data-testid="button-view-customers">
                <Users className="h-5 w-5 text-chart-3" />
                <div className="text-left">
                  <p className="font-medium">Customers</p>
                  <p className="text-xs text-muted-foreground">View all</p>
                </div>
              </Button>
            </Link>
            <Link href="/dashboard/analytics">
              <Button variant="outline" className="w-full justify-start gap-2 h-auto py-4" data-testid="button-view-analytics">
                <TrendingUp className="h-5 w-5 text-chart-4" />
                <div className="text-left">
                  <p className="font-medium">Analytics</p>
                  <p className="text-xs text-muted-foreground">View reports</p>
                </div>
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
