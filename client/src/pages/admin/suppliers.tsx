import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Plus,
  Truck,
  MoreHorizontal,
  RefreshCw,
  Settings,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  ShoppingBag,
} from "lucide-react";
import { SiShopify } from "react-icons/si";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Supplier, SupplierType } from "@shared/schema";

const supplierFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  type: z.enum(["gigab2b", "shopify", "amazon", "woocommerce", "custom"]),
  description: z.string().optional(),
  apiCredentials: z.object({
    storeDomain: z.string().optional(),
    accessToken: z.string().optional(),
    apiKey: z.string().optional(),
    apiSecret: z.string().optional(),
    baseUrl: z.string().optional(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    storeUrl: z.string().optional(),
    consumerKey: z.string().optional(),
    consumerSecret: z.string().optional(),
    apiToken: z.string().optional(),
  }),
  capabilities: z.object({
    readProducts: z.boolean().default(true),
    readInventory: z.boolean().default(true),
    createOrders: z.boolean().default(true),
    readOrders: z.boolean().default(true),
    getTracking: z.boolean().default(true),
  }).optional(),
  config: z.object({
    productSyncEnabled: z.boolean().default(true),
    inventorySyncEnabled: z.boolean().default(true),
    orderFulfillmentEnabled: z.boolean().default(true),
    syncInterval: z.number().min(5).default(60),
  }),
  isActive: z.boolean().default(true),
});

type SupplierFormData = z.infer<typeof supplierFormSchema>;

const supplierTypes: { value: SupplierType; label: string }[] = [
  { value: "gigab2b", label: "GigaB2B" },
  { value: "shopify", label: "Shopify" },
  { value: "amazon", label: "Amazon" },
  { value: "woocommerce", label: "WooCommerce" },
  { value: "custom", label: "Custom API" },
];

interface SyncProgress {
  status: "idle" | "running" | "completed" | "error";
  totalProducts: number;
  fetchedProducts: number;
  savedProducts: number;
  createdProducts: number;
  updatedProducts: number;
  errors: number;
  currentPage: number;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
}

