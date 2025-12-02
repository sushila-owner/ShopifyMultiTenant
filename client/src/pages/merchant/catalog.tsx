import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Search,
  Package,
  Filter,
  Grid,
  List,
  Plus,
  ImageOff,
  Loader2,
  DollarSign,
} from "lucide-react";
import type { Product, Supplier } from "@shared/schema";

export default function CatalogPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importSettings, setImportSettings] = useState({
    pricingType: "percentage" as "fixed" | "percentage",
    pricingValue: 20,
  });

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ["/api/catalog"],
  });

  const { data: suppliers } = useQuery<Supplier[]>({
    queryKey: ["/api/admin/suppliers"],
  });

  const importMutation = useMutation({
    mutationFn: (data: { productIds: string[]; pricingRule: { type: string; value: number } }) =>
      apiRequest("POST", "/api/products/import", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchants/stats"] });
      toast({ title: "Products imported successfully" });
      setSelectedProducts([]);
      setIsImportDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to import products", variant: "destructive" });
    },
  });

  const filteredProducts = products?.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.category?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === "all" || p.category === categoryFilter;
    return matchesSearch && matchesCategory && p.isGlobal;
  });

  const categories = [...new Set(products?.map((p) => p.category).filter(Boolean))];

  const getSupplierName = (supplierId: string) => {
    return suppliers?.find((s) => s.id === supplierId)?.name || "Unknown";
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProducts((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  };

  const selectAllProducts = () => {
    if (filteredProducts) {
      if (selectedProducts.length === filteredProducts.length) {
        setSelectedProducts([]);
      } else {
        setSelectedProducts(filteredProducts.map((p) => p.id));
      }
    }
  };

  const handleImport = () => {
    importMutation.mutate({
      productIds: selectedProducts,
      pricingRule: importSettings,
    });
  };

  const calculateMerchantPrice = (supplierPrice: number) => {
    if (importSettings.pricingType === "percentage") {
      return supplierPrice * (1 + importSettings.pricingValue / 100);
    }
    return supplierPrice + importSettings.pricingValue;
  };

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-catalog-title">Product Catalog</h1>
          <p className="text-muted-foreground">Browse and import products to your store</p>
        </div>
        {selectedProducts.length > 0 && (
          <Button className="gap-2" onClick={() => setIsImportDialogOpen(true)} data-testid="button-import-selected">
            <Plus className="h-4 w-4" />
            Import {selectedProducts.length} Products
          </Button>
        )}
      </div>

      {/* Filters */}
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
                data-testid="input-search-catalog"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-category-filter">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat!}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex border rounded-md">
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setViewMode("grid")}
                data-testid="button-grid-view"
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setViewMode("list")}
                data-testid="button-list-view"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Products */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Available Products</CardTitle>
            <CardDescription>{filteredProducts?.length || 0} products available</CardDescription>
          </div>
          {filteredProducts && filteredProducts.length > 0 && (
            <Button variant="outline" size="sm" onClick={selectAllProducts}>
              {selectedProducts.length === filteredProducts.length ? "Deselect All" : "Select All"}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className={`grid gap-4 ${viewMode === "grid" ? "md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : ""}`}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className={viewMode === "grid" ? "" : "flex items-center gap-4"}>
                  <Skeleton className={viewMode === "grid" ? "h-48 w-full rounded-md" : "h-16 w-16 rounded-md"} />
                  <div className={`${viewMode === "grid" ? "mt-3" : "flex-1"} space-y-2`}>
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredProducts && filteredProducts.length > 0 ? (
            viewMode === "grid" ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredProducts.map((product) => (
                  <div
                    key={product.id}
                    className={`relative rounded-lg border overflow-hidden hover-elevate cursor-pointer ${
                      selectedProducts.includes(product.id) ? "ring-2 ring-primary" : ""
                    }`}
                    onClick={() => toggleProductSelection(product.id)}
                    data-testid={`card-catalog-product-${product.id}`}
                  >
                    <div className="absolute top-2 left-2 z-10">
                      <Checkbox
                        checked={selectedProducts.includes(product.id)}
                        onCheckedChange={() => toggleProductSelection(product.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="aspect-square bg-muted">
                      {product.images && product.images.length > 0 ? (
                        <img
                          src={product.images[0].url}
                          alt={product.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageOff className="h-12 w-12 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-medium line-clamp-2 mb-1">{product.title}</h3>
                      <p className="text-xs text-muted-foreground mb-2">
                        {getSupplierName(product.supplierId)}
                      </p>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-primary">${product.supplierPrice.toFixed(2)}</p>
                          <p className="text-xs text-muted-foreground">Supplier price</p>
                        </div>
                        <Badge variant="outline">{product.category || "General"}</Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredProducts.map((product) => (
                  <div
                    key={product.id}
                    className={`flex items-center gap-4 p-4 rounded-lg border hover-elevate cursor-pointer ${
                      selectedProducts.includes(product.id) ? "ring-2 ring-primary" : ""
                    }`}
                    onClick={() => toggleProductSelection(product.id)}
                    data-testid={`row-catalog-product-${product.id}`}
                  >
                    <Checkbox
                      checked={selectedProducts.includes(product.id)}
                      onCheckedChange={() => toggleProductSelection(product.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    {product.images && product.images.length > 0 ? (
                      <img
                        src={product.images[0].url}
                        alt={product.title}
                        className="h-16 w-16 rounded-md object-cover"
                      />
                    ) : (
                      <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center">
                        <ImageOff className="h-6 w-6 text-muted-foreground/50" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{product.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {getSupplierName(product.supplierId)} • {product.category || "General"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">${product.supplierPrice.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">
                        {product.inventory?.quantity || 0} in stock
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No products found</h3>
              <p>Check back later for more products from suppliers</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Products</DialogTitle>
            <DialogDescription>
              Set your pricing rules for the {selectedProducts.length} selected products
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <Label>Pricing Rule</Label>
              <Select
                value={importSettings.pricingType}
                onValueChange={(v) =>
                  setImportSettings({ ...importSettings, pricingType: v as "fixed" | "percentage" })
                }
              >
                <SelectTrigger data-testid="select-pricing-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage Markup</SelectItem>
                  <SelectItem value="fixed">Fixed Markup</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-4">
              <Label>
                {importSettings.pricingType === "percentage"
                  ? "Markup Percentage (%)"
                  : "Fixed Markup ($)"}
              </Label>
              <div className="relative">
                {importSettings.pricingType === "fixed" && (
                  <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                )}
                <Input
                  type="number"
                  value={importSettings.pricingValue}
                  onChange={(e) =>
                    setImportSettings({
                      ...importSettings,
                      pricingValue: Number(e.target.value),
                    })
                  }
                  className={importSettings.pricingType === "fixed" ? "pl-8" : ""}
                  data-testid="input-pricing-value"
                />
                {importSettings.pricingType === "percentage" && (
                  <span className="absolute right-2.5 top-2.5 text-muted-foreground">%</span>
                )}
              </div>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm font-medium mb-2">Preview</p>
              <p className="text-xs text-muted-foreground">
                Example: $50.00 supplier price →{" "}
                <span className="font-medium text-foreground">
                  ${calculateMerchantPrice(50).toFixed(2)}
                </span>{" "}
                selling price
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={importMutation.isPending}
              data-testid="button-confirm-import"
            >
              {importMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import Products
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
