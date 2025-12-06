import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  MoreHorizontal,
  Edit,
  Trash2,
  ExternalLink,
  ImageOff,
  Loader2,
  Plus,
} from "lucide-react";
import { SiShopify } from "react-icons/si";
import { Link } from "wouter";
import type { Product } from "@shared/schema";

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  draft: "secondary",
  archived: "outline",
};

export default function MyProductsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editPrice, setEditPrice] = useState("");

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ["/api/merchant/products"],
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Product> }) =>
      apiRequest("PUT", `/api/merchant/products/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/products"] });
      toast({ title: "Product updated successfully" });
      setIsEditOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to update product", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/merchant/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/dashboard"] });
      toast({ title: "Product removed successfully" });
    },
    onError: () => {
      toast({ title: "Failed to remove product", variant: "destructive" });
    },
  });

  const pushToShopifyMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/merchant/products/${id}/push-to-shopify`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/products"] });
      toast({ title: "Product pushed to Shopify" });
    },
    onError: () => {
      toast({ title: "Failed to push to Shopify", variant: "destructive" });
    },
  });

  const filteredProducts = products?.filter((p) => {
    const matchesSearch = p.title.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleEdit = (product: Product) => {
    setSelectedProduct(product);
    setEditPrice((product.merchantPrice || product.supplierPrice).toString());
    setIsEditOpen(true);
  };

  const handleSaveEdit = () => {
    if (selectedProduct) {
      updateMutation.mutate({
        id: selectedProduct.id,
        data: { merchantPrice: Number(editPrice) },
      });
    }
  };

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-products-title">My Products</h1>
          <p className="text-muted-foreground">Manage your imported products</p>
        </div>
        <Link href="/dashboard/catalog">
          <Button className="gap-2" data-testid="button-import-more">
            <Plus className="h-4 w-4" />
            Import Products
          </Button>
        </Link>
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
                data-testid="input-search-products"
              />
            </div>
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

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
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
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#95BF47]/10">
                <SiShopify className="h-5 w-5 text-[#95BF47]" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {products?.filter((p) => p.shopifyProductId).length || 0}
                </p>
                <p className="text-xs text-muted-foreground">On Shopify</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Products</CardTitle>
          <CardDescription>Products imported to your account</CardDescription>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Image</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Sell Price</TableHead>
                  <TableHead>Profit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Shopify</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => {
                  const sellPrice = product.merchantPrice || product.supplierPrice * 1.2;
                  const profit = sellPrice - product.supplierPrice;
                  return (
                    <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
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
                        <Link href={`/dashboard/products/${product.id}`}>
                          <div className="cursor-pointer hover-elevate rounded p-1 -m-1">
                            <p className="font-medium line-clamp-1 text-primary hover:underline">{product.title}</p>
                            <p className="text-xs text-muted-foreground">
                              SKU: {product.supplierSku || "N/A"}
                            </p>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>${product.supplierPrice.toFixed(2)}</TableCell>
                      <TableCell className="font-medium">${sellPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-chart-2 font-medium">
                        ${profit.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusColors[product.status || "draft"] || "secondary"}>{product.status || "draft"}</Badge>
                      </TableCell>
                      <TableCell>
                        {product.shopifyProductId ? (
                          <Badge variant="outline" className="gap-1">
                            <SiShopify className="h-3 w-3 text-[#95BF47]" />
                            Synced
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Not synced</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-product-menu-${product.id}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <Link href={`/dashboard/products/${product.id}`}>
                              <DropdownMenuItem>
                                <Package className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                            </Link>
                            <DropdownMenuItem onClick={() => handleEdit(product)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit Price
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => pushToShopifyMutation.mutate(product.id)}
                              disabled={pushToShopifyMutation.isPending}
                            >
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Push to Shopify
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => deleteMutation.mutate(product.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No products yet</h3>
              <p className="mb-4">Import products from the catalog to get started</p>
              <Link href="/dashboard/catalog">
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Browse Catalog
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Price Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Product Price</DialogTitle>
            <DialogDescription>
              Update the selling price for {selectedProduct?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Supplier Cost</Label>
              <p className="text-2xl font-bold">${selectedProduct?.supplierPrice.toFixed(2)}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sellPrice">Selling Price</Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                <Input
                  id="sellPrice"
                  type="number"
                  step="0.01"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  className="pl-7"
                  data-testid="input-sell-price"
                />
              </div>
            </div>
            {selectedProduct && (
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Profit per sale</span>
                  <span className="font-medium text-chart-2">
                    ${(Number(editPrice) - selectedProduct.supplierPrice).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-muted-foreground">Margin</span>
                  <span className="font-medium">
                    {(
                      ((Number(editPrice) - selectedProduct.supplierPrice) / Number(editPrice)) *
                      100
                    ).toFixed(1)}
                    %
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending} data-testid="button-save-price">
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
