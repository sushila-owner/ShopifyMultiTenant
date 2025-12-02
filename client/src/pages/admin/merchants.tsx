import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Search,
  Store,
  MoreHorizontal,
  Eye,
  Ban,
  Trash2,
  CheckCircle,
  Users,
  ShoppingCart,
  Package,
  DollarSign,
  Loader2,
} from "lucide-react";
import type { Merchant } from "@shared/schema";

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  trial: "outline",
  active: "default",
  cancelled: "secondary",
  expired: "destructive",
  past_due: "destructive",
};

export default function AdminMerchantsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isSuspendDialogOpen, setIsSuspendDialogOpen] = useState(false);

  const { data: merchants, isLoading } = useQuery<Merchant[]>({
    queryKey: ["/api/admin/merchants"],
  });

  const suspendMutation = useMutation({
    mutationFn: ({ id, suspend }: { id: string; suspend: boolean }) =>
      apiRequest("PATCH", `/api/admin/merchants/${id}`, { isSuspended: suspend }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      toast({ title: "Merchant status updated" });
      setIsSuspendDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to update merchant", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/merchants/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/merchants"] });
      toast({ title: "Merchant deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete merchant", variant: "destructive" });
    },
  });

  const filteredMerchants = merchants?.filter(
    (m) =>
      m.businessName.toLowerCase().includes(search.toLowerCase()) ||
      m.ownerEmail.toLowerCase().includes(search.toLowerCase())
  );

  const activeMerchants = filteredMerchants?.filter((m) => !m.isSuspended) || [];
  const suspendedMerchants = filteredMerchants?.filter((m) => m.isSuspended) || [];

  const handleViewDetails = (merchant: Merchant) => {
    setSelectedMerchant(merchant);
    setIsDetailsOpen(true);
  };

  const handleSuspendClick = (merchant: Merchant) => {
    setSelectedMerchant(merchant);
    setIsSuspendDialogOpen(true);
  };

  const MerchantTable = ({ data }: { data: Merchant[] }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Business</TableHead>
          <TableHead>Subscription</TableHead>
          <TableHead>Products</TableHead>
          <TableHead>Revenue</TableHead>
          <TableHead>Shopify</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((merchant) => (
          <TableRow key={merchant.id} data-testid={`row-merchant-${merchant.id}`}>
            <TableCell>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                  <Store className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{merchant.businessName}</p>
                  <p className="text-xs text-muted-foreground">{merchant.ownerEmail}</p>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={statusColors[merchant.subscriptionStatus]}>
                {merchant.subscriptionStatus}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="text-sm">
                {merchant.currentProductCount} / {merchant.productLimit}
              </div>
            </TableCell>
            <TableCell>
              ${merchant.stats.totalRevenue.toLocaleString()}
            </TableCell>
            <TableCell>
              {merchant.shopifyStore?.isConnected ? (
                <Badge variant="outline" className="gap-1">
                  <CheckCircle className="h-3 w-3 text-chart-2" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="secondary">Not Connected</Badge>
              )}
            </TableCell>
            <TableCell className="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid={`button-merchant-menu-${merchant.id}`}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleViewDetails(merchant)}>
                    <Eye className="mr-2 h-4 w-4" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleSuspendClick(merchant)}>
                    <Ban className="mr-2 h-4 w-4" />
                    {merchant.isSuspended ? "Unsuspend" : "Suspend"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => deleteMutation.mutate(merchant.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-merchants-title">Merchants</h1>
          <p className="text-muted-foreground">Manage platform merchants</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search merchants..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-merchants"
            />
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{merchants?.length || 0}</p>
                <p className="text-xs text-muted-foreground">Total Merchants</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-chart-2/10">
                <CheckCircle className="h-5 w-5 text-chart-2" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {merchants?.filter((m) => m.subscriptionStatus === "active").length || 0}
                </p>
                <p className="text-xs text-muted-foreground">Active Subscriptions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-chart-4/10">
                <Package className="h-5 w-5 text-chart-4" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {merchants?.reduce((acc, m) => acc + m.currentProductCount, 0).toLocaleString() || 0}
                </p>
                <p className="text-xs text-muted-foreground">Total Products</p>
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
                <p className="text-2xl font-bold">
                  ${merchants?.reduce((acc, m) => acc + m.stats.totalRevenue, 0).toLocaleString() || 0}
                </p>
                <p className="text-xs text-muted-foreground">Total Revenue</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Merchants</CardTitle>
          <CardDescription>Platform merchant accounts</CardDescription>
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
          ) : filteredMerchants && filteredMerchants.length > 0 ? (
            <Tabs defaultValue="all">
              <TabsList>
                <TabsTrigger value="all">All ({filteredMerchants.length})</TabsTrigger>
                <TabsTrigger value="active">Active ({activeMerchants.length})</TabsTrigger>
                <TabsTrigger value="suspended">Suspended ({suspendedMerchants.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="all" className="mt-4">
                <MerchantTable data={filteredMerchants} />
              </TabsContent>
              <TabsContent value="active" className="mt-4">
                <MerchantTable data={activeMerchants} />
              </TabsContent>
              <TabsContent value="suspended" className="mt-4">
                <MerchantTable data={suspendedMerchants} />
              </TabsContent>
            </Tabs>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Store className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No merchants found</h3>
              <p>Merchants will appear here once they sign up</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Merchant Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedMerchant?.businessName}</DialogTitle>
            <DialogDescription>Merchant details and statistics</DialogDescription>
          </DialogHeader>
          {selectedMerchant && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Owner Email</p>
                  <p className="font-medium">{selectedMerchant.ownerEmail}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Subscription</p>
                  <Badge variant={statusColors[selectedMerchant.subscriptionStatus]}>
                    {selectedMerchant.subscriptionStatus}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Products</p>
                  <p className="font-medium">
                    {selectedMerchant.currentProductCount} / {selectedMerchant.productLimit}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                  <p className="font-medium">${selectedMerchant.stats.totalRevenue.toLocaleString()}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Total Orders</p>
                  <p className="font-medium">{selectedMerchant.stats.totalOrders.toLocaleString()}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Shopify Store</p>
                  <p className="font-medium">
                    {selectedMerchant.shopifyStore?.domain || "Not connected"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-4 border-t">
                <p className="text-sm text-muted-foreground">Account Status:</p>
                <Badge variant={selectedMerchant.isSuspended ? "destructive" : "default"}>
                  {selectedMerchant.isSuspended ? "Suspended" : "Active"}
                </Badge>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Suspend Confirmation Dialog */}
      <Dialog open={isSuspendDialogOpen} onOpenChange={setIsSuspendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedMerchant?.isSuspended ? "Unsuspend" : "Suspend"} Merchant
            </DialogTitle>
            <DialogDescription>
              {selectedMerchant?.isSuspended
                ? "This will restore the merchant's access to the platform."
                : "This will temporarily disable the merchant's access to the platform."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSuspendDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={selectedMerchant?.isSuspended ? "default" : "destructive"}
              onClick={() =>
                selectedMerchant &&
                suspendMutation.mutate({
                  id: selectedMerchant.id,
                  suspend: !selectedMerchant.isSuspended,
                })
              }
              disabled={suspendMutation.isPending}
            >
              {suspendMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {selectedMerchant?.isSuspended ? "Unsuspend" : "Suspend"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
