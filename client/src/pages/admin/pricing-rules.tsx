import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  DollarSign,
  Percent,
  Plus,
  Pencil,
  Trash2,
  Truck,
  ArrowDown,
  ArrowUp,
  Loader2,
  Play,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Supplier, BulkPricingRule } from "@shared/schema";

export default function AdminPricingRulesPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<BulkPricingRule | null>(null);
  const [deletingRuleId, setDeletingRuleId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    supplierId: "",
    ruleType: "percentage" as "percentage" | "fixed",
    value: "",
    isActive: true,
  });

  const { data: suppliersResponse, isLoading: suppliersLoading } = useQuery<{ success: boolean; data: Supplier[] }>({
    queryKey: ["/api/admin/suppliers"],
  });
  const suppliers = suppliersResponse?.data || [];

  const { data: rulesResponse, isLoading: rulesLoading } = useQuery<{ success: boolean; data: BulkPricingRule[] }>({
    queryKey: ["/api/admin/bulk-pricing-rules"],
  });
  const pricingRules = rulesResponse?.data || [];

  const createMutation = useMutation({
    mutationFn: (data: { name: string; supplierId: number; ruleType: "percentage" | "fixed"; value: number; isActive: boolean }) =>
      apiRequest("POST", "/api/admin/bulk-pricing-rules", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bulk-pricing-rules"] });
      toast({ title: "Pricing rule created successfully" });
      setDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to create pricing rule", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; ruleType?: "percentage" | "fixed"; value?: number; isActive?: boolean } }) =>
      apiRequest("PUT", `/api/admin/bulk-pricing-rules/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bulk-pricing-rules"] });
      toast({ title: "Pricing rule updated successfully" });
      setDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to update pricing rule", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/admin/bulk-pricing-rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bulk-pricing-rules"] });
      toast({ title: "Pricing rule deleted successfully" });
      setDeleteDialogOpen(false);
      setDeletingRuleId(null);
    },
    onError: () => {
      toast({ title: "Failed to delete pricing rule", variant: "destructive" });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/admin/bulk-pricing-rules/${id}/apply`);
      return response.json();
    },
    onSuccess: (data: { success: boolean; message?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
      toast({ title: data.message || "Pricing rule applied successfully" });
    },
    onError: () => {
      toast({ title: "Failed to apply pricing rule", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      supplierId: "",
      ruleType: "percentage",
      value: "",
      isActive: true,
    });
    setEditingRule(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (rule: BulkPricingRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      supplierId: rule.supplierId.toString(),
      ruleType: rule.ruleType,
      value: rule.value.toString(),
      isActive: rule.isActive ?? true,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name.trim() || !formData.supplierId || !formData.value.trim()) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }

    const value = parseFloat(formData.value);
    if (isNaN(value)) {
      toast({ title: "Please enter a valid number for value", variant: "destructive" });
      return;
    }

    if (editingRule) {
      updateMutation.mutate({
        id: editingRule.id,
        data: {
          name: formData.name,
          ruleType: formData.ruleType,
          value,
          isActive: formData.isActive,
        },
      });
    } else {
      createMutation.mutate({
        name: formData.name,
        supplierId: parseInt(formData.supplierId),
        ruleType: formData.ruleType,
        value,
        isActive: formData.isActive,
      });
    }
  };

  const getSupplierName = (supplierId: number) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier?.name || "Unknown";
  };

  const formatRuleValue = (rule: BulkPricingRule) => {
    const isIncrease = rule.value > 0;
    const absValue = Math.abs(rule.value);
    
    if (rule.ruleType === "percentage") {
      return (
        <span className={isIncrease ? "text-red-600" : "text-green-600"}>
          {isIncrease ? "+" : "-"}{absValue}%
        </span>
      );
    }
    return (
      <span className={isIncrease ? "text-red-600" : "text-green-600"}>
        {isIncrease ? "+" : "-"}${absValue.toFixed(2)}
      </span>
    );
  };

  const isLoading = suppliersLoading || rulesLoading;

  if (isLoading) {
    return (
      <div className="flex-1 space-y-6 p-6 md:p-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-pricing-rules-title">
            Bulk Pricing Rules
          </h1>
          <p className="text-muted-foreground">
            Manage supplier-wide pricing adjustments
          </p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2" data-testid="button-create-rule">
          <Plus className="h-4 w-4" />
          Create Pricing Rule
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
          <CardDescription>
            Bulk pricing rules let you adjust prices across all products from a specific supplier.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-start gap-3 p-4 rounded-lg border">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-green-500/10">
                <ArrowDown className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="font-medium">Decrease Prices</p>
                <p className="text-sm text-muted-foreground">
                  Use negative values to reduce merchant prices (e.g., -30% discount)
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-lg border">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-red-500/10">
                <ArrowUp className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="font-medium">Increase Prices</p>
                <p className="text-sm text-muted-foreground">
                  Use positive values to add markup (e.g., +15% margin)
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-lg border">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <Truck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Per Supplier</p>
                <p className="text-sm text-muted-foreground">
                  Each rule applies to all products from the selected supplier
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Rules</CardTitle>
          <CardDescription>
            {pricingRules.length} pricing rule{pricingRules.length !== 1 ? "s" : ""} configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pricingRules.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <DollarSign className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No pricing rules yet</h3>
              <p className="text-sm mb-4">
                Create your first bulk pricing rule to adjust prices across suppliers.
              </p>
              <Button onClick={openCreateDialog} className="gap-2">
                <Plus className="h-4 w-4" />
                Create Pricing Rule
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule Name</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Adjustment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pricingRules.map((rule) => (
                  <TableRow key={rule.id} data-testid={`row-rule-${rule.id}`}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-muted-foreground" />
                        {getSupplierName(rule.supplierId)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        {rule.ruleType === "percentage" ? (
                          <>
                            <Percent className="h-3 w-3" />
                            Percentage
                          </>
                        ) : (
                          <>
                            <DollarSign className="h-3 w-3" />
                            Fixed
                          </>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatRuleValue(rule)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={rule.isActive ? "default" : "secondary"}>
                        {rule.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => applyMutation.mutate(rule.id)}
                          disabled={!rule.isActive || applyMutation.isPending}
                          title="Apply rule to all products"
                          data-testid={`button-apply-rule-${rule.id}`}
                        >
                          {applyMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(rule)}
                          data-testid={`button-edit-rule-${rule.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setDeletingRuleId(rule.id);
                            setDeleteDialogOpen(true);
                          }}
                          data-testid={`button-delete-rule-${rule.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? "Edit Pricing Rule" : "Create Pricing Rule"}
            </DialogTitle>
            <DialogDescription>
              {editingRule
                ? "Modify the supplier-wide pricing adjustment."
                : "Create a new pricing rule that applies to all products from a supplier."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Rule Name</Label>
              <Input
                id="name"
                placeholder="e.g., Shopify 30% Discount"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                data-testid="input-rule-name"
              />
            </div>

            <div className="space-y-2">
              <Label>Supplier</Label>
              <Select
                value={formData.supplierId}
                onValueChange={(value) => setFormData({ ...formData, supplierId: value })}
                disabled={!!editingRule}
              >
                <SelectTrigger data-testid="select-rule-supplier">
                  <SelectValue placeholder="Select a supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id.toString()}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editingRule && (
                <p className="text-xs text-muted-foreground">
                  Supplier cannot be changed after creation
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Adjustment Type</Label>
              <Select
                value={formData.ruleType}
                onValueChange={(value) => setFormData({ ...formData, ruleType: value as "percentage" | "fixed" })}
              >
                <SelectTrigger data-testid="select-rule-type">
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
              <Label htmlFor="value">
                Value {formData.ruleType === "percentage" ? "(e.g., -30 for 30% discount)" : "(e.g., -5 for $5 discount)"}
              </Label>
              <Input
                id="value"
                type="number"
                step="0.01"
                placeholder={formData.ruleType === "percentage" ? "-30" : "-5.00"}
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                data-testid="input-rule-value"
              />
              <p className="text-xs text-muted-foreground">
                Use negative values for discounts, positive for markups
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">
                  Enable or disable this pricing rule
                </p>
              </div>
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                data-testid="switch-rule-active"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-rule"
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingRule ? "Save Changes" : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Pricing Rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The pricing rule will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingRuleId && deleteMutation.mutate(deletingRuleId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
