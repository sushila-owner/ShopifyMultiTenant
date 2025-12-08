import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, keepPreviousData } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
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
} from "lucide-react";
import { Link } from "wouter";
import type { Product, Supplier } from "@shared/schema";

type SortOption = "featured" | "newest" | "price_high" | "price_low" | "stock_high";

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
  { id: "25", label: "More than 25" },
  { id: "50", label: "More than 50" },
  { id: "100", label: "More than 100" },
];

const SORT_OPTIONS = [
  { id: "featured" as SortOption, label: "Featured" },
  { id: "newest" as SortOption, label: "Newest" },
  { id: "price_high" as SortOption, label: "Price (High to Low)" },
  { id: "price_low" as SortOption, label: "Price (Low to High)" },
  { id: "stock_high" as SortOption, label: "Inventory (High to Low)" },
];

export default function CatalogPage() {
  const { toast } = useToast();
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

  const categories = useMemo(() => {
    const cats = products.map((p) => p.category).filter((c): c is string => !!c);
    return Array.from(new Set(cats)).sort();
  }, [products]);

  const categoryTree = useMemo(() => {
    const tree: { [key: string]: string[] } = {};
    categories.forEach(cat => {
      const parts = cat.split(" > ");
      const parent = parts[0];
      if (!tree[parent]) {
        tree[parent] = [];
      }
      if (parts.length > 1) {
        const child = parts.slice(1).join(" > ");
        if (!tree[parent].includes(child)) {
          tree[parent].push(child);
        }
      }
    });
    return tree;
  }, [categories]);

  const resetPage = () => setCurrentPage(1);

  const toggleProductSelection = (productId: number) => {
    setSelectedProducts((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  };

  const selectAllProducts = () => {
    if (products) {
      if (selectedProducts.length === products.length) {
        setSelectedProducts([]);
      } else {
        setSelectedProducts(products.map((p) => p.id));
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

  const selectSupplierFilter = (supplierId: number) => {
    setFilters(prev => ({
      ...prev,
      supplierId: prev.supplierId === supplierId ? null : supplierId
    }));
    resetPage();
  };

  const clearAllFilters = () => {
    setFilters({
      priceRange: [0, 10000],
      stockMin: 0,
      supplierId: null,
      inStock: false,
      inventoryTier: "",
    });
    setSelectedCategory(null);
    setSearchInput("");
    resetPage();
  };

  const activeFilterCount = 
    (filters.supplierId ? 1 : 0) + 
    (filters.inventoryTier ? 1 : 0) + 
    (selectedCategory ? 1 : 0) +
    (debouncedSearch ? 1 : 0);

  const handleBackToSuppliers = () => {
    setSelectedSupplier(null);
    setSelectedProducts([]);
    setSearchInput("");
    setCurrentPage(1);
    setBulkSelectMode(false);
  };

  const handleSelectSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setCurrentPage(1);
    setSearchInput("");
  };

  const toggleCategoryExpand = (category: string) => {
    setExpandedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const handleCategorySelect = (category: string | null) => {
    setSelectedCategory(category);
    resetPage();
  };

  const FilterSidebar = () => (
    <div className="space-y-1">
      {activeFilterCount > 0 && (
        <div className="p-3 bg-muted/50 rounded-lg mb-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{activeFilterCount} filters applied</span>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 text-xs text-primary"
              onClick={clearAllFilters}
            >
              Clear All
            </Button>
          </div>
        </div>
      )}

      <Collapsible 
        open={expandedFilters.supplier} 
        onOpenChange={(open) => setExpandedFilters(prev => ({ ...prev, supplier: open }))}
      >
        <CollapsibleTrigger className="flex items-center justify-between w-full py-3 px-1 text-sm font-medium hover:bg-muted/50 rounded-md">
          <span>Supplier</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${expandedFilters.supplier ? "" : "-rotate-90"}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pb-4 space-y-1 px-1">
          <button
            onClick={() => setFilters(prev => ({ ...prev, supplierId: null }))}
            className={`w-full text-left text-sm py-1.5 px-2 rounded-md transition-colors ${
              !filters.supplierId ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50"
            }`}
          >
            All Suppliers
          </button>
          {suppliers.map((supplier) => (
            <button
              key={supplier.id}
              onClick={() => selectSupplierFilter(supplier.id)}
              className={`w-full text-left text-sm py-1.5 px-2 rounded-md transition-colors truncate ${
                filters.supplierId === supplier.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50"
              }`}
            >
              {supplier.name}
            </button>
          ))}
        </CollapsibleContent>
      </Collapsible>

      <Separator />

      <Collapsible 
        open={expandedFilters.inventory} 
        onOpenChange={(open) => setExpandedFilters(prev => ({ ...prev, inventory: open }))}
      >
        <CollapsibleTrigger className="flex items-center justify-between w-full py-3 px-1 text-sm font-medium hover:bg-muted/50 rounded-md">
          <span>Inventory</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${expandedFilters.inventory ? "" : "-rotate-90"}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pb-4 space-y-2 px-1">
          {INVENTORY_TIERS.map((tier) => (
            <div key={tier.id} className="flex items-center space-x-2">
              <Checkbox
                id={`inventory-${tier.id}`}
                checked={filters.inventoryTier === tier.id}
                onCheckedChange={(checked) => {
                  setFilters(prev => ({
                    ...prev,
                    inventoryTier: checked ? tier.id : ""
                  }));
                  resetPage();
                }}
              />
              <label
                htmlFor={`inventory-${tier.id}`}
                className="text-sm leading-none cursor-pointer"
              >
                {tier.label}
              </label>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>

      <Separator />

      <Collapsible 
        open={expandedFilters.category} 
        onOpenChange={(open) => setExpandedFilters(prev => ({ ...prev, category: open }))}
      >
        <CollapsibleTrigger className="flex items-center justify-between w-full py-3 px-1 text-sm font-medium hover:bg-muted/50 rounded-md">
          <span>Category</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${expandedFilters.category ? "" : "-rotate-90"}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pb-4 space-y-1 px-1 max-h-64 overflow-y-auto">
          <button
            onClick={() => handleCategorySelect(null)}
            className={`w-full text-left text-sm py-1.5 px-2 rounded-md transition-colors ${
              !selectedCategory ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50"
            }`}
          >
            All Categories
          </button>
          {Object.keys(categoryTree).slice(0, 20).map((parentCat) => (
            <div key={parentCat}>
              <button
                onClick={() => handleCategorySelect(parentCat)}
                className={`w-full text-left text-sm py-1.5 px-2 rounded-md transition-colors flex items-center justify-between ${
                  selectedCategory === parentCat ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50"
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
                  className={`w-full text-left text-sm py-1 px-4 rounded-md transition-colors ${
                    selectedCategory === `${parentCat} > ${child}` ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50 text-muted-foreground"
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

  if (!selectedSupplier) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
        <div className="flex-shrink-0 border-b">
          <div className="p-4 md:p-6">
            <h1 className="text-xl md:text-2xl font-semibold" data-testid="text-catalog-title">
              Product Catalog
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Select a supplier to browse products
            </p>
          </div>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-4 md:p-6">
            {suppliersLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-lg" />
                ))}
              </div>
            ) : !allSuppliers || allSuppliers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Store className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No Suppliers Available</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  Contact your administrator to add suppliers.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {allSuppliers.map((supplier) => (
                  <button
                    key={supplier.id}
                    onClick={() => handleSelectSupplier(supplier)}
                    className="text-left p-4 rounded-xl border bg-card hover:border-primary/50 hover:shadow-md transition-all group"
                    data-testid={`button-supplier-${supplier.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                        <Store className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium truncate" data-testid={`text-supplier-name-${supplier.id}`}>
                          {supplier.name}
                        </h3>
                        {supplier.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {supplier.description}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      <Sheet open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
        <SheetContent side="left" className="w-[280px] p-0">
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import Products</DialogTitle>
            <DialogDescription>
              Set your pricing strategy for {selectedProducts.length} product(s)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Markup Type</Label>
              <Select
                value={importSettings.pricingType}
                onValueChange={(v) => setImportSettings(prev => ({ ...prev, pricingType: v as "fixed" | "percentage" }))}
              >
                <SelectTrigger data-testid="select-pricing-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage Markup</SelectItem>
                  <SelectItem value="fixed">Fixed Amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>
                {importSettings.pricingType === "percentage" ? "Markup %" : "Markup $"}
              </Label>
              <Input
                type="number"
                value={importSettings.pricingValue}
                onChange={(e) => setImportSettings(prev => ({ ...prev, pricingValue: parseFloat(e.target.value) || 0 }))}
                data-testid="input-pricing-value"
              />
            </div>
            {selectedProducts.length === 1 && products.find(p => p.id === selectedProducts[0]) && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Supplier Price:</span>
                  <span>${products.find(p => p.id === selectedProducts[0])?.supplierPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-muted-foreground">Your Price:</span>
                  <span className="font-medium text-primary">
                    ${calculateMerchantPrice(products.find(p => p.id === selectedProducts[0])?.supplierPrice || 0).toFixed(2)}
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
              data-testid="button-confirm-import"
            >
              {importMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex-shrink-0 border-b bg-background">
        <div className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 flex items-center gap-2 text-sm">
          <button 
            onClick={handleBackToSuppliers}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-back-home"
          >
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">Home</span>
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium truncate">{selectedSupplier.name}</span>
          <span className="text-muted-foreground ml-auto whitespace-nowrap">
            ({totalProducts.toLocaleString()} Items)
          </span>
        </div>

        <div className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 flex flex-wrap items-center gap-2 border-t">
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden gap-2"
            onClick={() => setMobileFilterOpen(true)}
            data-testid="button-mobile-filters"
          >
            <Filter className="h-4 w-4" />
            <span className="hidden sm:inline">Filters</span>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {activeFilterCount}
              </Badge>
            )}
          </Button>

          <div className="relative flex-1 min-w-[120px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search..."
              className="pl-9 h-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              data-testid="input-search-catalog"
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <Select value={sortOption} onValueChange={(v) => { setSortOption(v as SortOption); resetPage(); }}>
              <SelectTrigger className="w-[140px] sm:w-[180px] h-9" data-testid="select-sort">
                <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Sort By" />
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
              className="gap-2"
              onClick={() => {
                setBulkSelectMode(!bulkSelectMode);
                if (bulkSelectMode) {
                  setSelectedProducts([]);
                }
              }}
              data-testid="button-bulk-select"
            >
              <ListChecks className="h-4 w-4" />
              <span className="hidden sm:inline">Bulk Select</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="hidden lg:block w-64 border-r flex-shrink-0">
          <ScrollArea className="h-full">
            <div className="p-4">
              <FilterSidebar />
            </div>
          </ScrollArea>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-3 sm:p-4 md:p-6">
              {isLoading ? (
                <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="aspect-[3/4] w-full rounded-lg" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  ))}
                </div>
              ) : products.length > 0 ? (
                <>
                  <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {products.map((product) => {
                      const stock = product.inventoryQuantity || 0;
                      const isSelected = selectedProducts.includes(product.id);
                      const variantCount = product.variants?.length || 0;

                      return (
                        <div
                          key={product.id}
                          className={`group relative bg-card rounded-lg overflow-hidden border transition-all duration-200 hover:shadow-lg ${
                            isSelected ? "ring-2 ring-primary border-primary" : "hover:border-primary/30"
                          }`}
                          data-testid={`card-catalog-product-${product.id}`}
                        >
                          {bulkSelectMode && (
                            <div className="absolute top-2 left-2 z-20">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleProductSelection(product.id)}
                                className="h-5 w-5 bg-background/90 backdrop-blur-sm border-2"
                                data-testid={`checkbox-product-${product.id}`}
                              />
                            </div>
                          )}

                          <button
                            className="absolute top-2 right-2 z-20 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background"
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

                          {stock === 0 && (
                            <div className="absolute top-2 left-2 z-10">
                              <Badge variant="secondary" className="text-xs bg-background/90">
                                Out of Stock
                              </Badge>
                            </div>
                          )}

                          <Link href={`/dashboard/products/${product.id}`}>
                            <div className="aspect-[3/4] bg-muted relative overflow-hidden">
                              {product.images && product.images.length > 0 ? (
                                <img
                                  src={product.images[0].url}
                                  alt={product.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <ImageOff className="h-8 w-8 text-muted-foreground/30" />
                                </div>
                              )}

                              {variantCount > 1 && (
                                <div className="absolute bottom-2 left-2 z-10">
                                  <Badge variant="secondary" className="text-xs bg-background/90">
                                    {variantCount} variants
                                  </Badge>
                                </div>
                              )}
                            </div>
                          </Link>

                          <div className="p-2 sm:p-3">
                            <Link href={`/dashboard/products/${product.id}`}>
                              <h3 
                                className="text-xs sm:text-sm font-medium line-clamp-2 hover:text-primary transition-colors cursor-pointer leading-tight"
                                data-testid={`link-product-title-${product.id}`}
                              >
                                {product.title}
                              </h3>
                            </Link>

                            <div className="mt-2 flex items-center gap-2">
                              <Badge variant="outline" className="text-xs px-1.5 py-0 h-5">
                                Dropship
                              </Badge>
                              <span className="text-sm sm:text-base font-bold text-primary">
                                ${product.supplierPrice.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-6 pt-6 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground px-4">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Package className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No Products Found</h3>
                  <p className="text-muted-foreground text-sm mt-1">
                    Try adjusting your filters or search terms
                  </p>
                  {activeFilterCount > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={clearAllFilters}
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {bulkSelectMode && selectedProducts.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-3 sm:p-4 bg-background border-t shadow-lg z-50">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={selectedProducts.length === products.length}
                onCheckedChange={selectAllProducts}
              />
              <span className="text-sm font-medium">
                {selectedProducts.length} product(s) selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedProducts([])}
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
              <Button
                size="sm"
                onClick={() => setIsImportDialogOpen(true)}
                data-testid="button-import-selected"
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                Import Selected
              </Button>
            </div>
          </div>
        </div>
      )}

      {isFetching && !isLoading && (
        <div className="fixed bottom-4 right-4 bg-background border rounded-full p-2 shadow-lg z-40">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}
