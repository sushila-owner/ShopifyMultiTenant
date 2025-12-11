import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle,
  XCircle,
  AlertCircle,
  Package,
  ShoppingCart,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ImportResult {
  success: boolean;
  totalRows: number;
  successCount: number;
  errorCount: number;
  errors: Array<{ row: number; error: string }>;
}

export default function ImportPage() {
  const { toast } = useToast();
  const [ordersCSV, setOrdersCSV] = useState("");
  const [productsCSV, setProductsCSV] = useState("");
  const [ordersResult, setOrdersResult] = useState<ImportResult | null>(null);
  const [productsResult, setProductsResult] = useState<ImportResult | null>(null);

  const ordersMutation = useMutation({
    mutationFn: (csv: string) => apiRequest("POST", "/api/merchant/import/orders", { csv }),
    onSuccess: (data: any) => {
      setOrdersResult(data.data);
      if (data.data.success) {
        toast({ title: `Successfully imported ${data.data.successCount} orders` });
      } else {
        toast({ 
          title: `Import completed with errors`, 
          description: `${data.data.successCount} succeeded, ${data.data.errorCount} failed`,
          variant: "destructive" 
        });
      }
    },
    onError: (error: any) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  const productsMutation = useMutation({
    mutationFn: (csv: string) => apiRequest("POST", "/api/merchant/import/products", { csv }),
    onSuccess: (data: any) => {
      setProductsResult(data.data);
      if (data.data.success) {
        toast({ title: `Successfully imported ${data.data.successCount} products` });
      } else {
        toast({ 
          title: `Import completed with errors`, 
          description: `${data.data.successCount} succeeded, ${data.data.errorCount} failed`,
          variant: "destructive" 
        });
      }
    },
    onError: (error: any) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: "orders" | "products") => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (type === "orders") {
        setOrdersCSV(content);
      } else {
        setProductsCSV(content);
      }
    };
    reader.readAsText(file);
  };

  const downloadTemplate = (type: "orders" | "products") => {
    window.open(`/api/merchant/import/template/${type}`, "_blank");
  };

  const renderResult = (result: ImportResult | null) => {
    if (!result) return null;

    const successRate = result.totalRows > 0 
      ? Math.round((result.successCount / result.totalRows) * 100) 
      : 0;

    return (
      <div className="space-y-4 mt-4">
        <div className="flex items-center gap-4">
          <Progress value={successRate} className="flex-1" />
          <span className="text-sm font-medium">{successRate}%</span>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <p className="text-2xl font-bold">{result.totalRows}</p>
            <p className="text-xs text-muted-foreground">Total Rows</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-chart-2/10">
            <p className="text-2xl font-bold text-chart-2">{result.successCount}</p>
            <p className="text-xs text-muted-foreground">Succeeded</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-destructive/10">
            <p className="text-2xl font-bold text-destructive">{result.errorCount}</p>
            <p className="text-xs text-muted-foreground">Failed</p>
          </div>
        </div>

        {result.errors.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Import Errors</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4 mt-2 space-y-1 text-sm max-h-32 overflow-y-auto">
                {result.errors.slice(0, 10).map((err, i) => (
                  <li key={i}>Row {err.row}: {err.error}</li>
                ))}
                {result.errors.length > 10 && (
                  <li>...and {result.errors.length - 10} more errors</li>
                )}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {result.success && (
          <Alert>
            <CheckCircle className="h-4 w-4 text-chart-2" />
            <AlertTitle>Import Successful</AlertTitle>
            <AlertDescription>
              All {result.successCount} records were imported successfully.
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 space-y-4 sm:space-y-6 p-4 sm:p-6 md:p-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold" data-testid="text-import-title">Bulk Import</h1>
        <p className="text-muted-foreground text-sm sm:text-base">Import orders or products from CSV files</p>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Orders Import */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                <ShoppingCart className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base sm:text-lg">Import Orders</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Bulk import orders from CSV
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadTemplate("orders")}
                className="gap-2"
                data-testid="button-download-orders-template"
              >
                <Download className="h-4 w-4" />
                Download Template
              </Button>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => handleFileUpload(e, "orders")}
                  data-testid="input-orders-file"
                />
                <Button variant="outline" size="sm" className="gap-2 w-full sm:w-auto" asChild>
                  <span>
                    <Upload className="h-4 w-4" />
                    Upload CSV
                  </span>
                </Button>
              </label>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Or paste CSV content:</label>
              <Textarea
                value={ordersCSV}
                onChange={(e) => setOrdersCSV(e.target.value)}
                placeholder="orderNumber,customerName,customerEmail,totalAmount..."
                className="min-h-[120px] font-mono text-xs"
                data-testid="textarea-orders-csv"
              />
            </div>

            <Button
              onClick={() => ordersMutation.mutate(ordersCSV)}
              disabled={!ordersCSV || ordersMutation.isPending}
              className="w-full gap-2"
              data-testid="button-import-orders"
            >
              {ordersMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="h-4 w-4" />
                  Import Orders
                </>
              )}
            </Button>

            {renderResult(ordersResult)}
          </CardContent>
        </Card>

        {/* Products Import */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-chart-2/10">
                <Package className="h-5 w-5 text-chart-2" />
              </div>
              <div>
                <CardTitle className="text-base sm:text-lg">Import Products</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Bulk import products from CSV
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadTemplate("products")}
                className="gap-2"
                data-testid="button-download-products-template"
              >
                <Download className="h-4 w-4" />
                Download Template
              </Button>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => handleFileUpload(e, "products")}
                  data-testid="input-products-file"
                />
                <Button variant="outline" size="sm" className="gap-2 w-full sm:w-auto" asChild>
                  <span>
                    <Upload className="h-4 w-4" />
                    Upload CSV
                  </span>
                </Button>
              </label>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Or paste CSV content:</label>
              <Textarea
                value={productsCSV}
                onChange={(e) => setProductsCSV(e.target.value)}
                placeholder="title,description,sku,price,inventory..."
                className="min-h-[120px] font-mono text-xs"
                data-testid="textarea-products-csv"
              />
            </div>

            <Button
              onClick={() => productsMutation.mutate(productsCSV)}
              disabled={!productsCSV || productsMutation.isPending}
              className="w-full gap-2"
              data-testid="button-import-products"
            >
              {productsMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="h-4 w-4" />
                  Import Products
                </>
              )}
            </Button>

            {renderResult(productsResult)}
          </CardContent>
        </Card>
      </div>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Import Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
            <div>
              <h4 className="font-medium mb-2 text-sm sm:text-base">Orders CSV Format</h4>
              <p className="text-xs sm:text-sm text-muted-foreground mb-2">
                Required columns: customerName, customerEmail, totalAmount
              </p>
              <ul className="text-xs sm:text-sm text-muted-foreground space-y-1 list-disc pl-4">
                <li>orderNumber - Optional order reference</li>
                <li>customerPhone - Optional phone number</li>
                <li>shippingAddress, shippingCity, shippingZip - Shipping info</li>
                <li>subtotal, shippingCost, taxAmount - Price breakdown</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2 text-sm sm:text-base">Products CSV Format</h4>
              <p className="text-xs sm:text-sm text-muted-foreground mb-2">
                Required columns: title, price
              </p>
              <ul className="text-xs sm:text-sm text-muted-foreground space-y-1 list-disc pl-4">
                <li>description - Product description</li>
                <li>sku, barcode - Product identifiers</li>
                <li>inventory - Stock quantity</li>
                <li>category, vendor - Classification</li>
                <li>tags - Comma-separated tags</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