export default function AdminSuppliersPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [shopifyTestResult, setShopifyTestResult] = useState<{ success: boolean; shopName?: string; error?: string } | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [testingConnection, setTestingConnection] = useState<number | null>(null);

  const { data: suppliers, isLoading } = useQuery<Supplier[]>({
    queryKey: ["/api/admin/suppliers"],
  });

  const fetchSyncProgress = useCallback(async () => {
    try {
      const token = localStorage.getItem("apex_token");
      const headers: HeadersInit = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      
      const response = await fetch("/api/admin/shopify/sync/progress", { headers });
      const result = await response.json();
      if (result.success && result.data) {
        setSyncProgress(result.data);
        return result.data;
      }
    } catch (err) {
      console.error("Error fetching sync progress:", err);
    }
    return null;
  }, []);

  useEffect(() => {
    if (!isSyncing) return;
    
    const interval = setInterval(async () => {
      const progress = await fetchSyncProgress();
      if (progress && (progress.status === "completed" || progress.status === "error")) {
        setIsSyncing(false);
        queryClient.invalidateQueries({ queryKey: ["/api/admin/suppliers"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
        
        if (progress.status === "completed") {
          toast({
            title: "Shopify sync complete!",
            description: `Synced ${progress.savedProducts.toLocaleString()} products (${progress.createdProducts.toLocaleString()} new, ${progress.updatedProducts.toLocaleString()} updated, ${progress.errors} errors)`,
          });
        } else {
          toast({
            title: "Sync failed",
            description: progress.errorMessage || "Unknown error",
            variant: "destructive",
          });
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isSyncing, fetchSyncProgress, toast]);

  const form = useForm<SupplierFormData>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: {
      name: "",
      type: "custom",
      description: "",
      apiCredentials: {
        apiKey: "",
        apiSecret: "",
        baseUrl: "",
        accessToken: "",
      },
      config: {
        productSyncEnabled: true,
        inventorySyncEnabled: true,
        orderFulfillmentEnabled: true,
        syncInterval: 60,
      },
      isActive: true,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: SupplierFormData) => apiRequest("POST", "/api/admin/suppliers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suppliers"] });
      toast({ title: "Supplier created successfully" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Failed to create supplier", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<SupplierFormData> }) =>
      apiRequest("PUT", `/api/admin/suppliers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suppliers"] });
      toast({ title: "Supplier updated successfully" });
      setIsDialogOpen(false);
      setEditingSupplier(null);
      form.reset();
    },
    onError: () => {
      toast({ title: "Failed to update supplier", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/suppliers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suppliers"] });
      toast({ title: "Supplier deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete supplier", variant: "destructive" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/admin/suppliers/${id}/sync`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suppliers"] });
      toast({ title: "Sync started successfully" });
    },
    onError: () => {
      toast({ title: "Failed to start sync", variant: "destructive" });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async (id: number) => {
      setTestingConnection(id);
      const response = await apiRequest("POST", `/api/admin/suppliers/${id}/test`);
      return response.json();
    },
    onSuccess: (result) => {
      setTestingConnection(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suppliers"] });
      if (result.success) {
        toast({ title: "Connection successful", description: result.data?.message || "Supplier connected successfully" });
      } else {
        toast({ title: "Connection failed", description: result.data?.message || result.error, variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      setTestingConnection(null);
      toast({ title: "Connection test failed", description: error.message, variant: "destructive" });
    },
  });

  const shopifyTestMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/admin/shopify/test");
      return response.json();
    },
    onSuccess: (result) => {
      if (result.success && result.data?.success) {
        setShopifyTestResult({ success: true, shopName: result.data.shopName });
        toast({ title: "Shopify connection successful", description: `Connected to ${result.data.shopName}` });
      } else {
        setShopifyTestResult({ success: false, error: result.data?.error || result.error });
        toast({ title: "Connection failed", description: result.data?.error || result.error, variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      setShopifyTestResult({ success: false, error: error.message });
      toast({ title: "Connection failed", description: error.message, variant: "destructive" });
    },
  });

  const shopifySyncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/shopify/sync");
      return response.json();
    },
    onSuccess: (result) => {
      if (result.success) {
        setIsSyncing(true);
        setSyncProgress({
          status: "running",
          totalProducts: 0,
          fetchedProducts: 0,
          savedProducts: 0,
          createdProducts: 0,
          updatedProducts: 0,
          errors: 0,
          currentPage: 0,
        });
        toast({ 
          title: "Sync started", 
          description: "Importing products from Shopify. This may take a few minutes for large catalogs." 
        });
      } else {
        toast({ title: "Sync failed", description: result.error, variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: SupplierFormData) => {
    if (editingSupplier) {
      updateMutation.mutate({ id: editingSupplier.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    form.reset({
      name: supplier.name,
      type: supplier.type,
      description: supplier.description || "",
      apiCredentials: supplier.apiCredentials || {},
      config: supplier.config || {},
      isActive: supplier.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setEditingSupplier(null);
      form.reset();
    }
  };

  const hasShopifySupplier = suppliers?.some(s => s.type === "shopify");

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-suppliers-title">Suppliers</h1>
          <p className="text-muted-foreground">Manage product suppliers and integrations</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-add-supplier">
              <Plus className="h-4 w-4" />
              Add Supplier
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingSupplier ? "Edit Supplier" : "Add New Supplier"}</DialogTitle>
              <DialogDescription>
                {editingSupplier
                  ? "Update supplier configuration and credentials"
                  : "Connect a new supplier to sync products"}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Supplier Name</FormLabel>
                        <FormControl>
                          <Input placeholder="My Supplier" data-testid="input-supplier-name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-supplier-type">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {supplierTypes.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Brief description of this supplier..."
                          data-testid="input-supplier-description"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-4">
                  <h4 className="font-medium">API Credentials</h4>
                  {form.watch("type") === "shopify" && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="apiCredentials.storeDomain"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Store Domain</FormLabel>
                            <FormControl>
                              <Input placeholder="your-store.myshopify.com" {...field} />
                            </FormControl>
                            <FormDescription>Your Shopify store domain</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="apiCredentials.accessToken"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Access Token</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="shpat_..." {...field} />
                            </FormControl>
                            <FormDescription>Admin API access token</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                  {form.watch("type") === "gigab2b" && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="apiCredentials.clientId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Client ID</FormLabel>
                            <FormControl>
                              <Input placeholder="Your GigaB2B client ID" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="apiCredentials.clientSecret"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Client Secret</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="Your GigaB2B client secret" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="apiCredentials.baseUrl"
                        render={({ field }) => (
                          <FormItem className="md:col-span-2">
                            <FormLabel>API Base URL</FormLabel>
                            <FormControl>
                              <Input placeholder="https://api.gigab2b.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                  {form.watch("type") === "woocommerce" && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="apiCredentials.storeUrl"
                        render={({ field }) => (
                          <FormItem className="md:col-span-2">
                            <FormLabel>Store URL</FormLabel>
                            <FormControl>
                              <Input placeholder="https://your-store.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="apiCredentials.consumerKey"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Consumer Key</FormLabel>
                            <FormControl>
                              <Input placeholder="ck_..." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="apiCredentials.consumerSecret"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Consumer Secret</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="cs_..." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                  {(form.watch("type") === "custom" || form.watch("type") === "amazon") && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="apiCredentials.baseUrl"
                        render={({ field }) => (
                          <FormItem className="md:col-span-2">
                            <FormLabel>Base URL</FormLabel>
                            <FormControl>
                              <Input placeholder="https://api.supplier.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="apiCredentials.apiKey"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>API Key</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="Enter API key" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="apiCredentials.apiSecret"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>API Secret</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="Enter API secret" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="apiCredentials.apiToken"
                        render={({ field }) => (
                          <FormItem className="md:col-span-2">
                            <FormLabel>API Token (Optional)</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="Bearer token if required" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">Sync Configuration</h4>
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="config.productSyncEnabled"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div>
                            <FormLabel>Product Sync</FormLabel>
                            <FormDescription>Automatically sync products from this supplier</FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="config.inventorySyncEnabled"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div>
                            <FormLabel>Inventory Sync</FormLabel>
                            <FormDescription>Keep inventory levels synchronized</FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="config.orderFulfillmentEnabled"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div>
                            <FormLabel>Order Fulfillment</FormLabel>
                            <FormDescription>Enable automatic order fulfillment</FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <FormLabel>Active</FormLabel>
                        <FormDescription>Enable this supplier for use</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-save-supplier"
                  >
                    {(createMutation.isPending || updateMutation.isPending) && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {editingSupplier ? "Update Supplier" : "Create Supplier"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-[#95BF47] bg-gradient-to-r from-[#95BF47]/5 to-transparent">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#95BF47]/20">
                <SiShopify className="h-7 w-7 text-[#95BF47]" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Shopify Integration
                  {hasShopifySupplier && <Badge variant="default">Connected</Badge>}
                </CardTitle>
                <CardDescription>
                  Import products directly from your Shopify store
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => shopifyTestMutation.mutate()}
                disabled={shopifyTestMutation.isPending || isSyncing}
                data-testid="button-test-shopify"
              >
                {shopifyTestMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 h-4 w-4" />
                )}
                Test Connection
              </Button>
              <Button
                onClick={() => shopifySyncMutation.mutate()}
                disabled={shopifySyncMutation.isPending || isSyncing}
                className="bg-[#95BF47] hover:bg-[#7ea03b] text-white"
                data-testid="button-sync-shopify"
              >
                {(shopifySyncMutation.isPending || isSyncing) ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                {isSyncing ? "Syncing..." : "Sync Products"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isSyncing && syncProgress && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-[#95BF47]" />
                  <span className="font-medium">Syncing products from Shopify...</span>
                </div>
                <Badge variant="outline">Page {syncProgress.currentPage}</Badge>
              </div>
              
              <Progress 
                value={syncProgress.totalProducts > 0 
                  ? (syncProgress.savedProducts / syncProgress.totalProducts) * 100 
                  : 0} 
                className="h-2"
              />
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Total</p>
                  <p className="font-medium">{syncProgress.totalProducts.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Saved</p>
                  <p className="font-medium text-[#95BF47]">{syncProgress.savedProducts.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">New</p>
                  <p className="font-medium text-blue-500">{syncProgress.createdProducts.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Errors</p>
                  <p className={`font-medium ${syncProgress.errors > 0 ? 'text-destructive' : ''}`}>
                    {syncProgress.errors}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {shopifyTestResult && (
            <div className={`rounded-lg p-4 ${shopifyTestResult.success ? 'bg-chart-2/10 border border-chart-2/20' : 'bg-destructive/10 border border-destructive/20'}`}>
              {shopifyTestResult.success ? (
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-chart-2" />
                  <span className="font-medium">Connected to {shopifyTestResult.shopName}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-destructive" />
                  <span className="font-medium">Connection failed: {shopifyTestResult.error}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected Suppliers</CardTitle>
          <CardDescription>All suppliers configured on the platform</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-md" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : suppliers && suppliers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Connection</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((supplier) => (
                  <TableRow key={supplier.id} data-testid={`row-supplier-${supplier.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-md ${supplier.type === 'shopify' ? 'bg-[#95BF47]/20' : 'bg-primary/10'}`}>
                          {supplier.type === 'shopify' ? (
                            <SiShopify className="h-5 w-5 text-[#95BF47]" />
                          ) : (
                            <Truck className="h-5 w-5 text-primary" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{supplier.name}</p>
                          <p className="text-xs text-muted-foreground">{supplier.description}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {supplier.type}
                      </Badge>
                    </TableCell>
                    <TableCell>{(supplier.totalProducts || 0).toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {supplier.connectionStatus === "connected" ? (
                          <>
                            <CheckCircle className="h-4 w-4 text-chart-2" />
                            <span className="text-sm text-chart-2">Connected</span>
                          </>
                        ) : supplier.connectionStatus === "failed" ? (
                          <>
                            <XCircle className="h-4 w-4 text-destructive" />
                            <span className="text-sm text-destructive">Failed</span>
                          </>
                        ) : testingConnection === supplier.id ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm text-muted-foreground">Testing...</span>
                          </>
                        ) : (
                          <>
                            <div className="h-4 w-4 rounded-full border-2 border-muted" />
                            <span className="text-sm text-muted-foreground">Not Tested</span>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={supplier.isActive ? "default" : "secondary"}>
                        {supplier.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-supplier-menu-${supplier.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => testConnectionMutation.mutate(supplier.id)}
                            disabled={testingConnection === supplier.id}
                          >
                            {testingConnection === supplier.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle className="mr-2 h-4 w-4" />
                            )}
                            Test Connection
                          </DropdownMenuItem>
                          {supplier.type === 'shopify' ? (
                            <DropdownMenuItem
                              onClick={() => shopifySyncMutation.mutate()}
                              disabled={shopifySyncMutation.isPending}
                            >
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Sync Products
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => syncMutation.mutate(supplier.id)}
                              disabled={syncMutation.isPending}
                            >
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Sync Products
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleEdit(supplier)}>
                            <Settings className="mr-2 h-4 w-4" />
                            Edit Settings
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => deleteMutation.mutate(supplier.id)}
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
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Truck className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No suppliers configured</h3>
              <p className="mb-4">Add your first supplier to start syncing products</p>
              <Button onClick={() => setIsDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Supplier
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
