import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, keepPreviousData } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Search,
  Package,
  Plus,
  ImageOff,
  Loader2,
  ChevronDown,
  ChevronRight,
  X,
  Store,
  ShoppingCart,
  Filter,
  Home,
  ListChecks,
  ArrowUpDown,
  Eye,
  TrendingUp,
  Boxes,
  Grid3X3,
  LayoutList,
  Sparkles,
  Heart,
  Check,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useCurrency } from "@/lib/currency";
import type { Product, Supplier } from "@shared/schema";

type SortOption = "featured" | "newest" | "price_high" | "price_low" | "stock_high";
type ViewMode = "grid" | "list";

interface FilterState {
  priceRange: [number, number];
  stockMin: number;
  supplierId: number | null;
  inStock: boolean;
  inventoryTier: string;
}

interface PaginationInfo {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface CatalogResponse {
  products: Product[];
  suppliers: Supplier[];
  pagination: PaginationInfo;
}

const PRODUCTS_PER_PAGE = 48;

const INVENTORY_TIERS = [
  { id: "25", label: "25+ in stock" },
  { id: "50", label: "50+ in stock" },
  { id: "100", label: "100+ in stock" },
];

const SORT_OPTIONS = [
  { id: "featured" as SortOption, label: "Featured" },
  { id: "newest" as SortOption, label: "Newest First" },
  { id: "price_low" as SortOption, label: "Price: Low to High" },
  { id: "price_high" as SortOption, label: "Price: High to Low" },
  { id: "stock_high" as SortOption, label: "Most Stock" },
];

interface MerchantSettings {
  id: number;
  settings?: {
    defaultPricingRule?: {
      type: "fixed" | "percentage";
      value: number;
    };
  };
}

export default function CatalogPage() {
  const { toast } = useToast();
  const { formatPrice } = useCurrency();
  const [, navigate] = useLocation();
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>("featured");
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  
  const [filters, setFilters] = useState<FilterState>({
    priceRange: [0, 10000],
    stockMin: 0,
    supplierId: null,
    inStock: false,
    inventoryTier: "",
  });

  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [expandedFilters, setExpandedFilters] = useState({
    supplier: true,
    inventory: true,
    category: true,
  });

  const [importSettings, setImportSettings] = useState({
    pricingType: "percentage" as "fixed" | "percentage",
    pricingValue: 20,
  });

  // Fetch merchant settings to get default pricing rule
  const { data: merchantSettings } = useQuery<{ data: MerchantSettings }>({
    queryKey: ["/api/merchant/settings"],
    queryFn: async () => {
      const token = localStorage.getItem("apex_token");
      const headers: HeadersInit = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const res = await fetch("/api/merchant/settings", {
        credentials: "include",
        headers,
      });
      if (!res.ok) throw new Error("Failed to fetch merchant settings");
      return res.json();
    },
    staleTime: 60000,
  });

  // Update import settings when merchant settings load
  useEffect(() => {
    if (merchantSettings?.data?.settings?.defaultPricingRule && !settingsLoaded) {
      const { type, value } = merchantSettings.data.settings.defaultPricingRule;
      setImportSettings({
        pricingType: type || "percentage",
        pricingValue: value || 20,
      });
      setSettingsLoaded(true);
    }
  }, [merchantSettings, settingsLoaded]);

  // Reset any lingering scroll locks when mounting catalog page
  useEffect(() => {
    document.body.style.overflow = '';
    document.body.style.pointerEvents = '';
    document.documentElement.style.overflow = '';
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data: allSuppliers, isLoading: suppliersLoading } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
    queryFn: async () => {
      const token = localStorage.getItem("apex_token");
      const headers: HeadersInit = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const res = await fetch("/api/suppliers", {
        credentials: "include",
        headers,
      });
      if (!res.ok) throw new Error("Failed to fetch suppliers");
      const data = await res.json();
      return data.data || [];
    },
    staleTime: 60000,
  });

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    params.set("page", currentPage.toString());
    params.set("pageSize", PRODUCTS_PER_PAGE.toString());
    
    if (debouncedSearch) {
      params.set("search", debouncedSearch);
    }
    
    if (selectedSupplier) {
      params.set("supplierId", selectedSupplier.id.toString());
    } else if (filters.supplierId) {
      params.set("supplierId", filters.supplierId.toString());
    }
    
