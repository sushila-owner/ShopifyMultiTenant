import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  ShoppingCart,
  Eye,
  DollarSign,
  Package,
  Clock,
  CheckCircle,
  XCircle,
} from "lucide-react";
import type { Order, Merchant } from "@shared/schema";

const orderStatusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  processing: "secondary",
  completed: "default",
  cancelled: "destructive",
  refunded: "destructive",
};

const fulfillmentStatusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  unfulfilled: "outline",
  partial: "secondary",
  fulfilled: "default",
  cancelled: "destructive",
};

export default function AdminOrdersPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ["/api/admin/orders"],
  });

  const { data: merchants } = useQuery<Merchant[]>({
    queryKey: ["/api/admin/merchants"],
  });

  const getMerchantName = (merchantId: string) => {
    return merchants?.find((m) => m.id === merchantId)?.businessName || "Unknown";
  };

  const filteredOrders = orders?.filter((o) => {
    const matchesSearch =
      o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      o.customerEmail.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pendingOrders = filteredOrders?.filter((o) => o.status === "pending") || [];
  const processingOrders = filteredOrders?.filter((o) => o.status === "processing") || [];

  const totalRevenue = orders?.reduce((acc, o) => acc + (o.total || 0), 0) || 0;
  const totalProfit = orders?.reduce((acc, o) => acc + (o.totalProfit || 0), 0) || 0;

  const handleViewDetails = (order: Order) => {
    setSelectedOrder(order);
    setIsDetailsOpen(true);
  };

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-orders-title">Orders</h1>
          <p className="text-muted-foreground">All platform orders</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                <ShoppingCart className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{orders?.length || 0}</p>
                <p className="text-xs text-muted-foreground">Total Orders</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-chart-4/10">
                <Clock className="h-5 w-5 text-chart-4" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingOrders.length}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-chart-2/10">
                <DollarSign className="h-5 w-5 text-chart-2" />
              </div>
              <div>
                <p className="text-2xl font-bold">${totalRevenue.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Total Revenue</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-chart-3/10">
                <DollarSign className="h-5 w-5 text-chart-3" />
              </div>
              <div>
                <p className="text-2xl font-bold">${totalProfit.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Total Profit</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search orders..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search-orders"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Orders</CardTitle>
          <CardDescription>Orders across all merchants</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-md" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredOrders && filteredOrders.length > 0 ? (
            <Tabs defaultValue="all">
              <TabsList>
                <TabsTrigger value="all">All ({filteredOrders.length})</TabsTrigger>
                <TabsTrigger value="pending">Pending ({pendingOrders.length})</TabsTrigger>
                <TabsTrigger value="processing">Processing ({processingOrders.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="all" className="mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Profit</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Fulfillment</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map((order) => (
                      <TableRow key={order.id} data-testid={`row-order-${order.id}`}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{order.orderNumber}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(order.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{getMerchantName(order.merchantId)}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {order.shippingAddress.firstName} {order.shippingAddress.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground">{order.customerEmail}</p>
                          </div>
                        </TableCell>
                        <TableCell>${((order.total || 0) / 100).toFixed(2)}</TableCell>
                        <TableCell className="text-chart-2">
                          ${((order.totalProfit || 0) / 100).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={orderStatusColors[order.status]}>
                            {order.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={fulfillmentStatusColors[order.fulfillmentStatus]}>
                            {order.fulfillmentStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleViewDetails(order)}
                            data-testid={`button-view-order-${order.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
              <TabsContent value="pending" className="mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{order.orderNumber}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(order.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{getMerchantName(order.merchantId)}</TableCell>
                        <TableCell>{order.customerEmail}</TableCell>
                        <TableCell>${((order.total || 0) / 100).toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">Pending</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => handleViewDetails(order)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
              <TabsContent value="processing" className="mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processingOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{order.orderNumber}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(order.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{getMerchantName(order.merchantId)}</TableCell>
                        <TableCell>{order.customerEmail}</TableCell>
                        <TableCell>${((order.total || 0) / 100).toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">Processing</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => handleViewDetails(order)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingCart className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No orders found</h3>
              <p>Orders will appear here when merchants receive them</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order {selectedOrder?.orderNumber}</DialogTitle>
            <DialogDescription>
              {selectedOrder && new Date(selectedOrder.createdAt).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Customer</h4>
                    <p>
                      {selectedOrder.shippingAddress.firstName} {selectedOrder.shippingAddress.lastName}
                    </p>
                    <p className="text-sm text-muted-foreground">{selectedOrder.customerEmail}</p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Shipping Address</h4>
                    <p className="text-sm">
                      {selectedOrder.shippingAddress.address1}
                      {selectedOrder.shippingAddress.address2 && `, ${selectedOrder.shippingAddress.address2}`}
                      <br />
                      {selectedOrder.shippingAddress.city}, {selectedOrder.shippingAddress.province}{" "}
                      {selectedOrder.shippingAddress.zip}
                      <br />
                      {selectedOrder.shippingAddress.country}
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Order Status:</span>
                    <Badge variant={orderStatusColors[selectedOrder.status]}>
                      {selectedOrder.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Payment:</span>
                    <Badge variant={selectedOrder.paymentStatus === "paid" ? "default" : "outline"}>
                      {selectedOrder.paymentStatus}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Fulfillment:</span>
                    <Badge variant={fulfillmentStatusColors[selectedOrder.fulfillmentStatus]}>
                      {selectedOrder.fulfillmentStatus}
                    </Badge>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-3">Items</h4>
                <div className="space-y-3">
                  {selectedOrder.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-background">
                          <Package className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.variantTitle && `${item.variantTitle} · `}Qty: {item.quantity}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">${(item.price * item.quantity).toFixed(2)}</p>
                        <div className="flex items-center gap-1 text-xs">
                          {item.fulfillmentStatus === "shipped" || item.fulfillmentStatus === "delivered" ? (
                            <CheckCircle className="h-3 w-3 text-chart-2" />
                          ) : (
                            <Clock className="h-3 w-3 text-chart-4" />
                          )}
                          <span className="text-muted-foreground capitalize">{item.fulfillmentStatus}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>${((selectedOrder.subtotal || 0) / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Shipping</span>
                    <span>${((selectedOrder.shippingCost || 0) / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax</span>
                    <span>${((selectedOrder.tax || 0) / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-medium pt-2 border-t">
                    <span>Total</span>
                    <span>${((selectedOrder.total || 0) / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-chart-2">
                    <span>Profit</span>
                    <span>${((selectedOrder.totalProfit || 0) / 100).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
