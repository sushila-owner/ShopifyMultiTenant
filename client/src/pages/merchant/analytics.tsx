import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Package,
  Users,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useCurrency } from "@/lib/currency";

interface AnalyticsData {
  overview: {
    totalRevenue: number;
    totalProfit: number;
    totalOrders: number;
    conversionRate: number;
    revenueChange: number;
    profitChange: number;
    ordersChange: number;
    conversionChange: number;
  };
  revenueByPeriod: Array<{ name: string; revenue: number; profit: number }>;
  ordersByPeriod: Array<{ name: string; orders: number }>;
  topProducts: Array<{
    id: number;
    name: string;
    sales: number;
    revenue: number;
    trend: number;
  }>;
  categoryDistribution: Array<{ name: string; value: number; color: string }>;
  recentOrders: Array<{
    id: number;
    orderNumber: string;
    customer: string;
    total: number;
    status: string;
    createdAt: string;
  }>;
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState("30d");
  const { formatPrice } = useCurrency();

  const { data, isLoading } = useQuery<{ success: boolean; data: AnalyticsData }>({
    queryKey: ["/api/merchant/analytics", period],
  });

  const analytics = data?.data;

  const formatChange = (value: number) => {
    const isPositive = value >= 0;
    return {
      text: `${isPositive ? "+" : ""}${value.toFixed(1)}% from last period`,
      isPositive,
    };
  };

  return (
    <div className="flex-1 space-y-4 sm:space-y-6 p-4 sm:p-6 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold" data-testid="text-analytics-title">Analytics</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Track your store performance</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-full sm:w-[140px]" data-testid="select-period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="1y">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-stat-revenue">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground hidden sm:block" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-xl sm:text-2xl font-bold">
                  {formatPrice(analytics?.overview.totalRevenue || 0)}
                </div>
                {analytics && (
                  <div className={`flex items-center text-xs ${
                    analytics.overview.revenueChange >= 0 ? "text-chart-2" : "text-destructive"
                  }`}>
                    {analytics.overview.revenueChange >= 0 ? (
                      <ArrowUpRight className="mr-1 h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="mr-1 h-3 w-3" />
                    )}
                    <span className="hidden sm:inline">{formatChange(analytics.overview.revenueChange).text}</span>
                    <span className="sm:hidden">{analytics.overview.revenueChange.toFixed(1)}%</span>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-stat-profit">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground hidden sm:block" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-xl sm:text-2xl font-bold text-chart-2">
                  {formatPrice(analytics?.overview.totalProfit || 0)}
                </div>
                {analytics && (
                  <div className={`flex items-center text-xs ${
                    analytics.overview.profitChange >= 0 ? "text-chart-2" : "text-destructive"
                  }`}>
                    {analytics.overview.profitChange >= 0 ? (
                      <ArrowUpRight className="mr-1 h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="mr-1 h-3 w-3" />
                    )}
                    <span className="hidden sm:inline">{formatChange(analytics.overview.profitChange).text}</span>
                    <span className="sm:hidden">{analytics.overview.profitChange.toFixed(1)}%</span>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-stat-orders">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground hidden sm:block" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-xl sm:text-2xl font-bold">
                  {analytics?.overview.totalOrders.toLocaleString() || 0}
                </div>
                {analytics && (
                  <div className={`flex items-center text-xs ${
                    analytics.overview.ordersChange >= 0 ? "text-chart-2" : "text-destructive"
                  }`}>
                    {analytics.overview.ordersChange >= 0 ? (
                      <ArrowUpRight className="mr-1 h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="mr-1 h-3 w-3" />
                    )}
                    <span className="hidden sm:inline">{formatChange(analytics.overview.ordersChange).text}</span>
                    <span className="sm:hidden">{analytics.overview.ordersChange.toFixed(1)}%</span>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-stat-conversion">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Conversion</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground hidden sm:block" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-xl sm:text-2xl font-bold">
                  {analytics?.overview.conversionRate.toFixed(2) || 0}%
                </div>
                {analytics && (
                  <div className={`flex items-center text-xs ${
                    analytics.overview.conversionChange >= 0 ? "text-chart-2" : "text-destructive"
                  }`}>
                    {analytics.overview.conversionChange >= 0 ? (
                      <ArrowUpRight className="mr-1 h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="mr-1 h-3 w-3" />
                    )}
                    <span className="hidden sm:inline">{formatChange(analytics.overview.conversionChange).text}</span>
                    <span className="sm:hidden">{analytics.overview.conversionChange.toFixed(1)}%</span>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="revenue" className="space-y-4">
        <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:inline-flex">
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">Revenue & Profit Overview</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Revenue and profit trends</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px] sm:h-[350px]">
                {isLoading ? (
                  <Skeleton className="h-full w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics?.revenueByPeriod || []}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" className="text-xs" tick={{ fontSize: 10 }} />
                      <YAxis className="text-xs" tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="hsl(var(--chart-1))"
                        fillOpacity={1}
                        fill="url(#colorRevenue)"
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey="profit"
                        stroke="hsl(var(--chart-2))"
                        fillOpacity={1}
                        fill="url(#colorProfit)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">Orders Overview</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Order volume by period</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px] sm:h-[350px]">
                {isLoading ? (
                  <Skeleton className="h-full w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics?.ordersByPeriod || []}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" className="text-xs" tick={{ fontSize: 10 }} />
                      <YAxis className="text-xs" tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                      <Bar dataKey="orders" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <div className="grid gap-4 lg:gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base sm:text-lg">Sales by Category</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Product category distribution</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[200px] sm:h-[300px]">
                  {isLoading ? (
                    <Skeleton className="h-full w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={analytics?.categoryDistribution || []}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={70}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {(analytics?.categoryDistribution || []).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                            fontSize: "12px",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="flex flex-wrap justify-center gap-2 sm:gap-4 mt-4">
                  {(analytics?.categoryDistribution || []).map((cat) => (
                    <div key={cat.name} className="flex items-center gap-1 sm:gap-2">
                      <div
                        className="h-2 w-2 sm:h-3 sm:w-3 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-xs sm:text-sm">{cat.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base sm:text-lg">Top Products</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Best performing products</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 sm:space-y-4">
                  {isLoading ? (
                    Array(5).fill(0).map((_, i) => (
                      <Skeleton key={i} className="h-12 sm:h-16 w-full" />
                    ))
                  ) : (
                    (analytics?.topProducts || []).map((product, i) => (
                      <div
                        key={product.id}
                        className="flex items-center justify-between p-2 sm:p-3 rounded-lg bg-muted/50"
                        data-testid={`row-product-${product.id}`}
                      >
                        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                          <div className="flex h-6 w-6 sm:h-8 sm:w-8 items-center justify-center rounded-md bg-background text-xs sm:text-sm font-medium flex-shrink-0">
                            {i + 1}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-xs sm:text-sm line-clamp-1">{product.name}</p>
                            <p className="text-xs text-muted-foreground">{product.sales} sales</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <p className="font-medium text-xs sm:text-sm">{formatPrice(product.revenue * 100)}</p>
                          <div
                            className={`flex items-center justify-end text-xs ${
                              product.trend > 0 ? "text-chart-2" : "text-destructive"
                            }`}
                          >
                            {product.trend > 0 ? (
                              <ArrowUpRight className="h-3 w-3" />
                            ) : (
                              <ArrowDownRight className="h-3 w-3" />
                            )}
                            {Math.abs(product.trend)}%
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