    if (selectedCategory) {
      params.set("category", selectedCategory);
    }
    
    if (filters.inventoryTier) {
      params.set("stockMin", filters.inventoryTier);
    }
    
    if (filters.inStock) {
      params.set("inStock", "true");
    }
    
    if (sortOption === "newest") {
      params.set("sortBy", "createdAt");
      params.set("sortDirection", "desc");
    } else if (sortOption === "price_high") {
      params.set("sortBy", "price");
      params.set("sortDirection", "desc");
    } else if (sortOption === "price_low") {
      params.set("sortBy", "price");
      params.set("sortDirection", "asc");
    } else if (sortOption === "stock_high") {
      params.set("sortBy", "stock");
      params.set("sortDirection", "desc");
    }
    
    return params.toString();
  };

  const queryParams = buildQueryParams();
  
  const { data: catalogData, isLoading, isFetching } = useQuery<CatalogResponse>({
    queryKey: ["/api/merchant/catalog", queryParams],
    queryFn: async () => {
      const token = localStorage.getItem("apex_token");
      const headers: HeadersInit = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      
      const res = await fetch(`/api/merchant/catalog?${queryParams}`, {
        credentials: "include",
        headers,
      });
      if (!res.ok) throw new Error("Failed to fetch catalog");
      const data = await res.json();
      return data.data;
    },
    placeholderData: keepPreviousData,
    staleTime: 30000,
  });

  const products = catalogData?.products || [];
  const suppliers = catalogData?.suppliers || [];
  const pagination = catalogData?.pagination;
  const totalProducts = pagination?.total || 0;
  const totalPages = pagination?.totalPages || 1;

  const importMutation = useMutation({
    mutationFn: async (productIds: number[]) => {
      const results = [];
      for (const productId of productIds) {
        const response = await apiRequest("POST", "/api/merchant/products/import", {
          productId,
          pricingRule: {
            type: importSettings.pricingType,
            value: importSettings.pricingValue,
          },
        });
        results.push(await response.json());
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/products"] });
      toast({
        title: "Products Imported",
        description: `Successfully imported ${selectedProducts.length} product(s) to your store.`,
      });
      setSelectedProducts([]);
      setIsImportDialogOpen(false);
      setBulkSelectMode(false);
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import products",
        variant: "destructive",
      });
    },
  });

  const categoryTree = useMemo(() => {
    const tree: Record<string, string[]> = {};
    products.forEach((p) => {
      if (p.category) {
        const parts = p.category.split(" > ");
        const parent = parts[0];
        if (!tree[parent]) tree[parent] = [];
        if (parts[1] && !tree[parent].includes(parts[1])) {
          tree[parent].push(parts[1]);
        }
      }
    });
    return tree;
  }, [products]);

  const handleSelectSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setFilters(prev => ({ ...prev, supplierId: supplier.id }));
    setCurrentPage(1);
  };

  const handleBackToSuppliers = () => {
    setSelectedSupplier(null);
    setFilters(prev => ({ ...prev, supplierId: null }));
    setSelectedProducts([]);
    setBulkSelectMode(false);
  };

  const toggleProductSelection = (productId: number) => {
    setSelectedProducts(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const selectAllProducts = () => {
    if (selectedProducts.length === products.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(products.map(p => p.id));
    }
  };

  const handleImport = () => {
    if (selectedProducts.length === 0) return;
    importMutation.mutate(selectedProducts);
  };

  const calculateMerchantPrice = (supplierPrice: number) => {
    if (importSettings.pricingType === "percentage") {
      return supplierPrice * (1 + importSettings.pricingValue / 100);
    }
    return supplierPrice + importSettings.pricingValue;
  };

  const selectSupplierFilter = (supplierId: number) => {
    setFilters(prev => ({
      ...prev,
      supplierId: prev.supplierId === supplierId ? null : supplierId
    }));
    resetPage();
  };

  const handleCategorySelect = (category: string | null) => {
    setSelectedCategory(category);
    resetPage();
  };

  const toggleCategoryExpand = (category: string) => {
    setExpandedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const clearAllFilters = () => {
    setFilters({
      priceRange: [0, 10000],
      stockMin: 0,
      supplierId: selectedSupplier?.id || null,
      inStock: false,
      inventoryTier: "",
    });
    setSelectedCategory(null);
    setSearchInput("");
    setCurrentPage(1);
  };

  const resetPage = () => {
    setCurrentPage(1);
  };

  const activeFilterCount = [
    filters.inventoryTier,
    filters.inStock,
    selectedCategory,
  ].filter(Boolean).length;

  const calculateProfit = (supplierPrice: number) => {
    const merchantPrice = calculateMerchantPrice(supplierPrice);
    return merchantPrice - supplierPrice;
  };

  const FilterSidebar = () => (
    <div className="space-y-1">
      {selectedSupplier && (
        <div className="pb-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20">
            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Store className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{selectedSupplier.name}</p>
              <p className="text-xs text-muted-foreground">{totalProducts.toLocaleString()} products</p>
            </div>
          </div>
        </div>
      )}

      <Collapsible 
        open={expandedFilters.supplier} 
        onOpenChange={(open) => setExpandedFilters(prev => ({ ...prev, supplier: open }))}
      >
        <CollapsibleTrigger className="flex items-center justify-between w-full py-3 px-2 text-sm font-semibold hover:bg-muted/50 rounded-lg transition-colors">
          <span className="flex items-center gap-2">
            <Store className="h-4 w-4 text-muted-foreground" />
            Supplier
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expandedFilters.supplier ? "" : "-rotate-90"}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pb-4 space-y-1 px-1">
          <button
            onClick={() => setFilters(prev => ({ ...prev, supplierId: null }))}
            className={`w-full text-left text-sm py-2 px-3 rounded-lg transition-all ${
              !filters.supplierId ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"
            }`}
          >
            All Suppliers
          </button>
          {suppliers.map((supplier) => (
            <button
              key={supplier.id}
              onClick={() => selectSupplierFilter(supplier.id)}
              className={`w-full text-left text-sm py-2 px-3 rounded-lg transition-all truncate ${
                filters.supplierId === supplier.id ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"
              }`}
            >
              {supplier.name}
            </button>
          ))}
        </CollapsibleContent>
      </Collapsible>

      <Separator className="my-2" />

      <Collapsible 
        open={expandedFilters.inventory} 
        onOpenChange={(open) => setExpandedFilters(prev => ({ ...prev, inventory: open }))}
      >
        <CollapsibleTrigger className="flex items-center justify-between w-full py-3 px-2 text-sm font-semibold hover:bg-muted/50 rounded-lg transition-colors">
          <span className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-muted-foreground" />
            Stock Level
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expandedFilters.inventory ? "" : "-rotate-90"}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pb-4 space-y-2 px-2">
          {INVENTORY_TIERS.map((tier) => (
            <label
              key={tier.id}
              className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${
                filters.inventoryTier === tier.id ? "bg-primary/10" : "hover:bg-muted"
              }`}
            >
              <Checkbox
                checked={filters.inventoryTier === tier.id}
                onCheckedChange={(checked) => {
                  setFilters(prev => ({
                    ...prev,
                    inventoryTier: checked ? tier.id : ""
                  }));
                  resetPage();
                }}
              />
              <span className="text-sm">{tier.label}</span>
            </label>
          ))}
        </CollapsibleContent>
      </Collapsible>

      <Separator className="my-2" />

      <Collapsible 
        open={expandedFilters.category} 
        onOpenChange={(open) => setExpandedFilters(prev => ({ ...prev, category: open }))}
      >
        <CollapsibleTrigger className="flex items-center justify-between w-full py-3 px-2 text-sm font-semibold hover:bg-muted/50 rounded-lg transition-colors">
          <span className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            Category
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expandedFilters.category ? "" : "-rotate-90"}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pb-4 space-y-1 px-1 max-h-64 overflow-y-auto">
          <button
            onClick={() => handleCategorySelect(null)}
            className={`w-full text-left text-sm py-2 px-3 rounded-lg transition-all ${
              !selectedCategory ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"
            }`}
          >
            All Categories
          </button>
          {Object.keys(categoryTree).slice(0, 20).map((parentCat) => (
            <div key={parentCat}>
              <button
                onClick={() => handleCategorySelect(parentCat)}
                className={`w-full text-left text-sm py-2 px-3 rounded-lg transition-all flex items-center justify-between ${
                  selectedCategory === parentCat ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"
                }`}
              >
                <span className="truncate">{parentCat}</span>
                {categoryTree[parentCat].length > 0 && (
                  <ChevronRight 
                    className={`h-3 w-3 transition-transform ${expandedCategories.includes(parentCat) ? "rotate-90" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCategoryExpand(parentCat);
                    }}
                  />
                )}
              </button>
              {expandedCategories.includes(parentCat) && categoryTree[parentCat].map((child) => (
                <button
                  key={child}
                  onClick={() => handleCategorySelect(`${parentCat} > ${child}`)}
                  className={`w-full text-left text-sm py-1.5 px-6 rounded-lg transition-all ${
                    selectedCategory === `${parentCat} > ${child}` ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted text-muted-foreground"
                  }`}
                >
                  {child}
                </button>
              ))}
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );

  const ProductCard = ({ product }: { product: Product }) => {
    const stock = product.inventoryQuantity || 0;
    const isSelected = selectedProducts.includes(product.id);
    const variantCount = (product.variants as any[])?.length || 0;
    const profit = calculateProfit(product.supplierPrice);
    const profitPercent = ((profit / product.supplierPrice) * 100).toFixed(0);

    return (
      <div
        className={`group relative bg-card rounded-xl overflow-hidden border transition-all duration-300 ${
          isSelected 
            ? "ring-2 ring-primary border-primary shadow-lg" 
            : "hover:shadow-xl hover:border-primary/30 hover:-translate-y-1"
        }`}
        data-testid={`card-catalog-product-${product.id}`}
      >
        {bulkSelectMode && (
          <div className="absolute top-3 left-3 z-20">
            <div className={`h-6 w-6 rounded-full flex items-center justify-center transition-all ${
              isSelected ? "bg-primary" : "bg-background/90 backdrop-blur-sm border-2"
            }`}>
              {isSelected ? (
                <Check className="h-4 w-4 text-primary-foreground" />
              ) : (
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleProductSelection(product.id)}
                  className="h-4 w-4"
                  data-testid={`checkbox-product-${product.id}`}
                />
              )}
            </div>
          </div>
        )}

        <div className="absolute top-3 right-3 z-20 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-2 group-hover:translate-x-0">
          <button
            className="h-9 w-9 rounded-full bg-background/95 backdrop-blur-sm shadow-lg flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"
            onClick={(e) => {
              e.preventDefault();
              setQuickViewProduct(product);
            }}
            data-testid={`button-quick-view-${product.id}`}
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            className="h-9 w-9 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
            onClick={(e) => {
              e.preventDefault();
              if (!bulkSelectMode) {
                setSelectedProducts([product.id]);
                setIsImportDialogOpen(true);
              }
            }}
            data-testid={`button-quick-add-${product.id}`}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {stock === 0 && (
          <div className="absolute top-3 left-3 z-10">
            <Badge variant="destructive" className="text-xs shadow-sm">
              Out of Stock
            </Badge>
          </div>
        )}

        {stock > 100 && !bulkSelectMode && (
          <div className="absolute top-3 left-3 z-10">
            <Badge className="text-xs bg-emerald-500 hover:bg-emerald-500 shadow-sm">
              <Sparkles className="h-3 w-3 mr-1" />
              High Stock
            </Badge>
          </div>
        )}

        <Link href={`/dashboard/catalog/${product.id}`}>
          <div className="aspect-square bg-white relative overflow-hidden rounded-lg flex items-center justify-center">
            {(() => {
              const images = product.images as any[] | undefined;
              const imageUrl = images && images.length > 0 ? images[0]?.url : null;
              if (imageUrl) {
                return (
                  <img
                    src={imageUrl}
                    alt={product.title}
                    className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-300"
                  />
                );
              }
              return (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageOff className="h-12 w-12 text-muted-foreground/30" />
                </div>
              );
            })()}

            {variantCount > 1 && (
              <div className="absolute bottom-3 left-3 z-10">
                <Badge variant="secondary" className="text-xs bg-background/90 backdrop-blur-sm shadow-sm">
                  {variantCount} options
                </Badge>
              </div>
            )}
          </div>
        </Link>

        <div className="p-4">
          <Link href={`/dashboard/catalog/${product.id}`}>
            <h3 
              className="text-sm font-medium line-clamp-2 hover:text-primary transition-colors cursor-pointer leading-snug mb-3"
              data-testid={`link-product-title-${product.id}`}
            >
              {product.title}
            </h3>
          </Link>

          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-foreground">
                {formatPrice(product.supplierPrice)}
              </span>
              <span className="text-xs text-muted-foreground">cost</span>
            </div>
            
            <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                +{formatPrice(profit)} profit ({profitPercent}%)
              </span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <Badge variant="outline" className="text-xs px-2 py-0.5 font-normal">
                {stock > 0 ? `${stock} in stock` : "Out of stock"}
              </Badge>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const ProductListItem = ({ product }: { product: Product }) => {
    const stock = product.inventoryQuantity || 0;
    const isSelected = selectedProducts.includes(product.id);
    const variantCount = (product.variants as any[])?.length || 0;
    const profit = calculateProfit(product.supplierPrice);
    const profitPercent = ((profit / product.supplierPrice) * 100).toFixed(0);

    return (
      <div
        className={`group flex gap-4 p-4 bg-card rounded-xl border transition-all duration-200 ${
          isSelected 
            ? "ring-2 ring-primary border-primary" 
            : "hover:shadow-lg hover:border-primary/30"
        }`}
        data-testid={`list-catalog-product-${product.id}`}
      >
        {bulkSelectMode && (
          <div className="flex items-center">
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => toggleProductSelection(product.id)}
              className="h-5 w-5"
            />
          </div>
        )}

        <Link href={`/dashboard/catalog/${product.id}`}>
          <div className="w-24 h-24 rounded-lg overflow-hidden bg-white flex-shrink-0 flex items-center justify-center">
            {(() => {
              const images = product.images as any[] | undefined;
              const imageUrl = images && images.length > 0 ? images[0]?.url : null;
              if (imageUrl) {
                return (
                  <img
                    src={imageUrl}
                    alt={product.title}
                    className="max-w-full max-h-full object-contain"
                  />
                );
              }
              return (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageOff className="h-8 w-8 text-muted-foreground/30" />
                </div>
              );
            })()}
          </div>
        </Link>

        <div className="flex-1 min-w-0">
          <Link href={`/dashboard/catalog/${product.id}`}>
            <h3 className="font-medium hover:text-primary transition-colors line-clamp-1">
              {product.title}
            </h3>
          </Link>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
            {product.category || "Uncategorized"} {variantCount > 1 && `• ${variantCount} variants`}
          </p>
          <div className="flex items-center gap-3 mt-2">
            <Badge variant="outline" className="text-xs">
              {stock > 0 ? `${stock} in stock` : "Out of stock"}
            </Badge>
            {stock > 100 && (
              <Badge className="text-xs bg-emerald-500 hover:bg-emerald-500">
                High Stock
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end justify-between">
          <div className="text-right">
            <p className="text-lg font-bold">{formatPrice(product.supplierPrice)}</p>
            <p className="text-sm text-emerald-600">+{formatPrice(profit)} ({profitPercent}%)</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setQuickViewProduct(product)}
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              onClick={() => {
                setSelectedProducts([product.id]);
                setIsImportDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  if (!selectedSupplier) {
    return (
      <div className="bg-background">
        <div className="border-b bg-gradient-to-r from-primary/5 to-transparent">
          <div className="p-6 md:p-8">
            <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-catalog-title">
              Product Catalog
            </h1>
            <p className="text-muted-foreground mt-1">
              Choose a supplier to start browsing and importing products
            </p>
          </div>
        </div>
        
        <div className="p-6 md:p-8">
            {suppliersLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 w-full rounded-xl" />
                ))}
              </div>
            ) : !allSuppliers || allSuppliers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-6">
                  <Store className="h-10 w-10 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No Suppliers Available</h3>
                <p className="text-muted-foreground max-w-md">
                  Contact your administrator to add suppliers to your account.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {allSuppliers.map((supplier) => (
                  <Card
                    key={supplier.id}
                    className="group cursor-pointer hover:shadow-xl hover:border-primary/50 hover:-translate-y-1 transition-all duration-300"
                    onClick={() => handleSelectSupplier(supplier)}
                    data-testid={`button-supplier-${supplier.id}`}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center group-hover:from-primary/30 group-hover:to-primary/20 transition-colors">
                          <Store className="h-7 w-7 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-lg group-hover:text-primary transition-colors" data-testid={`text-supplier-name-${supplier.id}`}>
                            {supplier.name}
                          </h3>
                          {supplier.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                              {supplier.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-3">
                            <Badge variant="secondary" className="text-xs">
                              Verified Supplier
                            </Badge>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
      </div>
    );
  }

  return (
    <div className="bg-background">
      <Sheet open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
        <SheetContent side="left" className="w-[300px] p-0">
          <SheetHeader className="p-4 border-b">
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-60px)]">
            <div className="p-4">
              <FilterSidebar />
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="max-w-md" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              Import Products
            </DialogTitle>
            <DialogDescription>
              Set your markup for {selectedProducts.length} product(s)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Markup Type</Label>
              <Select
                value={importSettings.pricingType}
                onValueChange={(v) => setImportSettings(prev => ({ ...prev, pricingType: v as "fixed" | "percentage" }))}
              >
                <SelectTrigger data-testid="select-pricing-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage Markup (%)</SelectItem>
                  <SelectItem value="fixed">Fixed Amount</SelectItem>
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
                  data-testid="input-pricing-value"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  {importSettings.pricingType === "percentage" ? "%" : "$"}
                </span>
              </div>
            </div>
            {selectedProducts.length === 1 && products.find(p => p.id === selectedProducts[0]) && (
              <div className="p-4 bg-muted/50 rounded-xl space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Your Cost</span>
                  <span className="font-medium">{formatPrice(products.find(p => p.id === selectedProducts[0])?.supplierPrice || 0)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Your Selling Price</span>
                  <span className="font-bold text-primary text-lg">
                    {formatPrice(calculateMerchantPrice(products.find(p => p.id === selectedProducts[0])?.supplierPrice || 0))}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Your Profit</span>
                  <span className="font-medium text-emerald-600">
                    +{formatPrice(calculateProfit(products.find(p => p.id === selectedProducts[0])?.supplierPrice || 0))}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleImport} 
              disabled={importMutation.isPending}
              className="gap-2"
              data-testid="button-confirm-import"
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

      <Dialog open={!!quickViewProduct} onOpenChange={() => setQuickViewProduct(null)} modal={true}>
        <DialogContent className="max-w-2xl" onCloseAutoFocus={(e) => e.preventDefault()}>
          {quickViewProduct && (
            <>
              <DialogHeader>
                <DialogTitle className="line-clamp-1">{quickViewProduct.title}</DialogTitle>
                <DialogDescription className="sr-only">
                  Quick view of {quickViewProduct.title}
                </DialogDescription>
              </DialogHeader>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="aspect-square rounded-xl overflow-hidden bg-white flex items-center justify-center">
                  {(() => {
                    const images = quickViewProduct.images as any[] | undefined;
                    const imageUrl = images && images.length > 0 ? images[0]?.url : null;
                    if (imageUrl) {
                      return (
                        <img
                          src={imageUrl}
                          alt={quickViewProduct.title}
                          className="max-w-full max-h-full object-contain"
                        />
                      );
                    }
                    return (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageOff className="h-16 w-16 text-muted-foreground/30" />
                      </div>
                    );
                  })()}
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Cost Price</p>
                    <p className="text-3xl font-bold">{formatPrice(quickViewProduct.supplierPrice)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-sm text-muted-foreground">Potential Profit (20% markup)</p>
                    <p className="text-xl font-bold text-emerald-600">
                      +{formatPrice(calculateProfit(quickViewProduct.supplierPrice))} per sale
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Stock</span>
                      <span className="font-medium">{quickViewProduct.inventoryQuantity || 0} units</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Category</span>
                      <span className="font-medium">{quickViewProduct.category || "Uncategorized"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Variants</span>
                      <span className="font-medium">{(quickViewProduct.variants as any[])?.length || 1}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button
                      className="flex-1 gap-2"
                      onClick={() => {
                        setSelectedProducts([quickViewProduct.id]);
                        setQuickViewProduct(null);
                        setIsImportDialogOpen(true);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Import Product
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        const productId = quickViewProduct.id;
                        setQuickViewProduct(null);
                        // Navigate after dialog state is cleared
                        setTimeout(() => {
                          navigate(`/dashboard/catalog/${productId}`);
                        }, 50);
                      }}
                    >
                      View Details
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <div className="flex-shrink-0 border-b bg-background">
        <div className="px-4 md:px-6 py-3 flex items-center gap-2 text-sm border-b">
          <button 
            onClick={handleBackToSuppliers}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-back-home"
          >
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">Suppliers</span>
          </button>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium truncate">{selectedSupplier.name}</span>
          <Badge variant="secondary" className="ml-auto">
            {totalProducts.toLocaleString()} products
          </Badge>
        </div>

        <div className="px-4 md:px-6 py-3 flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden gap-2"
            onClick={() => setMobileFilterOpen(true)}
            data-testid="button-mobile-filters"
          >
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs ml-1">
                {activeFilterCount}
              </Badge>
            )}
          </Button>

          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search products..."
              className="pl-10 h-10 bg-muted/50 border-0 focus-visible:bg-background focus-visible:ring-1"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              data-testid="input-search-catalog"
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <div className="hidden md:flex items-center border rounded-lg p-1">
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewMode("grid")}
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewMode("list")}
              >
                <LayoutList className="h-4 w-4" />
              </Button>
            </div>

            <Select value={sortOption} onValueChange={(v) => { setSortOption(v as SortOption); resetPage(); }}>
              <SelectTrigger className="w-[160px] h-10" data-testid="select-sort">
                <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant={bulkSelectMode ? "default" : "outline"}
              size="sm"
              className="gap-2 h-10"
              onClick={() => {
                setBulkSelectMode(!bulkSelectMode);
                if (bulkSelectMode) {
                  setSelectedProducts([]);
                }
              }}
              data-testid="button-bulk-select"
            >
              <ListChecks className="h-4 w-4" />
              <span className="hidden sm:inline">Select</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-1">
        <div className="hidden lg:block w-72 border-r flex-shrink-0 bg-muted/30">
          <div className="p-4 sticky top-0">
            <FilterSidebar />
          </div>
        </div>

        <div className="flex-1">
            <div className="p-4 md:p-6">
              {isLoading ? (
                <div className={viewMode === "grid" 
                  ? "grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                  : "space-y-4"
                }>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    viewMode === "grid" ? (
                      <div key={i} className="space-y-3">
                        <Skeleton className="aspect-[3/4] w-full rounded-xl" />
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-6 w-1/2" />
                      </div>
                    ) : (
                      <Skeleton key={i} className="h-28 w-full rounded-xl" />
                    )
                  ))}
                </div>
              ) : products.length > 0 ? (
                <>
                  {viewMode === "grid" ? (
                    <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                      {products.map((product) => (
                        <ProductCard key={product.id} product={product} />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {products.map((product) => (
                        <ProductListItem key={product.id} product={product} />
                      ))}
                    </div>
                  )}

                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-3 mt-8 pt-6 border-t">
                      <Button
                        variant="outline"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          return (
                            <Button
                              key={pageNum}
                              variant={currentPage === pageNum ? "default" : "ghost"}
                              size="icon"
                              className="h-9 w-9"
                              onClick={() => setCurrentPage(pageNum)}
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      <Button
                        variant="outline"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-6">
                    <Package className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">No Products Found</h3>
                  <p className="text-muted-foreground max-w-md mb-6">
                    Try adjusting your filters or search terms to find what you're looking for.
                  </p>
                  {activeFilterCount > 0 && (
                    <Button
                      variant="outline"
                      onClick={clearAllFilters}
                      className="gap-2"
                    >
                      <X className="h-4 w-4" />
                      Clear All Filters
                    </Button>
                  )}
                </div>
              )}
            </div>
        </div>
      </div>

      {bulkSelectMode && selectedProducts.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur-sm border-t shadow-2xl z-50">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Checkbox
                checked={selectedProducts.length === products.length}
                onCheckedChange={selectAllProducts}
              />
              <span className="font-medium">
                {selectedProducts.length} product{selectedProducts.length !== 1 ? "s" : ""} selected
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                onClick={() => setSelectedProducts([])}
              >
                Clear Selection
              </Button>
              <Button
                onClick={() => setIsImportDialogOpen(true)}
                className="gap-2"
                data-testid="button-import-selected"
              >
                <ShoppingCart className="h-4 w-4" />
                Import {selectedProducts.length} Product{selectedProducts.length !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        </div>
      )}

      {isFetching && !isLoading && (
        <div className="fixed bottom-4 right-4 bg-primary text-primary-foreground rounded-full p-3 shadow-lg z-40">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
    </div>
  );
}
