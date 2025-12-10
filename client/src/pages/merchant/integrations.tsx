import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useAuth } from "@/lib/auth";
import {
  Plug,
  CheckCircle,
  ExternalLink,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { SiShopify, SiWoo, SiAmazon } from "react-icons/si";

interface ShopifyStatusResponse {
  success: boolean;
  data?: {
    isConnected: boolean;
    domain: string | null;
    scopes: string[];
    installedAt: string | null;
  };
}

const integrations = [
  {
    id: "shopify",
    name: "Shopify",
    description: "Connect your Shopify store to sync products and orders",
    icon: SiShopify,
    color: "#95BF47",
    popular: true,
  },
  {
    id: "woocommerce",
    name: "WooCommerce",
    description: "Connect your WooCommerce store for seamless integration",
    icon: SiWoo,
    color: "#96588A",
    popular: false,
    comingSoon: true,
  },
  {
    id: "amazon",
    name: "Amazon",
    description: "Sell on Amazon marketplace with automatic fulfillment",
    icon: SiAmazon,
    color: "#FF9900",
    popular: false,
    comingSoon: true,
  },
];

export default function IntegrationsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [isShopifyDialogOpen, setIsShopifyDialogOpen] = useState(false);
  const [shopifyDomain, setShopifyDomain] = useState("");

  const { data: shopifyStatus, refetch: refetchShopifyStatus } = useQuery<ShopifyStatusResponse>({
    queryKey: ["/api/merchant/shopify/status"],
    enabled: !!user?.merchantId,
  });

  const shopifyStore = user?.merchant?.shopifyStore as { isConnected?: boolean; domain?: string } | undefined;
  const isShopifyConnected = shopifyStatus?.data?.isConnected || shopifyStore?.isConnected;
  const connectedDomain = shopifyStatus?.data?.domain || shopifyStore?.domain;

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const shopifyPending = urlParams.get("shopify_pending");
    const error = urlParams.get("error");
    const errorMessage = urlParams.get("message");

    if (error) {
      let displayMessage = "Failed to connect Shopify store";
      if (error === "shopify_not_configured") {
        displayMessage = "Shopify app is not configured on the server";
      } else if (error === "invalid_hmac") {
        displayMessage = "Security validation failed. Please try again.";
      } else if (error === "invalid_state") {
        displayMessage = "Session expired. Please try connecting again.";
      } else if (error === "oauth_failed" && errorMessage) {
        displayMessage = decodeURIComponent(errorMessage);
      }
      toast({ title: displayMessage, variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (shopifyPending) {
      // SECURITY: Verify this session initiated the OAuth flow
      // Prevents phishing attacks where attacker crafts URL with their pending code
      const oauthInitiated = sessionStorage.getItem("shopify_oauth_initiated");
      if (!oauthInitiated) {
        console.warn("[Security] Shopify pending code received without OAuth initiation marker");
        toast({ 
          title: "Invalid connection request", 
          description: "Please start the Shopify connection process from this page.",
          variant: "destructive" 
        });
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }
      
      // Clear the session markers
      sessionStorage.removeItem("shopify_oauth_initiated");
      sessionStorage.removeItem("shopify_oauth_domain");
      
      // Now safe to redeem the pending code - backend will also verify merchantId
      saveShopifyConnection({ pendingCode: shopifyPending });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const saveShopifyConnectionMutation = useMutation({
    mutationFn: (data: { pendingCode: string }) =>
      apiRequest("POST", "/api/merchant/shopify/connect", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/shopify/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchants/stats"] });
      refetchShopifyStatus();
      toast({ title: "Shopify store connected successfully!" });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to save Shopify connection", variant: "destructive" });
    },
  });

  const saveShopifyConnection = (data: { pendingCode: string }) => {
    saveShopifyConnectionMutation.mutate(data);
  };

  const disconnectMutation = useMutation({
    mutationFn: (platform: string) => {
      if (platform === "shopify") {
        return apiRequest("POST", "/api/merchant/shopify/disconnect", {});
      }
      return apiRequest("POST", "/api/integrations/disconnect", { platform });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/shopify/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchants/stats"] });
      refetchShopifyStatus();
      toast({ title: "Integration disconnected" });
    },
    onError: () => {
      toast({ title: "Failed to disconnect", variant: "destructive" });
    },
  });

  const handleShopifyConnect = async () => {
    if (!shopifyDomain) {
      toast({ title: "Please enter your Shopify store domain", variant: "destructive" });
      return;
    }

    const cleanDomain = shopifyDomain.replace(/\.myshopify\.com$/, "").trim();
    if (!cleanDomain) {
      toast({ title: "Please enter a valid store name", variant: "destructive" });
      return;
    }

    const token = localStorage.getItem("apex_token");
    if (!token) {
      toast({ title: "Please log in to connect your Shopify store", variant: "destructive" });
      return;
    }

    setConnectingId("shopify");
    setIsShopifyDialogOpen(false);
    
    try {
      const fullDomain = `${cleanDomain}.myshopify.com`;
      const response = await fetch("/api/shopify/oauth/install", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ shop: fullDomain }),
      });
      
      const data = await response.json();
      
      if (data.success && data.redirectUrl) {
        // Mark that this session initiated Shopify OAuth - prevents phishing attacks
        sessionStorage.setItem("shopify_oauth_initiated", "true");
        sessionStorage.setItem("shopify_oauth_domain", fullDomain);
        // Redirect to Shopify OAuth
        window.location.href = data.redirectUrl;
      } else {
        toast({ title: data.error || "Failed to start Shopify connection", variant: "destructive" });
        setConnectingId(null);
      }
    } catch (error) {
      console.error("OAuth install error:", error);
      toast({ title: "Failed to connect to Shopify", variant: "destructive" });
      setConnectingId(null);
    }
  };

  const handleConnect = (integrationId: string) => {
    if (integrationId === "shopify") {
      setIsShopifyDialogOpen(true);
    } else {
      toast({ title: "This integration is not yet available", variant: "destructive" });
    }
  };

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-integrations-title">Integrations</h1>
          <p className="text-muted-foreground">Connect your sales channels and tools</p>
        </div>
      </div>

      {isShopifyConnected && (
        <Card className="border-chart-2 bg-chart-2/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#95BF47]/20">
                <SiShopify className="h-6 w-6 text-[#95BF47]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">Shopify Connected</p>
                  <CheckCircle className="h-4 w-4 text-chart-2" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {connectedDomain}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => disconnectMutation.mutate("shopify")}
                disabled={disconnectMutation.isPending}
                data-testid="button-disconnect-shopify"
              >
                {disconnectMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Disconnect"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {integrations.map((integration) => {
          const isConnected = integration.id === "shopify" && isShopifyConnected;
          const isConnecting = connectingId === integration.id;

          return (
            <Card key={integration.id} className={isConnected ? "border-chart-2" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${integration.color}20` }}
                    >
                      <integration.icon
                        className="h-6 w-6"
                        style={{ color: integration.color }}
                      />
                    </div>
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {integration.name}
                        {integration.popular && (
                          <Badge variant="secondary" className="text-xs">
                            Popular
                          </Badge>
                        )}
                      </CardTitle>
                    </div>
                  </div>
                  {isConnected && <CheckCircle className="h-5 w-5 text-chart-2" />}
                </div>
                <CardDescription className="mt-2">{integration.description}</CardDescription>
              </CardHeader>
              <CardContent>
                {integration.comingSoon ? (
                  <Button variant="outline" className="w-full" disabled>
                    Coming Soon
                  </Button>
                ) : isConnected ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 gap-2"
                      onClick={() => {
                        if (connectedDomain) {
                          window.open(`https://${connectedDomain}/admin`, "_blank");
                        }
                      }}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open Store
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => disconnectMutation.mutate(integration.id)}
                      disabled={disconnectMutation.isPending}
                    >
                      Disconnect
                    </Button>
                  </div>
                ) : (
                  <Button
                    className="w-full gap-2"
                    onClick={() => handleConnect(integration.id)}
                    disabled={isConnecting}
                    data-testid={`button-connect-${integration.id}`}
                  >
                    {isConnecting && <Loader2 className="h-4 w-4 animate-spin" />}
                    <Plug className="h-4 w-4" />
                    Connect
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How Integrations Work</CardTitle>
          <CardDescription>Learn how to connect your sales channels</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
                1
              </div>
              <h4 className="font-medium">Connect Your Store</h4>
              <p className="text-sm text-muted-foreground">
                Click connect and authorize Apex Mart Wholesale to access your store. We use secure OAuth.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
                2
              </div>
              <h4 className="font-medium">Push Products</h4>
              <p className="text-sm text-muted-foreground">
                Import products from our catalog and push them directly to your store with one click.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
                3
              </div>
              <h4 className="font-medium">Auto-Fulfill Orders</h4>
              <p className="text-sm text-muted-foreground">
                Orders from your store are automatically sent to suppliers for fulfillment.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isShopifyDialogOpen} onOpenChange={setIsShopifyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SiShopify className="h-5 w-5 text-[#95BF47]" />
              Connect Shopify Store
            </DialogTitle>
            <DialogDescription>
              Enter your Shopify store domain to start the secure OAuth connection
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="shopifyDomain">Store Domain</Label>
              <div className="flex">
                <Input
                  id="shopifyDomain"
                  placeholder="your-store"
                  value={shopifyDomain}
                  onChange={(e) => setShopifyDomain(e.target.value)}
                  className="rounded-r-none"
                  data-testid="input-shopify-domain"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleShopifyConnect();
                    }
                  }}
                />
                <div className="flex items-center rounded-r-md border border-l-0 bg-muted px-3 text-sm text-muted-foreground">
                  .myshopify.com
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950">
              <AlertCircle className="h-4 w-4 mt-0.5 text-blue-600 dark:text-blue-400" />
              <p className="text-xs text-blue-800 dark:text-blue-200">
                You'll be redirected to Shopify to authorize the connection. We request access to manage products, orders, customers, and inventory in your store.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsShopifyDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleShopifyConnect}
              disabled={connectingId === "shopify"}
              className="gap-2"
              data-testid="button-confirm-shopify-connect"
            >
              {connectingId === "shopify" && <Loader2 className="h-4 w-4 animate-spin" />}
              <SiShopify className="h-4 w-4" />
              Connect to Shopify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
