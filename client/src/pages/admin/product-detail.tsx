import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  ArrowLeft,
  Package,
  Tag,
  DollarSign,
  Truck,
  BarChart3,
  ImageOff,
  ExternalLink,
  Edit,
  Loader2,
  Save,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Product, Supplier } from "@shared/schema";

const formatPrice = (price: number | undefined | null): string => {
  if (price === undefined || price === null) return "0.00";
  return price.toFixed(2);
};

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  draft: "secondary",
  archived: "outline",
};

export default function AdminProductDetailPage() {
  const { toast } = useToast();
  const [, params] = useRoute("/admin/products/:id");
  const productId = params?.id;

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editData, setEditData] = useState<{
    title: string;
    description: string;
    merchantPrice: string;
    status: "active" | "draft" | "archived";
    category: string;
    lowStockThreshold: string;
  }>({
    title: "",
    description: "",
    merchantPrice: "",
    status: "active",
    category: "",
    lowStockThreshold: "10",
  });

  const { data: product, isLoading } = useQuery<Product>({
    queryKey: ["/api/admin/products", productId],
    queryFn: async () => {
      const response = await fetch(`/api/admin/products/${productId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("apex_token")}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch product");
      const result = await response.json();
      return result.data;
    },
    enabled: !!productId,
  });

  const { data: suppliers } = useQuery<Supplier[]>({
    queryKey: ["/api/admin/suppliers"],
  });

  const supplier = suppliers?.find((s) => s.id === product?.supplierId);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Product>) =>
      apiRequest("PUT", `/api/admin/products/${productId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products", productId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
      toast({ title: "Product updated successfully" });
      setIsEditOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to update product", variant: "destructive" });
    },
  });

  const openEditDialog = () => {
    if (product) {
      const validStatus = product.status === "active" || product.status === "draft" || product.status === "archived" 
        ? product.status 
        : "active";
      setEditData({
        title: product.title || "",
        description: product.description || "",
        merchantPrice: (product.merchantPrice || product.supplierPrice || 0).toString(),
        status: validStatus,
        category: product.category || "",
        lowStockThreshold: (product.lowStockThreshold || 10).toString(),
      });
      setIsEditOpen(true);
    }
  };

  const handleSaveEdit = () => {
    updateMutation.mutate({
      title: editData.title,
      description: editData.description,
      merchantPrice: parseFloat(editData.merchantPrice) || 0,
      status: editData.status,
      category: editData.category,
      lowStockThreshold: parseInt(editData.lowStockThreshold) || 10,
    });
  };

  if (isLoading) {
    return (
      <div className="flex-1 space-y-6 p-6 md:p-8">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-[400px]" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex-1 p-6 md:p-8">
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">Product not found</h3>
          <Link href="/admin/products">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Products
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const pricingRule = product.pricingRule as { type: string; value: number } | null;
  const images = product.images as { url: string; alt?: string; position?: number }[] | null;
  const variants = product.variants as { id: string; title: string; price: number; sku: string; inventoryQuantity: number }[] | null;
  const tags = product.tags as string[] | null;

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/products">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-product-title">{product.title}</h1>
            <p className="text-muted-foreground">
              SKU: {product.supplierSku || "N/A"} | ID: {product.id}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={openEditDialog} className="gap-2" data-testid="button-edit-product">
            <Edit className="h-4 w-4" />
            Edit Product
          </Button>
          <Badge variant={statusColors[product.status || "draft"]} data-testid="badge-status">
            {product.status || "draft"}
          </Badge>
          {product.isGlobal && (
            <Badge variant="outline">Global Catalog</Badge>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Product Images
            </CardTitle>
          </CardHeader>
          <CardContent>
            {images && images.length > 0 ? (
              <div className="space-y-4">
                <div className="aspect-square overflow-hidden rounded-lg border bg-muted">
                  <img
                    src={images[0].url}
                    alt={images[0].alt || product.title}
                    className="h-full w-full object-contain"
                    data-testid="img-product-main"
                  />
                </div>
                {images.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {images.map((img, idx) => (
                      <div
                        key={idx}
                        className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-md border"
                      >
                        <img
                          src={img.url}
                          alt={img.alt || `Image ${idx + 1}`}
                          className="h-full w-full object-cover"
                          data-testid={`img-product-thumb-${idx}`}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="aspect-square flex items-center justify-center rounded-lg border bg-muted">
                <div className="text-center text-muted-foreground">
                  <ImageOff className="h-16 w-16 mx-auto mb-2 opacity-50" />
                  <p>No images available</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Pricing Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground mb-1">Supplier Price</p>
                  <p className="text-2xl font-bold" data-testid="text-supplier-price">
                    ${formatPrice(product.supplierPrice)}
                  </p>
                </div>
                <div className="rounded-lg border p-4 bg-primary/5">
                  <p className="text-sm text-muted-foreground mb-1">Retail Price</p>
                  <p className="text-2xl font-bold text-primary" data-testid="text-retail-price">
                    ${formatPrice(product.merchantPrice || product.supplierPrice)}
                  </p>
                </div>
              </div>
              {pricingRule && (
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground mb-1">Markup Applied</p>
                  <p className="text-lg font-medium" data-testid="text-markup">
                    {pricingRule.type === "percentage"
                      ? `+${pricingRule.value}%`
                      : `+$${pricingRule.value.toFixed(2)}`}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Supplier Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Supplier</span>
                <span className="font-medium" data-testid="text-supplier">{supplier?.name || "Unknown"}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Supplier Product ID</span>
                <span className="font-mono text-sm" data-testid="text-supplier-product-id">{product.supplierProductId || "N/A"}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Sync Status</span>
                <Badge variant={product.syncStatus === "synced" ? "default" : "secondary"}>
                  {product.syncStatus}
                </Badge>
              </div>
              {product.lastSyncedAt && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Last Synced</span>
                    <span className="text-sm">{new Date(product.lastSyncedAt).toLocaleString()}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Inventory
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Stock Quantity</span>
                <span
                  className={`font-medium ${
                    (product.inventoryQuantity || 0) < (product.lowStockThreshold || 10)
                      ? "text-destructive"
                      : ""
                  }`}
                  data-testid="text-inventory"
                >
                  {product.inventoryQuantity || 0} units
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Low Stock Alert</span>
                <span>{product.lowStockThreshold || 10} units</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Track Inventory</span>
                <Badge variant={product.trackInventory ? "default" : "secondary"}>
                  {product.trackInventory ? "Yes" : "No"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            {product.description ? (
              <div
                className="prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: product.description }}
                data-testid="text-description"
              />
            ) : (
              <p className="text-muted-foreground">No description available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Category & Tags
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Category</p>
              <Badge variant="outline" data-testid="text-category">{product.category || "Uncategorized"}</Badge>
            </div>
            {tags && tags.length > 0 && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">Tags</p>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag, idx) => (
                    <Badge key={idx} variant="secondary" data-testid={`badge-tag-${idx}`}>
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {variants && variants.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Variants ({variants.length})</CardTitle>
            <CardDescription>Product variations from supplier</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium">Variant</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">SKU</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Price</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {variants.map((variant, idx) => (
                    <tr key={variant.id || idx} data-testid={`row-variant-${idx}`}>
                      <td className="px-4 py-3 font-medium">{variant.title || "Default"}</td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-sm">{variant.sku || "N/A"}</td>
                      <td className="px-4 py-3">${formatPrice(variant.price)}</td>
                      <td className="px-4 py-3">{variant.inventoryQuantity || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>
              Make changes to the product details. Click save when done.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Product Title</Label>
              <Input
                id="title"
                value={editData.title}
                onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                data-testid="input-edit-title"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={editData.description}
                onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                rows={4}
                data-testid="input-edit-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="merchantPrice">Retail Price ($)</Label>
                <Input
                  id="merchantPrice"
                  type="number"
                  step="0.01"
                  value={editData.merchantPrice}
                  onChange={(e) => setEditData({ ...editData, merchantPrice: e.target.value })}
                  data-testid="input-edit-price"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={editData.status}
                  onValueChange={(value) => setEditData({ ...editData, status: value as "active" | "draft" | "archived" })}
                >
                  <SelectTrigger data-testid="select-edit-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={editData.category}
                  onChange={(e) => setEditData({ ...editData, category: e.target.value })}
                  data-testid="input-edit-category"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lowStockThreshold">Low Stock Alert</Label>
                <Input
                  id="lowStockThreshold"
                  type="number"
                  value={editData.lowStockThreshold}
                  onChange={(e) => setEditData({ ...editData, lowStockThreshold: e.target.value })}
                  data-testid="input-edit-threshold"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending} data-testid="button-save-edit">
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
