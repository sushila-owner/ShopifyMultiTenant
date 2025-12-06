import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, keepPreviousData } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Grid,
  List,
  Plus,
  ImageOff,
  Loader2,
  DollarSign,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  X,
  Sparkles,
  Clock,
  Flame,
  TrendingUp,
  ArrowUp,
  ArrowDown,
  Store,
  Boxes,
  Tag,
  Check,
  ShoppingCart,
} from "lucide-react";
import type { Product, Supplier } from "@shared/schema";

type SortField = "default" | "price" | "stock" | "createdAt";
type SortDirection = "asc" | "desc";
type TabType = "all" | "new" | "deals" | "trending";

interface FilterState {
  priceRange: [number, number];
  stockMin: number;
  suppliers: number[];
  categories: string[];
  inStock: boolean;
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

const PRODUCTS_PER_PAGE = 50;

export default function CatalogPage() {
  const { toast } = useToast();
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [sortField, setSortField] = useState<SortField>("default");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  
  const [filters, setFilters] = useState<FilterState>({
    priceRange: [0, 10000],
    stockMin: 0,
    suppliers: [],
    categories: [],
    inStock: false,
  });

  const [expandedSections, setExpandedSections] = useState({
    price: true,
    stock: true,
    suppliers: true,
    categories: true,
  });

  const [importSettings, setImportSettings] = useState({
    pricingType: "percentage" as "fixed" | "percentage",
    pricingValue: 20,
  });

  // Debounce search input to avoid too many API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setCurrentPage(1); // Reset to page 1 on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch all suppliers for the supplier list view
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

  // Build query params for server-side pagination
  const buildQueryParams = () => {
    const params = new URLSearchParams();
    params.set("page", currentPage.toString());
    params.set("pageSize", PRODUCTS_PER_PAGE.toString());
    
    if (debouncedSearch) {
      params.set("search", debouncedSearch);
    }
    
    // Filter by selected supplier
    if (selectedSupplier) {
      params.set("supplierId", selectedSupplier.id.toString());
    } else if (filters.suppliers.length === 1) {
      params.set("supplierId", filters.suppliers[0].toString());
    }
    
    // Only use first selected category for now
    if (filters.categories.length === 1) {
      params.set("category", filters.categories[0]);
    }
    
    if (filters.priceRange[0] > 0) {
      params.set("priceMin", filters.priceRange[0].toString());
    }
    
    if (filters.priceRange[1] < 10000) {
      params.set("priceMax", filters.priceRange[1].toString());
    }
    
    if (filters.inStock) {
      params.set("inStock", "true");
    }
    
    if (sortField !== "default") {
      params.set("sortBy", sortField);
      params.set("sortDirection", sortDirection);
    }
    
    return params.toString();
  };

  const queryParams = buildQueryParams();
  
  // Fetch paginated catalog data from server
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
    mutationFn: async (data: { productId: number; pricingRule: { type: string; value: number } }) =>
      apiRequest("POST", "/api/merchant/products/import", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/dashboard"] });
      toast({ title: "Product imported successfully" });
      setSelectedProducts([]);
      setIsImportDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to import product", variant: "destructive" });
    },
  });

  // Get categories from suppliers' products - cached from initial load
  const categories = useMemo(() => {
    const cats = products.map((p) => p.category).filter((c): c is string => !!c);
    return Array.from(new Set(cats));
  }, [products]);

  const priceStats = useMemo(() => {
    if (!products?.length) return { min: 0, max: 10000 };
    const prices = products.map(p => p.supplierPrice);
    return { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) };
  }, [products]);

  const getCompareAtPrice = (product: Product) => {
    if (product.variants && product.variants.length > 0) {
      const maxCompareAt = Math.max(
        ...product.variants.map(v => v.compareAtPrice || 0)
      );
      return maxCompareAt;
    }
    return 0;
  };

  // Client-side filtering only for tabs (new arrivals, deals, trending)
  // Main filtering is done server-side
  const displayProducts = useMemo(() => {
    if (activeTab === "all") {
      return products;
    }
    
    if (activeTab === "new") {
      return products.filter(p => {
        if (!p.createdAt) return false;
        const daysSinceCreation = (Date.now() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceCreation <= 30;
      });
    }
    
    if (activeTab === "deals") {
      return products.filter(p => {
        const compareAt = getCompareAtPrice(p);
        return compareAt > p.supplierPrice;
      });
    }
    
    if (activeTab === "trending") {
      return [...products].sort((a, b) => (b.inventoryQuantity || 0) - (a.inventoryQuantity || 0)).slice(0, 50);
    }
    
    return products;
  }, [products, activeTab]);

  // Reset to page 1 when filters change
  const resetPage = () => setCurrentPage(1);

  const getSupplierName = (supplierId: number) => {
    return suppliers?.find((s) => s.id === supplierId)?.name || "Unknown";
  };

  const toggleProductSelection = (productId: number) => {
    setSelectedProducts((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  };

  const selectAllProducts = () => {
    if (displayProducts) {
      if (selectedProducts.length === displayProducts.length) {
        setSelectedProducts([]);
      } else {
        setSelectedProducts(displayProducts.map((p) => p.id));
      }
    }
  };

  const handleImport = async () => {
    for (const productId of selectedProducts) {
      await importMutation.mutateAsync({
        productId: productId,
        pricingRule: {
          type: importSettings.pricingType,
          value: importSettings.pricingValue,
        },
      });
    }
  };

  const calculateMerchantPrice = (supplierPrice: number) => {
    if (importSettings.pricingType === "percentage") {
      return supplierPrice * (1 + importSettings.pricingValue / 100);
    }
    return supplierPrice + importSettings.pricingValue;
  };

  const toggleSupplierFilter = (supplierId: number) => {
    setFilters(prev => ({
      ...prev,
      suppliers: prev.suppliers.includes(supplierId)
        ? prev.suppliers.filter(id => id !== supplierId)
        : [...prev.suppliers, supplierId]
    }));
    resetPage();
  };

  const toggleCategoryFilter = (category: string) => {
    setFilters(prev => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter(c => c !== category)
        : [...prev.categories, category]
    }));
    resetPage();
  };

  const clearAllFilters = () => {
    setFilters({
      priceRange: [priceStats.min, priceStats.max],
      stockMin: 0,
      suppliers: [],
      categories: [],
      inStock: false,
    });
    setSearchInput("");
    resetPage();
  };

  const hasActiveFilters = filters.suppliers.length > 0 || 
    filters.categories.length > 0 || 
    filters.inStock || 
    filters.stockMin > 0 ||
    filters.priceRange[0] > priceStats.min ||
    filters.priceRange[1] < priceStats.max ||
    debouncedSearch !== "";

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        setSortField("default");
        setSortDirection("asc");
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const tabs = [
    { id: "all" as TabType, label: "All Products", icon: Package },
    { id: "new" as TabType, label: "New Arrivals", icon: Sparkles },
    { id: "deals" as TabType, label: "Hot Deals", icon: Flame },
    { id: "trending" as TabType, label: "Trending", icon: TrendingUp },
  ];

  // Handle back to supplier list
  const handleBackToSuppliers = () => {
    setSelectedSupplier(null);
    setSelectedProducts([]);
    setSearchInput("");
    setCurrentPage(1);
  };

  // Handle supplier selection
  const handleSelectSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setCurrentPage(1);
    setSearchInput("");
  };

  // Supplier List View - shown when no supplier is selected
  if (!selectedSupplier) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="flex-shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="p-4 md:p-6">
            <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-catalog-title">
              Product Catalog
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Select a supplier to browse their products
            </p>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto p-4 md:p-6">
          {suppliersLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !allSuppliers || allSuppliers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Store className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No Suppliers Available</h3>
              <p className="text-muted-foreground text-sm mt-1">
                No suppliers have been added yet. Contact your administrator.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-w-3xl mx-auto">
              {allSuppliers.map((supplier) => (
                <div
                  key={supplier.id}
                  className="border rounded-lg p-4 hover-elevate cursor-pointer bg-card transition-all"
                  onClick={() => handleSelectSupplier(supplier)}
                  data-testid={`supplier-row-${supplier.id}`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Store className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium" data-testid={`text-supplier-name-${supplier.id}`}>
                          {supplier.name}
                        </h3>
                        {supplier.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {supplier.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <ChevronDown className="h-5 w-5 text-muted-foreground rotate-[-90deg]" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Product Catalog View - shown when a supplier is selected
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="p-4 md:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="gap-1 -ml-2"
                  onClick={handleBackToSuppliers}
                  data-testid="button-back-to-suppliers"
                >
                  <ChevronUp className="h-4 w-4 rotate-[-90deg]" />
                  Back
                </Button>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-supplier-catalog-title">
                {selectedSupplier.name}
              </h1>
              <p className="text-muted-foreground text-sm">
                {selectedSupplier.description || "Browse products from this supplier"}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {selectedProducts.length > 0 && (
                <Button 
                  className="gap-2" 
                  onClick={() => setIsImportDialogOpen(true)} 
                  data-testid="button-import-selected"
                >
                  <Plus className="h-4 w-4" />
                  Import {selectedProducts.length} Products
                </Button>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-2">
            {tabs.map((tab) => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? "default" : "outline"}
                size="sm"
                className="gap-2 whitespace-nowrap"
                onClick={() => setActiveTab(tab.id)}
                data-testid={`tab-${tab.id}`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Search and Sort Bar */}
        <div className="px-4 md:px-6 pb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search products, SKU, category..."
              className="pl-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              data-testid="input-search-catalog"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setShowFilters(!showFilters)}
              data-testid="button-toggle-filters"
            >
              <SlidersHorizontal className="h-4 w-4" />
              {showFilters ? "Hide" : "Show"} Filters
            </Button>

            <Separator orientation="vertical" className="h-6" />

            {/* Sort Buttons */}
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground hidden sm:inline">Sort:</span>
              <Button
                variant={sortField === "price" ? "secondary" : "ghost"}
                size="sm"
                className="gap-1"
                onClick={() => toggleSort("price")}
                data-testid="button-sort-price"
                aria-pressed={sortField === "price"}
                data-sort-direction={sortField === "price" ? sortDirection : undefined}
              >
                <DollarSign className="h-3 w-3" />
                Price
                {sortField === "price" && (
                  sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                )}
              </Button>
              <Button
                variant={sortField === "stock" ? "secondary" : "ghost"}
                size="sm"
                className="gap-1"
                onClick={() => toggleSort("stock")}
                data-testid="button-sort-stock"
                aria-pressed={sortField === "stock"}
                data-sort-direction={sortField === "stock" ? sortDirection : undefined}
              >
                <Boxes className="h-3 w-3" />
                Stock
                {sortField === "stock" && (
                  sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                )}
              </Button>
              <Button
                variant={sortField === "createdAt" ? "secondary" : "ghost"}
                size="sm"
                className="gap-1"
                onClick={() => toggleSort("createdAt")}
                data-testid="button-sort-date"
                aria-pressed={sortField === "createdAt"}
                data-sort-direction={sortField === "createdAt" ? sortDirection : undefined}
              >
                <Clock className="h-3 w-3" />
                Date
                {sortField === "createdAt" && (
                  sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                )}
              </Button>
            </div>

            <Separator orientation="vertical" className="h-6" />

            {/* View Mode */}
            <div className="flex border rounded-md">
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="icon"
                className="rounded-r-none"
                onClick={() => setViewMode("grid")}
                data-testid="button-grid-view"
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon"
                className="rounded-l-none"
                onClick={() => setViewMode("list")}
                data-testid="button-list-view"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Filter Sidebar */}
        {showFilters && (
          <div className="w-64 flex-shrink-0 border-r bg-muted/30 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {/* Filter Header */}
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Filters</h3>
                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={clearAllFilters}
                      data-testid="button-clear-filters"
                    >
                      <X className="h-3 w-3" />
                      Clear All
                    </Button>
                  )}
                </div>

                {/* Price Range */}
                <Collapsible
                  open={expandedSections.price}
                  onOpenChange={(open) => setExpandedSections(prev => ({ ...prev, price: open }))}
                >
                  <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover:text-primary transition-colors">
                    <span className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Price Range
                    </span>
                    {expandedSections.price ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2 pb-4 space-y-4">
                    <Slider
                      value={filters.priceRange}
                      onValueChange={(value) => setFilters(prev => ({ ...prev, priceRange: value as [number, number] }))}
                      min={priceStats.min}
                      max={priceStats.max}
                      step={1}
                      className="mt-2"
                      data-testid="slider-price-range"
                    />
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground">Min</Label>
                        <Input
                          type="number"
                          value={filters.priceRange[0]}
                          onChange={(e) => setFilters(prev => ({ 
                            ...prev, 
                            priceRange: [Number(e.target.value), prev.priceRange[1]] 
                          }))}
                          className="h-8 text-sm"
                          data-testid="input-price-min"
                        />
                      </div>
                      <span className="text-muted-foreground mt-5">-</span>
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground">Max</Label>
                        <Input
                          type="number"
                          value={filters.priceRange[1]}
                          onChange={(e) => setFilters(prev => ({ 
                            ...prev, 
                            priceRange: [prev.priceRange[0], Number(e.target.value)] 
                          }))}
                          className="h-8 text-sm"
                          data-testid="input-price-max"
                        />
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <Separator />

                {/* Stock */}
                <Collapsible
                  open={expandedSections.stock}
                  onOpenChange={(open) => setExpandedSections(prev => ({ ...prev, stock: open }))}
                >
                  <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover:text-primary transition-colors">
                    <span className="flex items-center gap-2">
                      <Boxes className="h-4 w-4" />
                      Availability
                    </span>
                    {expandedSections.stock ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2 pb-4 space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="in-stock"
                        checked={filters.inStock}
                        onCheckedChange={(checked) => setFilters(prev => ({ ...prev, inStock: !!checked }))}
                        data-testid="checkbox-in-stock"
                      />
                      <label
                        htmlFor="in-stock"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        In Stock Only
                      </label>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Minimum Quantity</Label>
                      <Input
                        type="number"
                        value={filters.stockMin}
                        onChange={(e) => setFilters(prev => ({ ...prev, stockMin: Number(e.target.value) }))}
                        className="h-8 text-sm mt-1"
                        placeholder="0"
                        data-testid="input-stock-min"
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <Separator />

                {/* Suppliers */}
                <Collapsible
                  open={expandedSections.suppliers}
                  onOpenChange={(open) => setExpandedSections(prev => ({ ...prev, suppliers: open }))}
                >
                  <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover:text-primary transition-colors">
                    <span className="flex items-center gap-2">
                      <Store className="h-4 w-4" />
                      Suppliers
                      {filters.suppliers.length > 0 && (
                        <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                          {filters.suppliers.length}
                        </Badge>
                      )}
                    </span>
                    {expandedSections.suppliers ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2 pb-4 space-y-2">
                    {suppliers?.map((supplier) => (
                      <div key={supplier.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`supplier-${supplier.id}`}
                          checked={filters.suppliers.includes(supplier.id)}
                          onCheckedChange={() => toggleSupplierFilter(supplier.id)}
                          data-testid={`checkbox-supplier-${supplier.id}`}
                        />
                        <label
                          htmlFor={`supplier-${supplier.id}`}
                          className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex-1 truncate"
                        >
                          {supplier.name}
                        </label>
                      </div>
                    ))}
                    {(!suppliers || suppliers.length === 0) && (
                      <p className="text-xs text-muted-foreground">No suppliers available</p>
                    )}
                  </CollapsibleContent>
                </Collapsible>

                <Separator />

                {/* Categories */}
                <Collapsible
                  open={expandedSections.categories}
                  onOpenChange={(open) => setExpandedSections(prev => ({ ...prev, categories: open }))}
                >
                  <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover:text-primary transition-colors">
                    <span className="flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      Categories
                      {filters.categories.length > 0 && (
                        <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                          {filters.categories.length}
                        </Badge>
                      )}
                    </span>
                    {expandedSections.categories ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2 pb-4 space-y-2">
                    {categories.map((category) => (
                      <div key={category} className="flex items-center space-x-2">
                        <Checkbox
                          id={`category-${category}`}
                          checked={filters.categories.includes(category)}
                          onCheckedChange={() => toggleCategoryFilter(category)}
                          data-testid={`checkbox-category-${category}`}
                        />
                        <label
                          htmlFor={`category-${category}`}
                          className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex-1 truncate"
                        >
                          {category}
                        </label>
                      </div>
                    ))}
                    {categories.length === 0 && (
                      <p className="text-xs text-muted-foreground">No categories available</p>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Products Grid */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Results Count & Selection */}
          <div className="flex-shrink-0 px-4 md:px-6 py-3 border-b bg-muted/20 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground" data-testid="text-product-count">
                {totalProducts.toLocaleString()} products
                {isFetching && !isLoading && <Loader2 className="inline h-3 w-3 ml-2 animate-spin" />}
              </span>
              {hasActiveFilters && (
                <Badge variant="outline" className="gap-1">
                  <SlidersHorizontal className="h-3 w-3" />
                  Filtered
                </Badge>
              )}
            </div>
            {displayProducts.length > 0 && (
              <Button variant="ghost" size="sm" onClick={selectAllProducts} data-testid="button-select-all">
                {selectedProducts.length === displayProducts.length ? (
                  <>
                    <X className="h-4 w-4 mr-1" />
                    Deselect All
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    Select All
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Products */}
          <ScrollArea className="flex-1">
            <div className="p-4 md:p-6">
              {isLoading ? (
                <div className={`grid gap-4 ${viewMode === "grid" ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" : ""}`}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
                    <div key={i} className={viewMode === "grid" ? "" : "flex items-center gap-4"}>
                      <Skeleton className={viewMode === "grid" ? "aspect-square w-full rounded-lg" : "h-20 w-20 rounded-lg"} />
                      <div className={`${viewMode === "grid" ? "mt-3" : "flex-1"} space-y-2`}>
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                        <Skeleton className="h-4 w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : displayProducts.length > 0 ? (
                <>
                {viewMode === "grid" ? (
                  <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {displayProducts.map((product) => {
                      const stock = product.inventoryQuantity || 0;
                      const compareAt = getCompareAtPrice(product);
                      const hasDiscount = compareAt > product.supplierPrice;
                      const discountPercent = hasDiscount 
                        ? Math.round((1 - product.supplierPrice / compareAt) * 100)
                        : 0;

                      return (
                        <div
                          key={product.id}
                          className={`group relative rounded-lg border bg-card overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-primary/50 ${
                            selectedProducts.includes(product.id) ? "ring-2 ring-primary shadow-lg" : ""
                          }`}
                          data-testid={`card-catalog-product-${product.id}`}
                        >
                          {/* Selection Checkbox */}
                          <div className="absolute top-2 left-2 z-10">
                            <Checkbox
                              checked={selectedProducts.includes(product.id)}
                              onCheckedChange={() => toggleProductSelection(product.id)}
                              className="bg-background/80 backdrop-blur-sm"
                              data-testid={`checkbox-product-${product.id}`}
                            />
                          </div>

                          {/* Badges */}
                          <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
                            {hasDiscount && (
                              <Badge className="bg-red-500 hover:bg-red-600 text-white text-xs">
                                -{discountPercent}%
                              </Badge>
                            )}
                            {stock === 0 && (
                              <Badge variant="secondary" className="text-xs">
                                Out of Stock
                              </Badge>
                            )}
                          </div>

                          {/* Image */}
                          <div 
                            className="aspect-square bg-muted cursor-pointer"
                            onClick={() => toggleProductSelection(product.id)}
                          >
                            {product.images && product.images.length > 0 ? (
                              <img
                                src={product.images[0].url}
                                alt={product.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ImageOff className="h-12 w-12 text-muted-foreground/30" />
                              </div>
                            )}
                          </div>

                          {/* Content */}
                          <div className="p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <h3 
                                className="font-medium text-sm line-clamp-2 cursor-pointer hover:text-primary transition-colors"
                                onClick={() => toggleProductSelection(product.id)}
                              >
                                {product.title}
                              </h3>
                            </div>

                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Store className="h-3 w-3" />
                              {getSupplierName(product.supplierId)}
                            </p>

                            <div className="flex items-end justify-between gap-2">
                              <div>
                                <div className="flex items-baseline gap-1.5">
                                  <span className="text-lg font-bold text-primary">
                                    ${product.supplierPrice.toFixed(2)}
                                  </span>
                                  {hasDiscount && (
                                    <span className="text-xs text-muted-foreground line-through">
                                      ${compareAt.toFixed(2)}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">Supplier price</p>
                              </div>
                              <Badge 
                                variant={stock > 10 ? "default" : stock > 0 ? "secondary" : "outline"}
                                className="text-xs whitespace-nowrap"
                              >
                                {stock > 0 ? `${stock} in stock` : "Out of stock"}
                              </Badge>
                            </div>

                            {product.category && (
                              <Badge variant="outline" className="text-xs">
                                {product.category}
                              </Badge>
                            )}
                          </div>

                          {/* Quick Actions */}
                          <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-background via-background/95 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              size="sm"
                              className="w-full gap-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedProducts([product.id]);
                                setIsImportDialogOpen(true);
                              }}
                              data-testid={`button-quick-import-${product.id}`}
                            >
                              <ShoppingCart className="h-4 w-4" />
                              Quick Import
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {displayProducts.map((product) => {
                      const stock = product.inventoryQuantity || 0;
                      const compareAt = getCompareAtPrice(product);
                      const hasDiscount = compareAt > product.supplierPrice;

                      return (
                        <div
                          key={product.id}
                          className={`flex items-center gap-4 p-4 rounded-lg border bg-card hover:shadow-md hover:border-primary/50 transition-all cursor-pointer ${
                            selectedProducts.includes(product.id) ? "ring-2 ring-primary shadow-md" : ""
                          }`}
                          onClick={() => toggleProductSelection(product.id)}
                          data-testid={`row-catalog-product-${product.id}`}
                        >
                          <Checkbox
                            checked={selectedProducts.includes(product.id)}
                            onCheckedChange={() => toggleProductSelection(product.id)}
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`checkbox-product-${product.id}`}
                          />
                          
                          <div className="relative h-20 w-20 flex-shrink-0">
                            {product.images && product.images.length > 0 ? (
                              <img
                                src={product.images[0].url}
                                alt={product.title}
                                className="h-full w-full rounded-lg object-cover"
                              />
                            ) : (
                              <div className="h-full w-full rounded-lg bg-muted flex items-center justify-center">
                                <ImageOff className="h-6 w-6 text-muted-foreground/50" />
                              </div>
                            )}
                            {hasDiscount && (
                              <Badge className="absolute -top-1 -right-1 bg-red-500 text-white text-xs">
                                Sale
                              </Badge>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium truncate">{product.title}</h3>
                            <p className="text-sm text-muted-foreground flex items-center gap-2">
                              <Store className="h-3 w-3" />
                              {getSupplierName(product.supplierId)}
                              {product.category && (
                                <>
                                  <span className="text-muted-foreground/50">|</span>
                                  {product.category}
                                </>
                              )}
                            </p>
                            {product.supplierSku && (
                              <p className="text-xs text-muted-foreground mt-1">SKU: {product.supplierSku}</p>
                            )}
                          </div>

                          <div className="text-right flex-shrink-0">
                            <div className="flex items-baseline gap-1.5 justify-end">
                              <span className="text-lg font-bold text-primary">
                                ${product.supplierPrice.toFixed(2)}
                              </span>
                              {hasDiscount && (
                                <span className="text-xs text-muted-foreground line-through">
                                  ${compareAt.toFixed(2)}
                                </span>
                              )}
                            </div>
                            <Badge 
                              variant={stock > 10 ? "default" : stock > 0 ? "secondary" : "outline"}
                              className="mt-1 text-xs"
                            >
                              {stock > 0 ? `${stock} in stock` : "Out of stock"}
                            </Badge>
                          </div>

                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 flex-shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProducts([product.id]);
                              setIsImportDialogOpen(true);
                            }}
                            data-testid={`button-quick-import-${product.id}`}
                          >
                            <Plus className="h-4 w-4" />
                            Import
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-6 pb-4">
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
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      data-testid="button-prev-page"
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground px-4" data-testid="text-page-info">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      data-testid="button-next-page"
                    >
                      Next
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                      data-testid="button-last-page"
                    >
                      Last
                    </Button>
                  </div>
                )}
                </>
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  <Package className="h-20 w-20 mx-auto mb-4 opacity-30" />
                  <h3 className="text-lg font-medium mb-2">No products found</h3>
                  <p className="text-sm mb-4">
                    {hasActiveFilters
                      ? "Try adjusting your filters or search terms"
                      : "Check back later for more products from suppliers"}
                  </p>
                  {hasActiveFilters && (
                    <Button variant="outline" onClick={clearAllFilters} data-testid="button-clear-filters-empty">
                      Clear All Filters
                    </Button>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Import Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Products</DialogTitle>
            <DialogDescription>
              Set your pricing rules for the {selectedProducts.length} selected product{selectedProducts.length !== 1 ? "s" : ""}
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
