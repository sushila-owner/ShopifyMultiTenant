import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  Package,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Store,
  Truck,
  Activity,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { AdminDashboardStats, Merchant, Supplier } from "@shared/schema";

const statsCards = [
  {
    title: "Total Revenue",
    icon: DollarSign,
    key: "totalRevenue" as const,
    format: (v: number) => `$${v.toLocaleString()}`,
    trend: "+12.5%",
    trendUp: true,
  },
  {
    title: "Active Merchants",
    icon: Store,
    key: "activeMerchants" as const,
    format: (v: number) => v.toLocaleString(),
    trend: "+8",
    trendUp: true,
  },
  {
    title: "Total Products",
    icon: Package,
    key: "totalProducts" as const,
    format: (v: number) => v.toLocaleString(),
    trend: "+245",
    trendUp: true,
  },
  {
    title: "Orders Today",
    icon: ShoppingCart,
    key: "ordersToday" as const,
    format: (v: number) => v.toLocaleString(),
    trend: "+18.2%",
    trendUp: true,
  },
];

export default function AdminDashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<AdminDashboardStats>({
    queryKey: ["/api/admin/dashboard"],
  });

  const { data: merchants, isLoading: merchantsLoading } = useQuery<Merchant[]>({
    queryKey: ["/api/admin/merchants"],
  });

  const { data: suppliers, isLoading: suppliersLoading } = useQuery<Supplier[]>({
    queryKey: ["/api/admin/suppliers"],
  });

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-dashboard-title">Dashboard</h1>
          <p className="text-muted-foreground">Platform overview and analytics</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Activity className="h-3 w-3 text-chart-2" />
            All systems operational
          </Badge>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat) => (
          <Card key={stat.title} data-testid={`card-stat-${stat.key}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <>
                  <div className="text-2xl font-bold">
                    {stats ? stat.format(stats[stat.key]) : "—"}
                  </div>
                  <div className={`flex items-center text-xs ${stat.trendUp ? "text-chart-2" : "text-destructive"}`}>
                    {stat.trendUp ? (
                      <TrendingUp className="mr-1 h-3 w-3" />
                    ) : (
                      <TrendingDown className="mr-1 h-3 w-3" />
                    )}
                    <span>{stat.trend} from last month</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Merchants */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Recent Merchants</CardTitle>
              <CardDescription>Latest merchants joined the platform</CardDescription>
            </div>
            <Link href="/admin/merchants">
              <Button variant="ghost" size="sm" className="gap-1" data-testid="button-view-merchants">
                View all
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {merchantsLoading ? (
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
            ) : merchants && merchants.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Business</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Products</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {merchants.slice(0, 5).map((merchant) => (
                    <TableRow key={merchant.id} data-testid={`row-merchant-${merchant.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                            <Store className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{merchant.businessName}</p>
                            <p className="text-xs text-muted-foreground">{merchant.ownerEmail}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={merchant.subscriptionStatus === "active" ? "default" : "secondary"}
                        >
                          {merchant.subscriptionStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {merchant.currentProductCount}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No merchants yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Suppliers Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Suppliers</CardTitle>
              <CardDescription>Connected supplier status</CardDescription>
            </div>
            <Link href="/admin/suppliers">
              <Button variant="ghost" size="sm" className="gap-1" data-testid="button-view-suppliers">
                View all
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {suppliersLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-md" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            ) : suppliers && suppliers.length > 0 ? (
              <div className="space-y-4">
                {suppliers.slice(0, 5).map((supplier) => (
                  <div
                    key={supplier.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    data-testid={`card-supplier-${supplier.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-background">
                        <Truck className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">{supplier.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{supplier.type}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-medium">{supplier.totalProducts}</p>
                        <p className="text-xs text-muted-foreground">products</p>
                      </div>
                      <Badge variant={supplier.isActive ? "default" : "secondary"}>
                        {supplier.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No suppliers configured</p>
                <Link href="/admin/suppliers">
                  <Button variant="ghost" className="mt-2">
                    Add your first supplier
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
          <CardDescription>Common platform management tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <Link href="/admin/suppliers">
              <Button variant="outline" className="w-full justify-start gap-2 h-auto py-4" data-testid="button-add-supplier">
                <Truck className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <p className="font-medium">Add Supplier</p>
                  <p className="text-xs text-muted-foreground">Connect new supplier</p>
                </div>
              </Button>
            </Link>
            <Link href="/admin/products">
              <Button variant="outline" className="w-full justify-start gap-2 h-auto py-4" data-testid="button-sync-products">
                <Package className="h-5 w-5 text-chart-2" />
                <div className="text-left">
                  <p className="font-medium">Sync Products</p>
                  <p className="text-xs text-muted-foreground">Update product catalog</p>
                </div>
              </Button>
            </Link>
            <Link href="/admin/merchants">
              <Button variant="outline" className="w-full justify-start gap-2 h-auto py-4" data-testid="button-manage-merchants">
                <Store className="h-5 w-5 text-chart-3" />
                <div className="text-left">
                  <p className="font-medium">Merchants</p>
                  <p className="text-xs text-muted-foreground">Manage all merchants</p>
                </div>
              </Button>
            </Link>
            <Link href="/admin/orders">
              <Button variant="outline" className="w-full justify-start gap-2 h-auto py-4" data-testid="button-view-orders">
                <ShoppingCart className="h-5 w-5 text-chart-4" />
                <div className="text-left">
                  <p className="font-medium">Orders</p>
                  <p className="text-xs text-muted-foreground">View all platform orders</p>
                </div>
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
