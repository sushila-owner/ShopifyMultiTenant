import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, MoreHorizontal, Pencil, Trash, Layers, Package, ArrowUpDown, Truck, Filter, FolderPlus, X, Search, Loader2 } from "lucide-react";
import type { Category, Supplier, Product } from "@shared/schema";

const categoryFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase with hyphens only"),
  description: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  parentId: z.number().nullable().optional(),
  supplierId: z.number().nullable().optional(),
  sortOrder: z.number().nullable().default(0),
  isActive: z.boolean().nullable().default(true),
});

type CategoryFormData = z.infer<typeof categoryFormSchema>;

export default function AdminCategories() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  
  // Product management state
  const [manageProductsOpen, setManageProductsOpen] = useState(false);
  const [managingCategory, setManagingCategory] = useState<Category | null>(null);
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [manageTab, setManageTab] = useState<"current" | "add">("current");

  const form = useForm<CategoryFormData>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      image: "",
      parentId: null,
      supplierId: null,
      sortOrder: 0,
      isActive: true,
    },
  });

  const { data: suppliersData } = useQuery<{ success: boolean; data: Supplier[] }>({
    queryKey: ["/api/admin/suppliers"],
  });

  const suppliers = suppliersData?.data || [];

  const { data: categoriesData, isLoading } = useQuery<{ success: boolean; data: Category[] }>({
    queryKey: ["/api/admin/categories", { supplierId: supplierFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (supplierFilter && supplierFilter !== "all") {
        params.append("supplierId", supplierFilter);
      }
      const response = await fetch(`/api/admin/categories?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("apex_token")}` },
      });
      if (!response.ok) throw new Error("Failed to fetch categories");
      return response.json();
    },
  });

  const categories = categoriesData?.data || [];

  // Products in current category
  const { data: categoryProductsData, isLoading: categoryProductsLoading } = useQuery<{ success: boolean; data: { data: Product[]; total: number } }>({
    queryKey: ["/api/admin/categories", managingCategory?.id, "products"],
    queryFn: async () => {
      const response = await fetch(`/api/admin/categories/${managingCategory?.id}/products?pageSize=100`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("apex_token")}` },
      });
      if (!response.ok) throw new Error("Failed to fetch category products");
      return response.json();
    },
    enabled: !!managingCategory,
  });

  const categoryProducts = categoryProductsData?.data?.data || [];

  // Products available to add (search from supplier)
  const { data: availableProductsData, isLoading: availableProductsLoading } = useQuery<{ success: boolean; data: { data: Product[]; total: number; page: number; pageSize: number } }>({
    queryKey: ["/api/admin/products", { search: productSearchTerm, supplierId: managingCategory?.supplierId }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (productSearchTerm) params.append("search", productSearchTerm);
      if (managingCategory?.supplierId) params.append("supplierId", managingCategory.supplierId.toString());
      params.append("pageSize", "50");
      const response = await fetch(`/api/admin/products?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("apex_token")}` },
      });
      if (!response.ok) throw new Error("Failed to fetch products");
      return response.json();
    },
    enabled: !!managingCategory && manageTab === "add" && productSearchTerm.length >= 2,
  });

  const availableProducts = (availableProductsData?.data?.data || []).filter(
    p => !categoryProducts.some(cp => cp.id === p.id)
  );

  const createMutation = useMutation({
    mutationFn: async (data: CategoryFormData) => {
      const response = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("apex_token")}` },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create category");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Collection created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/categories"] });
      setDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Failed to create collection", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: CategoryFormData }) => {
      const response = await fetch(`/api/admin/categories/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("apex_token")}` },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update category");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Collection updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/categories"] });
      setDialogOpen(false);
      setEditingCategory(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Failed to update collection", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/admin/categories/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${localStorage.getItem("apex_token")}` },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete category");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Collection deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/categories"] });
      setDeleteDialogOpen(false);
      setCategoryToDelete(null);
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete collection", description: error.message, variant: "destructive" });
    },
  });

  // Add products to category
  const addProductsMutation = useMutation({
    mutationFn: async ({ categoryId, productIds }: { categoryId: number; productIds: number[] }) => {
      const response = await apiRequest("POST", `/api/admin/categories/${categoryId}/products`, { productIds });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || "Failed to add products");
      return result;
    },
    onSuccess: () => {
      toast({ title: "Products added to collection" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/categories", managingCategory?.id, "products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/categories"] });
      setSelectedProductIds([]);
    },
    onError: (error: any) => {
      toast({ title: "Failed to add products", description: error.message, variant: "destructive" });
    },
  });

  // Remove products from category
  const removeProductsMutation = useMutation({
    mutationFn: async ({ categoryId, productIds }: { categoryId: number; productIds: number[] }) => {
      const response = await apiRequest("DELETE", `/api/admin/categories/${categoryId}/products`, { productIds });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || "Failed to remove products");
      return result;
    },
    onSuccess: () => {
      toast({ title: "Products removed from collection" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/categories", managingCategory?.id, "products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/categories"] });
      setSelectedProductIds([]);
    },
    onError: (error: any) => {
      toast({ title: "Failed to remove products", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: CategoryFormData) => {
    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    form.reset({
      name: category.name,
      slug: category.slug,
      description: category.description || "",
      image: category.image || "",
      parentId: category.parentId,
      supplierId: category.supplierId,
      sortOrder: category.sortOrder || 0,
      isActive: category.isActive ?? true,
    });
    setDialogOpen(true);
  };

  const handleDelete = (category: Category) => {
    setCategoryToDelete(category);
    setDeleteDialogOpen(true);
  };

  const handleManageProducts = (category: Category) => {
    setManagingCategory(category);
    setManageProductsOpen(true);
    setProductSearchTerm("");
    setSelectedProductIds([]);
    setManageTab("current");
  };

  const generateSlug = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  };

  const openCreateDialog = () => {
    setEditingCategory(null);
    const selectedSupplierId = supplierFilter !== "all" ? parseInt(supplierFilter) : null;
    form.reset({
      name: "",
      slug: "",
      description: "",
      image: "",
      parentId: null,
      supplierId: selectedSupplierId,
      sortOrder: categories.length,
      isActive: true,
    });
    setDialogOpen(true);
  };

  const getParentCategoryName = (parentId: number | null) => {
    if (!parentId) return null;
    const parent = categories.find(c => c.id === parentId);
    return parent?.name || null;
  };

  const getSupplierName = (supplierId: number | null | undefined) => {
    if (!supplierId) return "Global";
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier?.name || "Unknown";
  };

  const toggleProductSelection = (productId: number) => {
    setSelectedProductIds(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const handleAddSelectedProducts = () => {
    if (managingCategory && selectedProductIds.length > 0) {
      addProductsMutation.mutate({
        categoryId: managingCategory.id,
        productIds: selectedProductIds,
      });
    }
  };

  const handleRemoveSelectedProducts = () => {
    if (managingCategory && selectedProductIds.length > 0) {
      removeProductsMutation.mutate({
        categoryId: managingCategory.id,
        productIds: selectedProductIds,
      });
    }
  };

  const handleRemoveSingleProduct = (productId: number) => {
    if (managingCategory) {
      removeProductsMutation.mutate({
        categoryId: managingCategory.id,
        productIds: [productId],
      });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Collections</h1>
          <p className="text-muted-foreground">Create collections and add products to organize your catalog</p>
        </div>
        <Button onClick={openCreateDialog} data-testid="button-add-category">
          <Plus className="h-4 w-4 mr-2" />
          Create Collection
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filter by Supplier
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-full sm:w-[300px]" data-testid="select-supplier-filter">
              <SelectValue placeholder="Select a supplier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Suppliers</SelectItem>
              {suppliers.map((supplier) => (
                <SelectItem key={supplier.id} value={supplier.id.toString()}>
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4" />
                    {supplier.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Collections</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-categories">{categories.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Collections</CardTitle>
            <Layers className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-active-categories">
              {categories.filter(c => c.isActive).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Parent Collections</CardTitle>
            <Layers className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-parent-categories">
              {categories.filter(c => !c.parentId).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-products">
              {categories.reduce((sum, c) => sum + (c.productCount || 0), 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {supplierFilter !== "all" 
              ? `Collections for ${getSupplierName(parseInt(supplierFilter))}`
              : "All Collections"
            }
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Layers className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No collections found. Create your first collection to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      Order
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Parent</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => (
                  <TableRow key={category.id} data-testid={`row-category-${category.id}`}>
                    <TableCell className="font-medium">{category.sortOrder ?? 0}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {category.image && (
                          <img src={category.image} alt="" className="h-6 w-6 rounded object-cover" />
                        )}
                        <span className="font-medium">{category.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{category.slug}</code>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getSupplierName(category.supplierId)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {getParentCategoryName(category.parentId) || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button 
                        variant="ghost" 
                        className="p-0 h-auto font-normal text-primary underline-offset-4 hover:underline"
                        onClick={() => handleManageProducts(category)}
                        data-testid={`button-manage-products-${category.id}`}
                      >
                        {category.productCount || 0} products
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Badge variant={category.isActive ? "default" : "secondary"}>
                        {category.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-actions-${category.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleManageProducts(category)} data-testid={`button-manage-${category.id}`}>
                            <FolderPlus className="h-4 w-4 mr-2" />
                            Manage Products
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEdit(category)} data-testid={`button-edit-${category.id}`}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(category)}
                            className="text-destructive"
                            data-testid={`button-delete-${category.id}`}
                          >
                            <Trash className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Collection Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Edit Collection" : "Create Collection"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="supplierId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier</FormLabel>
                    <Select
                      value={field.value?.toString() || "global"}
                      onValueChange={(value) => field.onChange(value === "global" ? null : parseInt(value))}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-category-supplier">
                          <SelectValue placeholder="Select supplier" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="global">Global (All Suppliers)</SelectItem>
                        {suppliers.map((supplier) => (
                          <SelectItem key={supplier.id} value={supplier.id.toString()}>
                            {supplier.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Collection Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Sofa, Electronics, Beauty"
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          if (!editingCategory) {
                            form.setValue("slug", generateSlug(e.target.value));
                          }
                        }}
                        data-testid="input-category-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., sofa" {...field} data-testid="input-category-slug" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Collection description..."
                        {...field}
                        value={field.value || ""}
                        data-testid="input-category-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="image"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Image URL (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="https://example.com/image.jpg" {...field} value={field.value || ""} data-testid="input-category-image" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="parentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Parent Collection (optional)</FormLabel>
                    <Select
                      value={field.value?.toString() || "none"}
                      onValueChange={(value) => field.onChange(value === "none" ? null : parseInt(value))}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-parent-category">
                          <SelectValue placeholder="Select parent category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No parent (top-level)</SelectItem>
                        {categories
                          .filter(c => c.id !== editingCategory?.id)
                          .map((category) => (
                            <SelectItem key={category.id} value={category.id.toString()}>
                              {category.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sortOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sort Order</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        value={field.value ?? 0}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        data-testid="input-category-sort-order"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Active</FormLabel>
                      <div className="text-sm text-muted-foreground">
                        Collection will be visible to merchants
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value ?? true}
                        onCheckedChange={field.onChange}
                        data-testid="switch-category-active"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-category"
                >
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Collection"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Manage Products Dialog */}
      <Dialog open={manageProductsOpen} onOpenChange={setManageProductsOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="h-5 w-5" />
              Manage Products in "{managingCategory?.name}"
            </DialogTitle>
            <DialogDescription>
              Add or remove products from this collection
            </DialogDescription>
          </DialogHeader>
          
          <Tabs value={manageTab} onValueChange={(v) => { setManageTab(v as "current" | "add"); setSelectedProductIds([]); }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="current" data-testid="tab-current-products">
                Current Products ({categoryProducts.length})
              </TabsTrigger>
              <TabsTrigger value="add" data-testid="tab-add-products">
                Add Products
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="current" className="mt-4">
              {categoryProductsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : categoryProducts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No products in this collection yet.</p>
                  <p className="text-sm">Go to "Add Products" to add products to this collection.</p>
                </div>
              ) : (
                <>
                  {selectedProductIds.length > 0 && (
                    <div className="flex items-center justify-between mb-4 p-3 bg-muted rounded-lg">
                      <span>{selectedProductIds.length} products selected</span>
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={handleRemoveSelectedProducts}
                        disabled={removeProductsMutation.isPending}
                        data-testid="button-remove-selected"
                      >
                        {removeProductsMutation.isPending ? "Removing..." : "Remove Selected"}
                      </Button>
                    </div>
                  )}
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {categoryProducts.map((product) => (
                        <div 
                          key={product.id} 
                          className="flex items-center gap-3 p-3 border rounded-lg hover-elevate"
                          data-testid={`product-item-${product.id}`}
                        >
                          <Checkbox 
                            checked={selectedProductIds.includes(product.id)}
                            onCheckedChange={() => toggleProductSelection(product.id)}
                            data-testid={`checkbox-product-${product.id}`}
                          />
                          {product.images && product.images[0] && (
                            <img 
                              src={product.images[0].url} 
                              alt="" 
                              className="h-10 w-10 rounded object-cover"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{product.title}</p>
                            <p className="text-sm text-muted-foreground">${product.supplierPrice?.toFixed(2)}</p>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => handleRemoveSingleProduct(product.id)}
                            disabled={removeProductsMutation.isPending}
                            data-testid={`button-remove-product-${product.id}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </>
              )}
            </TabsContent>
            
            <TabsContent value="add" className="mt-4">
              <div className="space-y-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                      placeholder="Search products to add (min 2 characters)..."
                      value={productSearchTerm}
                      onChange={(e) => setProductSearchTerm(e.target.value)}
                      className="pl-9"
                      data-testid="input-search-products"
                    />
                  </div>
                  {selectedProductIds.length > 0 && (
                    <Button 
                      onClick={handleAddSelectedProducts}
                      disabled={addProductsMutation.isPending}
                      data-testid="button-add-selected"
                    >
                      {addProductsMutation.isPending ? "Adding..." : `Add ${selectedProductIds.length} Products`}
                    </Button>
                  )}
                </div>

                {productSearchTerm.length < 2 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Enter at least 2 characters to search for products</p>
                  </div>
                ) : availableProductsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : availableProducts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No products found matching "{productSearchTerm}"</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[350px]">
                    <div className="space-y-2">
                      {availableProducts.map((product) => (
                        <div 
                          key={product.id} 
                          className="flex items-center gap-3 p-3 border rounded-lg hover-elevate cursor-pointer"
                          onClick={() => toggleProductSelection(product.id)}
                          data-testid={`available-product-${product.id}`}
                        >
                          <Checkbox 
                            checked={selectedProductIds.includes(product.id)}
                            onCheckedChange={() => toggleProductSelection(product.id)}
                            data-testid={`checkbox-add-product-${product.id}`}
                          />
                          {product.images && product.images[0] && (
                            <img 
                              src={product.images[0].url} 
                              alt="" 
                              className="h-10 w-10 rounded object-cover"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{product.title}</p>
                            <p className="text-sm text-muted-foreground">${product.supplierPrice?.toFixed(2)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Collection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{categoryToDelete?.name}"? This action cannot be undone.
              Products in this collection will no longer be categorized.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => categoryToDelete && deleteMutation.mutate(categoryToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
