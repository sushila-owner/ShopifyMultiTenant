import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTranslateProduct, useTranslateBatch } from "@/hooks/useTranslation";
import { useI18n } from "@/lib/i18n";
import {
  ArrowLeft,
  Package,
  DollarSign,
  Truck,
  BarChart3,
  ImageOff,
  Plus,
  TrendingUp,
  Boxes,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  Loader2,
  Check,
  Info,
  Sparkles,
  Shield,
  Clock,
  Zap,
  Languages,
} from "lucide-react";
import type { Product } from "@shared/schema";
import { useCurrency } from "@/lib/currency";

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  draft: "secondary",
  archived: "outline",
};

export default function MerchantProductDetailPage() {
  const { toast } = useToast();
  const { language } = useI18n();
  const { formatPrice } = useCurrency();
  const [, catalogParams] = useRoute("/dashboard/catalog/:id");
  const [, productsParams] = useRoute("/dashboard/products/:id");
  const productId = catalogParams?.id || productsParams?.id;
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  
  useEffect(() => {
    setSelectedImageIndex(0);
    
    // Reset any scroll lock that may be lingering from dialogs
    document.body.style.overflow = '';
    document.body.style.pointerEvents = '';
    document.documentElement.style.overflow = '';
    
    const mainContent = document.querySelector('main');
    if (mainContent) {
      mainContent.scrollTo(0, 0);
    }
    window.scrollTo(0, 0);
    
    // Cleanup function to ensure scroll lock is removed when navigating away
    return () => {
      document.body.style.overflow = '';
      document.body.style.pointerEvents = '';
      document.documentElement.style.overflow = '';
    };
  }, [productId]);
  const [importSettings, setImportSettings] = useState({
    pricingType: "percentage" as "fixed" | "percentage",
    pricingValue: 20,
  });

  const { data: product, isLoading } = useQuery<Product>({
    queryKey: [`/api/merchant/products/${productId}`],
    enabled: !!productId,
  });

  const translated = useTranslateProduct(product ? {
    id: product.id,
    title: product.title,
    description: product.description,
    tags: product.tags as string[] | null,
  } : null);

  const isTranslating = translated.isLoading && language.code !== 'en';

  const importMutation = useMutation({
    mutationFn: async (productIds: number[]) => {
      const response = await apiRequest("POST", "/api/merchant/products/import", {
        productId: productIds[0],
        pricingRule: {
          type: importSettings.pricingType,
          value: importSettings.pricingValue,
        },
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/products"] });
      toast({
        title: "Product Imported",
        description: "Product has been added to your store.",
      });
      setIsImportDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import product",
        variant: "destructive",
      });
    },
  });

  const calculateMerchantPrice = (supplierPrice: number) => {
    if (importSettings.pricingType === "percentage") {
      return supplierPrice * (1 + importSettings.pricingValue / 100);
    }
    return supplierPrice + importSettings.pricingValue;
  };

  const calculateProfit = (supplierPrice: number) => {
    return calculateMerchantPrice(supplierPrice) - supplierPrice;
  };

  if (isLoading) {
    return (
      <div className="p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          <Skeleton className="h-10 w-32 mb-8" />
          <div className="grid gap-8 lg:grid-cols-2">
            <Skeleton className="aspect-square rounded-2xl" />
            <div className="space-y-6">
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-20">
            <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
              <Package className="h-12 w-12 text-muted-foreground" />
            </div>
            <h3 className="text-2xl font-semibold mb-2">Product not found</h3>
            <p className="text-muted-foreground mb-6">This product may have been removed or doesn't exist.</p>
            <Link href="/dashboard/catalog">
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Catalog
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const images = product.images as { url: string; alt?: string; position?: number }[] | null;
  const variants = product.variants as { id: string; title: string; price: number; sku: string; inventoryQuantity: number }[] | null;
  const profit = calculateProfit(product.supplierPrice);
  const profitPercent = ((profit / product.supplierPrice) * 100).toFixed(0);
  const stock = product.inventoryQuantity || 0;

  const nextImage = () => {
    if (images && images.length > 1) {
      setSelectedImageIndex((prev) => (prev + 1) % images.length);
    }
  };

  const prevImage = () => {
    if (images && images.length > 1) {
      setSelectedImageIndex((prev) => (prev - 1 + images.length) % images.length);
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="bg-background pb-8">
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="max-w-md" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              Import to Your Store
            </DialogTitle>
            <DialogDescription>
              Set your markup for this product
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Markup Type</Label>
              <Select
                value={importSettings.pricingType}
                onValueChange={(v) => setImportSettings(prev => ({ ...prev, pricingType: v as "fixed" | "percentage" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage Markup (%)</SelectItem>
                  <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {importSettings.pricingType === "percentage" ? "Markup Percentage" : "Markup Amount"}
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  value={importSettings.pricingValue}
                  onChange={(e) => setImportSettings(prev => ({ ...prev, pricingValue: parseFloat(e.target.value) || 0 }))}
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  {importSettings.pricingType === "percentage" ? "%" : "$"}
                </span>
              </div>
            </div>
            <div className="p-4 bg-muted/50 rounded-xl space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Your Cost</span>
                <span className="font-medium">{formatPrice(product.supplierPrice)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Your Selling Price</span>
                <span className="font-bold text-primary text-lg">
                  {formatPrice(calculateMerchantPrice(product.supplierPrice))}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Your Profit</span>
                <span className="font-medium text-emerald-600">
                  +{formatPrice(calculateProfit(product.supplierPrice))}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => importMutation.mutate([product.id])} 
              disabled={importMutation.isPending}
              className="gap-2"
            >
              {importMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Import to Store
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="border-b bg-muted/30">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <Link href="/dashboard/catalog">
            <Button variant="ghost" size="sm" className="gap-2 -ml-2" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
              Back to Catalog
            </Button>
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="grid grid-cols-1 gap-6 md:gap-8 md:grid-cols-2">
          <div className="space-y-4 min-w-0 w-full">
            <div className="relative w-full max-w-full rounded-2xl bg-white border overflow-hidden">
              <div className="w-full" style={{ aspectRatio: '1 / 1' }}>
                <div className="absolute inset-0 flex items-center justify-center p-2">
                  {images && images.length > 0 ? (
                    <>
                      <img
                        src={images[selectedImageIndex].url}
                        alt={images[selectedImageIndex].alt || product.title}
                        className="max-w-full max-h-full object-contain"
                        data-testid="img-product-main"
                      />
                    {images.length > 1 && (
                      <>
                        <button
                          onClick={prevImage}
                          className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/90 backdrop-blur-sm shadow-lg flex items-center justify-center hover:bg-background transition-colors z-10"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>
                        <button
                          onClick={nextImage}
                          className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/90 backdrop-blur-sm shadow-lg flex items-center justify-center hover:bg-background transition-colors z-10"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </button>
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
                          {images.map((_, idx) => (
                            <button
                              key={idx}
                              onClick={() => setSelectedImageIndex(idx)}
                              className={`h-2 w-2 rounded-full transition-all ${
                                idx === selectedImageIndex ? "bg-primary w-6" : "bg-background/60"
                              }`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="text-center text-muted-foreground">
                    <ImageOff className="h-20 w-20 mx-auto mb-4 opacity-30" />
                    <p>No images available</p>
                  </div>
                )}
              </div>
              </div>
            </div>

            {images && images.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedImageIndex(idx)}
                    className={`h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl border-2 transition-all ${
                      idx === selectedImageIndex 
                        ? "border-primary ring-2 ring-primary/20" 
                        : "border-transparent hover:border-muted-foreground/30"
                    }`}
                  >
                    <img
                      src={img.url}
                      alt={img.alt || `Image ${idx + 1}`}
                      className="h-full w-full object-cover"
                      data-testid={`img-product-thumb-${idx}`}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <h1 className="text-xl sm:text-2xl md:text-3xl font-bold leading-tight break-words" data-testid="text-product-title">
                      {isTranslating ? <Skeleton className="h-8 w-64" /> : translated.title}
                    </h1>
                    {language.code !== 'en' && !isTranslating && (
                      <span title={`Translated to ${language.name}`} className="flex-shrink-0 mt-1">
                        <Languages className="h-5 w-5 text-muted-foreground" />
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2 break-all">
                    SKU: {product.supplierSku || "N/A"}
                  </p>
                </div>
                <Badge 
                  variant={statusColors[product.status || "draft"]} 
                  className="flex-shrink-0 self-start"
                  data-testid="badge-status"
                >
                  {product.status || "draft"}
                </Badge>
              </div>

              {product.category && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Package className="h-4 w-4" />
                  {product.category}
                </div>
              )}
            </div>

            <Card className="border-2">
              <CardContent className="p-6">
                <div className="flex items-baseline gap-3 mb-4">
                  <span className="text-4xl font-bold" data-testid="text-supplier-price">
                    {formatPrice(product.supplierPrice)}
                  </span>
                  <span className="text-muted-foreground">your cost</span>
                </div>

                <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-5 w-5 text-emerald-600" />
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      Profit Potential
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-emerald-600" data-testid="text-profit">
                    +{formatPrice(profit)} per sale
                    <span className="text-base font-normal text-emerald-600/70 ml-2">
                      ({profitPercent}% margin)
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Based on {importSettings.pricingValue}% markup • Selling at {formatPrice(calculateMerchantPrice(product.supplierPrice))}
                  </p>
                </div>

                <Button 
                  size="lg" 
                  className="w-full gap-2 h-12 text-base"
                  onClick={() => setIsImportDialogOpen(true)}
                  data-testid="button-import"
                >
                  <Plus className="h-5 w-5" />
                  Import to My Store
                </Button>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Boxes className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">In Stock</p>
                    <p className={`font-bold ${stock < 10 ? "text-destructive" : stock > 100 ? "text-emerald-600" : ""}`} data-testid="text-inventory">
                      {stock} units
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <Package className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Variants</p>
                    <p className="font-bold">{variants?.length || 1} options</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-3 gap-4 py-4">
              <div className="text-center">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-2">
                  <Truck className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">Fast Shipping</p>
              </div>
              <div className="text-center">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-2">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">Quality Assured</p>
              </div>
              <div className="text-center">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-2">
                  <Zap className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">Auto Fulfill</p>
              </div>
            </div>
          </div>
        </div>

        <Separator className="my-10" />

        <div className="grid gap-6 md:gap-8 md:grid-cols-3">
          {product.description && (
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 flex-wrap">
                  <Info className="h-5 w-5" />
                  Product Description
                  {language.code !== 'en' && !isTranslating && (
                    <Badge variant="outline" className="text-xs gap-1 font-normal">
                      <Languages className="h-3 w-3" />
                      {language.name}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isTranslating ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-5/6" />
                  </div>
                ) : (
                  <div 
                    className="prose prose-sm dark:prose-invert max-w-none [&>*]:break-words"
                    data-testid="text-product-description"
                    dangerouslySetInnerHTML={{ __html: translated.description || product.description }}
                  />
                )}
              </CardContent>
            </Card>
          )}

          <div className="space-y-6">
            {variants && variants.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Package className="h-5 w-5" />
                    Variants ({variants.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {variants.map((variant, idx) => (
                      <div 
                        key={variant.id || idx} 
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                      >
                        <div>
                          <p className="font-medium text-sm">{variant.title || `Variant ${idx + 1}`}</p>
                          <p className="text-xs text-muted-foreground">
                            SKU: {variant.sku || "N/A"} • Stock: {variant.inventoryQuantity || 0}
                          </p>
                        </div>
                        <span className="font-semibold">{formatPrice(variant.price)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-5 w-5" />
                  Supplier Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">Supplier</span>
                  <span className="font-medium text-sm" data-testid="text-supplier">
                    Wholesale Supplier
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">Sync Status</span>
                  <Badge variant={product.syncStatus === "synced" ? "default" : "secondary"}>
                    {product.syncStatus || "pending"}
                  </Badge>
                </div>
                {product.importedAt && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-sm">Last Updated</span>
                      <span className="text-sm">
                        {new Date(product.importedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      </div>
    </ScrollArea>
  );
}
