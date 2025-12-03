import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  Search,
  Package,
  Filter,
  RefreshCw,
  Eye,
  ImageOff,
  Pencil,
  DollarSign,
  Percent,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Product, Supplier } from "@shared/schema";

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  draft: "secondary",
  archived: "outline",
};

type PricingRule = {
  type: "percentage" | "fixed";
  value: number;
};

const formatPrice = (price: number): string => {
  return price.toFixed(2);
};

export default function AdminProductsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [pricingType, setPricingType] = useState<"percentage" | "fixed">("percentage");
  const [pricingValue, setPricingValue] = useState("");

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ["/api/admin/products"],
  });

  const { data: suppliers } = useQuery<Supplier[]>({
    queryKey: ["/api/admin/suppliers"],
  });

  const updatePricingMutation = useMutation({
    mutationFn: async ({ id, pricingRule }: { id: number; pricingRule: PricingRule }) => {
      const response = await apiRequest("PATCH", `/api/admin/products/${id}/pricing`, { pricingRule });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
      toast({ title: "Success", description: "Product pricing updated successfully" });
      setEditingProduct(null);
      setPricingValue("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ productIds, pricingRule }: { productIds: number[]; pricingRule: PricingRule }) => {
      const response = await apiRequest("PATCH", "/api/admin/products/bulk-pricing", { productIds, pricingRule });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
      toast({ title: "Success", description: `Updated pricing for ${data.data?.updated || 0} products` });
      setBulkEditOpen(false);
      setSelectedProducts(new Set());
      setPricingValue("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const filteredProducts = products?.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.category?.toLowerCase().includes(search.toLowerCase());
    const matchesSupplier = supplierFilter === "all" || p.supplierId === supplierFilter;
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesSupplier && matchesStatus;
  });

  const globalProducts = filteredProducts?.filter((p) => p.isGlobal) || [];

  const toggleSelectAll = (productsList: Product[]) => {
    if (productsList.every((p) => selectedProducts.has(p.id))) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(productsList.map((p) => p.id)));
    }
  };

  const toggleSelect = (id: number) => {
    const newSet = new Set(selectedProducts);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedProducts(newSet);
  };

  const handleSingleEdit = () => {
    if (!editingProduct || !pricingValue) return;
    const value = parseFloat(pricingValue);
    if (isNaN(value)) {
      toast({ title: "Error", description: "Please enter a valid number", variant: "destructive" });
      return;
    }
    updatePricingMutation.mutate({
      id: editingProduct.id,
      pricingRule: { type: pricingType, value },
    });
  };

  const handleBulkEdit = () => {
    if (selectedProducts.size === 0 || !pricingValue) return;
    const value = parseFloat(pricingValue);
    if (isNaN(value)) {
      toast({ title: "Error", description: "Please enter a valid number", variant: "destructive" });
      return;
    }
    bulkUpdateMutation.mutate({
      productIds: Array.from(selectedProducts),
      pricingRule: { type: pricingType, value },
    });
  };

  const calculatePreviewPrice = (supplierPrice: number, type: "percentage" | "fixed", value: number) => {
    if (type === "percentage") {
      return supplierPrice * (1 + value / 100);
    }
    return supplierPrice + value;
  };

  const formatPricingRule = (rule: PricingRule | null | undefined) => {
    if (!rule) return "None";
    if (rule.type === "percentage") return `+${rule.value}%`;
    return `+$${rule.value.toFixed(2)}`;
  };

  const renderProductTable = (productsList: Product[], tableId: string) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[40px]">
            <Checkbox
              checked={productsList.length > 0 && productsList.every((p) => selectedProducts.has(p.id))}
              onCheckedChange={() => toggleSelectAll(productsList)}
              data-testid={`checkbox-select-all-${tableId}`}
            />
          </TableHead>
          <TableHead className="w-[80px]">Image</TableHead>
          <TableHead>Product</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Supplier Price</TableHead>
          <TableHead>Markup</TableHead>
          <TableHead>Retail Price</TableHead>
          <TableHead>Inventory</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {productsList.map((product) => (
          <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
            <TableCell>
              <Checkbox
                checked={selectedProducts.has(product.id)}
                onCheckedChange={() => toggleSelect(product.id)}
                data-testid={`checkbox-product-${product.id}`}
              />
            </TableCell>
            <TableCell>
              {product.images && product.images.length > 0 ? (
                <img
                  src={product.images[0].url}
                  alt={product.title}
                  className="h-12 w-12 rounded-md object-cover"
                />
              ) : (
                <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center">
                  <ImageOff className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
            </TableCell>
            <TableCell>
              <div>
                <p className="font-medium line-clamp-1">{product.title}</p>
                <p className="text-xs text-muted-foreground">
                  SKU: {product.supplierSku || "N/A"}
                </p>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="outline">{product.category || "Uncategorized"}</Badge>
            </TableCell>
            <TableCell>${formatPrice(product.supplierPrice)}</TableCell>
            <TableCell>
              <Badge variant="secondary">
                {formatPricingRule(product.pricingRule as PricingRule | null)}
              </Badge>
            </TableCell>
            <TableCell className="font-medium">
              ${formatPrice(product.merchantPrice || product.supplierPrice)}
            </TableCell>
            <TableCell>
              <span
                className={
                  (product.inventory?.quantity || 0) < 10
                    ? "text-destructive font-medium"
                    : ""
                }
              >
                {product.inventory?.quantity || 0}
              </span>
            </TableCell>
            <TableCell>
              <Badge variant={statusColors[product.status]}>
                {product.status}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEditingProduct(product);
                    if (product.pricingRule) {
                      const rule = product.pricingRule as PricingRule;
                      setPricingType(rule.type);
                      setPricingValue(rule.value.toString());
                    } else {
                      setPricingType("percentage");
                      setPricingValue("");
                    }
                  }}
                  data-testid={`button-edit-pricing-${product.id}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Link href={`/admin/products/${product.id}`}>
                  <Button variant="ghost" size="icon" data-testid={`button-view-product-${product.id}`}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
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
          <h1 className="text-3xl font-bold" data-testid="text-products-title">Products</h1>
          <p className="text-muted-foreground">Global product catalog</p>
        </div>
        <Button className="gap-2" data-testid="button-sync-products">
          <RefreshCw className="h-4 w-4" />
          Sync All Products
        </Button>
      </div>

      {selectedProducts.size > 0 && (
        <Card className="border-primary">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium">
                {selectedProducts.size} product{selectedProducts.size > 1 ? "s" : ""} selected
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setSelectedProducts(new Set())}
                  data-testid="button-clear-selection"
                >
                  Clear Selection
                </Button>
                <Button
                  onClick={() => setBulkEditOpen(true)}
                  className="gap-2"
                  data-testid="button-bulk-edit-pricing"
                >
                  <DollarSign className="h-4 w-4" />
                  Bulk Edit Markup
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search products..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search-products"
              />
            </div>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-supplier-filter">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Supplier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Suppliers</SelectItem>
                {suppliers?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{products?.length || 0}</p>
                <p className="text-xs text-muted-foreground">Total Products</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-chart-2/10">
                <Package className="h-5 w-5 text-chart-2" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {products?.filter((p) => p.status === "active").length || 0}
                </p>
                <p className="text-xs text-muted-foreground">Active</p>
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
                  {products?.filter((p) => (p.inventory?.quantity || 0) < 10).length || 0}
                </p>
                <p className="text-xs text-muted-foreground">Low Stock</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-chart-3/10">
                <Package className="h-5 w-5 text-chart-3" />
              </div>
              <div>
                <p className="text-2xl font-bold">{suppliers?.length || 0}</p>
                <p className="text-xs text-muted-foreground">Suppliers</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Product Catalog</CardTitle>
          <CardDescription>All products synced from suppliers</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-16 w-16 rounded-md" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredProducts && filteredProducts.length > 0 ? (
            <Tabs defaultValue="all">
              <TabsList>
                <TabsTrigger value="all">All ({filteredProducts.length})</TabsTrigger>
                <TabsTrigger value="global">Global ({globalProducts.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="all" className="mt-4">
                {renderProductTable(filteredProducts, "all")}
              </TabsContent>
              <TabsContent value="global" className="mt-4">
                {renderProductTable(globalProducts, "global")}
              </TabsContent>
            </Tabs>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No products found</h3>
              <p>Products will appear here once synced from suppliers</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingProduct} onOpenChange={(open) => !open && setEditingProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Product Markup</DialogTitle>
            <DialogDescription>
              Set the pricing markup for {editingProduct?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Supplier Price</Label>
              <p className="text-2xl font-bold">${formatPrice(editingProduct?.supplierPrice || 0)}</p>
            </div>
            <div className="space-y-2">
              <Label>Markup Type</Label>
              <Select value={pricingType} onValueChange={(v) => setPricingType(v as "percentage" | "fixed")}>
                <SelectTrigger data-testid="select-pricing-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">
                    <div className="flex items-center gap-2">
                      <Percent className="h-4 w-4" />
                      Percentage
                    </div>
                  </SelectItem>
                  <SelectItem value="fixed">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Fixed Amount
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Markup Value</Label>
              <div className="relative">
                {pricingType === "fixed" && (
                  <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                )}
                <Input
                  type="number"
                  placeholder={pricingType === "percentage" ? "e.g., 20" : "e.g., 5.00"}
                  value={pricingValue}
                  onChange={(e) => setPricingValue(e.target.value)}
                  className={pricingType === "fixed" ? "pl-8" : ""}
                  data-testid="input-pricing-value"
                />
                {pricingType === "percentage" && (
                  <Percent className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
            {pricingValue && editingProduct && (
              <div className="rounded-lg border p-4 bg-muted/50">
                <Label className="text-muted-foreground text-xs">Preview Retail Price</Label>
                <p className="text-2xl font-bold text-primary" data-testid="text-preview-price">
                  ${formatPrice(calculatePreviewPrice(
                    editingProduct.supplierPrice,
                    pricingType,
                    parseFloat(pricingValue) || 0
                  ))}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingProduct(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSingleEdit}
              disabled={!pricingValue || updatePricingMutation.isPending}
              data-testid="button-save-pricing"
            >
              {updatePricingMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkEditOpen} onOpenChange={setBulkEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Edit Markup</DialogTitle>
            <DialogDescription>
              Apply the same markup to {selectedProducts.size} selected product{selectedProducts.size > 1 ? "s" : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Markup Type</Label>
              <Select value={pricingType} onValueChange={(v) => setPricingType(v as "percentage" | "fixed")}>
                <SelectTrigger data-testid="select-bulk-pricing-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">
                    <div className="flex items-center gap-2">
                      <Percent className="h-4 w-4" />
                      Percentage
                    </div>
                  </SelectItem>
                  <SelectItem value="fixed">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Fixed Amount
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Markup Value</Label>
              <div className="relative">
                {pricingType === "fixed" && (
                  <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                )}
                <Input
                  type="number"
                  placeholder={pricingType === "percentage" ? "e.g., 20" : "e.g., 5.00"}
                  value={pricingValue}
                  onChange={(e) => setPricingValue(e.target.value)}
                  className={pricingType === "fixed" ? "pl-8" : ""}
                  data-testid="input-bulk-pricing-value"
                />
                {pricingType === "percentage" && (
                  <Percent className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
            <div className="rounded-lg border p-4 bg-muted/50">
              <p className="text-sm text-muted-foreground">
                This will apply a{" "}
                <span className="font-medium text-foreground">
                  {pricingType === "percentage" ? `${pricingValue || 0}% markup` : `$${pricingValue || 0} markup`}
                </span>{" "}
                to all {selectedProducts.size} selected products.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleBulkEdit}
              disabled={!pricingValue || bulkUpdateMutation.isPending}
              data-testid="button-apply-bulk-pricing"
            >
              {bulkUpdateMutation.isPending ? "Applying..." : "Apply to All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
