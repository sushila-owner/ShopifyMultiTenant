import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Package,
  Tag,
  DollarSign,
  Truck,
  BarChart3,
  ImageOff,
} from "lucide-react";
import type { Product } from "@shared/schema";

const formatPrice = (price: number | undefined | null): string => {
  if (price === undefined || price === null) return "0.00";
  return price.toFixed(2);
};

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  draft: "secondary",
  archived: "outline",
};

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export default function MerchantProductDetailPage() {
  const [, params] = useRoute("/dashboard/products/:id");
  const productId = params?.id;

  const { data: productData, isLoading } = useQuery<ApiResponse<Product>>({
    queryKey: ["/api/merchant/products", productId],
    enabled: !!productId,
  });

  const product = productData?.data;

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
          <Link href="/dashboard/products">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to My Products
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const images = product.images as { url: string; alt?: string; position?: number }[] | null;
  const variants = product.variants as { id: string; title: string; price: number; sku: string; inventoryQuantity: number }[] | null;
  const tags = product.tags as string[] | null;

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/products">
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
          <Badge variant={statusColors[product.status || "draft"]} data-testid="badge-status">
            {product.status || "draft"}
          </Badge>
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
                  <p className="text-sm text-muted-foreground mb-1">Your Cost</p>
                  <p className="text-2xl font-bold" data-testid="text-supplier-price">
                    ${formatPrice(product.supplierPrice)}
                  </p>
                </div>
                <div className="rounded-lg border p-4 bg-primary/5">
                  <p className="text-sm text-muted-foreground mb-1">Your Selling Price</p>
                  <p className="text-2xl font-bold text-primary" data-testid="text-retail-price">
                    ${formatPrice(product.merchantPrice || product.supplierPrice)}
                  </p>
                </div>
              </div>
              <div className="rounded-lg border p-4 bg-green-500/10">
                <p className="text-sm text-muted-foreground mb-1">Your Profit Margin</p>
                <p className="text-lg font-medium text-green-600" data-testid="text-profit">
                  ${formatPrice((product.merchantPrice || product.supplierPrice) - product.supplierPrice)} per unit
                </p>
              </div>
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
                <span className="font-medium" data-testid="text-supplier">Wholesale Supplier</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Sync Status</span>
                <Badge variant={product.syncStatus === "synced" ? "default" : "secondary"}>
                  {product.syncStatus}
                </Badge>
              </div>
              {product.importedAt && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Imported On</span>
                    <span className="text-sm">{new Date(product.importedAt).toLocaleDateString()}</span>
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
                <span className="text-muted-foreground">Stock Available</span>
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
            <CardDescription>Available product variations</CardDescription>
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
    </div>
  );
}
