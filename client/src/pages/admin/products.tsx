import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
  Settings,
  Tag,
  Trash2,
  Loader2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Product, Supplier, Category } from "@shared/schema";

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

type CatalogResponse = {
  products: Product[];
  suppliers: Supplier[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
};

type CategoriesResponse = {
  success: boolean;
  data: Category[];
};

export default function AdminProductsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [fullEditProduct, setFullEditProduct] = useState<Product | null>(null);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [pricingType, setPricingType] = useState<"percentage" | "fixed">("percentage");
  const [pricingValue, setPricingValue] = useState("");
  const [editFormData, setEditFormData] = useState({
    title: "",
    description: "",
    category: "",
    status: "active" as string,
  });
  const [deleteProductId, setDeleteProductId] = useState<number | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // Delete single product mutation
  const deleteProductMutation = useMutation({
    mutationFn: async (productId: number) => {
      const response = await apiRequest("DELETE", `/api/admin/products/${productId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Product Deleted", description: "Product has been deleted successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
      setDeleteProductId(null);
    },
    onError: (error: any) => {
      toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
    },
  });

  // Bulk delete products mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (productIds: number[]) => {
      const response = await apiRequest("POST", "/api/admin/products/bulk-delete", { productIds });
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Products Deleted", 
        description: `${data.data?.deleted || 0} products deleted successfully.` 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
      setSelectedProducts(new Set());
      setBulkDeleteOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Bulk Delete Failed", description: error.message, variant: "destructive" });
    },
  });

  // Debounce search input
  const searchTimeout = React.useRef<NodeJS.Timeout | null>(null);
  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }
    searchTimeout.current = setTimeout(() => {
      setDebouncedSearch(value);
      setCurrentPage(1); // Reset to first page on search
    }, 300);
  };

  // Fetch categories based on selected supplier
  const { data: categoriesData } = useQuery<CategoriesResponse>({
    queryKey: ["/api/admin/categories", supplierFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (supplierFilter && supplierFilter !== "all") {
        params.append("supplierId", supplierFilter);
      }
      const response = await fetch(`/api/admin/categories?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("apex_token")}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch categories");
      return response.json();
    },
  });

  const categories = categoriesData?.data || [];

  const { data: catalogData, isLoading } = useQuery<CatalogResponse>({
    queryKey: ["/api/admin/products", { page: currentPage, search: debouncedSearch, supplierId: supplierFilter, categoryId: categoryFilter }],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: "50",
      });
      if (debouncedSearch) params.append("search", debouncedSearch);
      if (supplierFilter && supplierFilter !== "all") params.append("supplierId", supplierFilter);
      if (categoryFilter && categoryFilter !== "all") params.append("categoryId", categoryFilter);
      
      const response = await fetch(`/api/admin/products?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("apex_token")}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch products");
      const result = await response.json();
      return result.data;
    },
  });

  const products = catalogData?.products || [];
  const suppliers = catalogData?.suppliers || [];
  const pagination = catalogData?.pagination;

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

  const bulkCategoryMutation = useMutation({
    mutationFn: async ({ categoryId, productIds }: { categoryId: number; productIds: number[] }) => {
      const response = await apiRequest("POST", `/api/admin/categories/${categoryId}/products`, { productIds });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
      toast({ title: "Success", description: `Assigned ${data.data?.updatedCount || 0} products to category` });
      setBulkCategoryOpen(false);
      setSelectedProducts(new Set());
      setSelectedCategoryId("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { title?: string; description?: string; category?: string; status?: string } }) => {
      const response = await apiRequest("PUT", `/api/admin/products/${id}`, data);
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to update product");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
      toast({ title: "Success", description: "Product updated successfully" });
      setFullEditProduct(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update product", variant: "destructive" });
    },
  });

  const openFullEdit = (product: Product) => {
    setFullEditProduct(product);
    setEditFormData({
      title: product.title || "",
      description: product.description || "",
      category: product.category || "",
      status: product.status || "active",
    });
  };

  const handleFullEditSave = () => {
    if (!fullEditProduct) return;
    if (!editFormData.title.trim()) {
      toast({ title: "Error", description: "Title is required", variant: "destructive" });
      return;
    }
    updateProductMutation.mutate({
      id: fullEditProduct.id,
      data: editFormData,
    });
  };

  // Server handles filtering/pagination now
  const globalProducts = products;

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
                  (product.inventoryQuantity || 0) < 10
                    ? "text-destructive font-medium"
                    : ""
                }
              >
                {product.inventoryQuantity || 0}
              </span>
            </TableCell>
            <TableCell>
              <Badge variant={statusColors[product.status || "draft"]}>
                {product.status || "draft"}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openFullEdit(product)}
                  data-testid={`button-edit-product-${product.id}`}
                  title="Edit Product"
                >
                  <Settings className="h-4 w-4" />
                </Button>
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
                  title="Edit Pricing"
                >
                  <DollarSign className="h-4 w-4" />
                </Button>
                <Link href={`/admin/products/${product.id}`}>
                  <Button variant="ghost" size="icon" data-testid={`button-view-product-${product.id}`} title="View Details">
                    <Eye className="h-4 w-4" />
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteProductId(product.id)}
                  data-testid={`button-delete-product-${product.id}`}
                  title="Delete Product"
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
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
                <Button
                  variant="destructive"
                  onClick={() => setBulkDeleteOpen(true)}
                  className="gap-2"
                  data-testid="button-bulk-delete"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Selected
                </Button>
                <Button
                  onClick={() => setBulkCategoryOpen(true)}
                  variant="outline"
                  className="gap-2"
                  data-testid="button-bulk-assign-category"
                >
                  <Tag className="h-4 w-4" />
                  Assign to Category
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
                onChange={(e) => handleSearchChange(e.target.value)}
                data-testid="input-search-products"
              />
            </div>
            <Select value={supplierFilter} onValueChange={(value) => { setSupplierFilter(value); setCategoryFilter("all"); setCurrentPage(1); }}>
              <SelectTrigger className="w-[180px]" data-testid="select-supplier-filter">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Supplier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Suppliers</SelectItem>
                {suppliers?.map((s) => (
                  <SelectItem key={s.id} value={s.id.toString()}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={(value) => { setCategoryFilter(value); setCurrentPage(1); }}>
              <SelectTrigger className="w-[180px]" data-testid="select-category-filter">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>
                    {c.name}
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
                <p className="text-2xl font-bold">{pagination?.total || 0}</p>
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
                  {products.filter((p) => p.status === "active").length}
                </p>
                <p className="text-xs text-muted-foreground">Active (this page)</p>
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
                  {products.filter((p) => (p.inventoryQuantity || 0) < 10).length}
                </p>
                <p className="text-xs text-muted-foreground">Low Stock (this page)</p>
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
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Product Catalog</CardTitle>
            <CardDescription>All products synced from suppliers</CardDescription>
          </div>
          {pagination && (
            <div className="text-sm text-muted-foreground">
              Page {pagination.page} of {pagination.totalPages} ({pagination.total.toLocaleString()} products)
            </div>
          )}
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
          ) : products.length > 0 ? (
            <>
              {renderProductTable(globalProducts, "global")}
              {/* Pagination Controls */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    data-testid="button-first-page"
                  >
                    First
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    data-testid="button-prev-page"
                  >
                    Previous
                  </Button>
                  <span className="px-4 text-sm">
                    Page {currentPage} of {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage >= pagination.totalPages}
                    data-testid="button-next-page"
                  >
                    Next
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(pagination.totalPages)}
                    disabled={currentPage >= pagination.totalPages}
                    data-testid="button-last-page"
                  >
                    Last
                  </Button>
                </div>
              )}
            </>
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

      <Dialog open={bulkCategoryOpen} onOpenChange={setBulkCategoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign to Category</DialogTitle>
            <DialogDescription>
              Assign {selectedProducts.size} selected product{selectedProducts.size > 1 ? "s" : ""} to a category
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Category</Label>
              <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                <SelectTrigger data-testid="select-bulk-category">
                  <SelectValue placeholder="Choose a category..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id.toString()}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border p-4 bg-muted/50">
              <p className="text-sm text-muted-foreground">
                This will assign all {selectedProducts.size} selected products to the{" "}
                <span className="font-medium text-foreground">
                  {categories.find(c => c.id.toString() === selectedCategoryId)?.name || "selected"}
                </span>{" "}
                category.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkCategoryOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedCategoryId) {
                  bulkCategoryMutation.mutate({
                    categoryId: parseInt(selectedCategoryId),
                    productIds: Array.from(selectedProducts),
                  });
                }
              }}
              disabled={!selectedCategoryId || bulkCategoryMutation.isPending}
              data-testid="button-apply-bulk-category"
            >
              {bulkCategoryMutation.isPending ? "Assigning..." : "Assign to Category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!fullEditProduct} onOpenChange={(open) => !open && setFullEditProduct(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>
              Update product details for {fullEditProduct?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              {fullEditProduct?.images && fullEditProduct.images.length > 0 && (
                <div className="col-span-2 flex justify-center">
                  <img
                    src={fullEditProduct.images[0].url}
                    alt={fullEditProduct.title}
                    className="h-32 w-32 rounded-lg object-cover"
                  />
                </div>
              )}
              <div className="col-span-2 space-y-2">
                <Label>Title</Label>
                <Input
                  value={editFormData.title}
                  onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                  data-testid="input-edit-product-title"
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editFormData.description}
                  onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                  rows={4}
                  data-testid="input-edit-product-description"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={editFormData.category || "none"}
                  onValueChange={(value) => setEditFormData({ ...editFormData, category: value === "none" ? "" : value })}
                >
                  <SelectTrigger data-testid="select-edit-product-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Category</SelectItem>
                    {categories
                      .filter((c) => !fullEditProduct?.supplierId || c.supplierId === fullEditProduct.supplierId || !c.supplierId)
                      .map((cat) => (
                        <SelectItem key={cat.id} value={cat.name}>
                          {cat.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Showing categories for this product's supplier
                </p>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={editFormData.status}
                  onValueChange={(value) => setEditFormData({ ...editFormData, status: value })}
                >
                  <SelectTrigger data-testid="select-edit-product-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 rounded-lg border p-4 bg-muted/50">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">SKU:</span>{" "}
                    <span className="font-medium">{fullEditProduct?.supplierSku || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Supplier Price:</span>{" "}
                    <span className="font-medium">${formatPrice(fullEditProduct?.supplierPrice || 0)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Merchant Price:</span>{" "}
                    <span className="font-medium">${formatPrice(fullEditProduct?.merchantPrice || fullEditProduct?.supplierPrice || 0)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Inventory:</span>{" "}
                    <span className="font-medium">{fullEditProduct?.inventoryQuantity || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFullEditProduct(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleFullEditSave}
              disabled={updateProductMutation.isPending}
              data-testid="button-save-product"
            >
              {updateProductMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single Delete Confirmation */}
      <AlertDialog open={deleteProductId !== null} onOpenChange={(open) => !open && setDeleteProductId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this product? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteProductId && deleteProductMutation.mutate(deleteProductId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteProductMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteProductMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedProducts.size} Products</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedProducts.size} selected product{selectedProducts.size > 1 ? "s" : ""}? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate(Array.from(selectedProducts))}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkDeleteMutation.isPending}
              data-testid="button-confirm-bulk-delete"
            >
              {bulkDeleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                `Delete ${selectedProducts.size} Products`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
