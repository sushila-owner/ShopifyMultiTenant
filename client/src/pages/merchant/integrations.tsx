import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
} from "lucide-react";
import { SiShopify, SiWoo, SiAmazon } from "react-icons/si";

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

  const isShopifyConnected = user?.merchant?.shopifyStore?.isConnected;

  const connectMutation = useMutation({
    mutationFn: (data: { platform: string; domain?: string }) =>
      apiRequest("POST", "/api/integrations/connect", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants/stats"] });
      toast({ title: "Integration connected successfully" });
      setIsShopifyDialogOpen(false);
      setConnectingId(null);
    },
    onError: () => {
      toast({ title: "Failed to connect integration", variant: "destructive" });
      setConnectingId(null);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (platform: string) =>
      apiRequest("POST", "/api/integrations/disconnect", { platform }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants/stats"] });
      toast({ title: "Integration disconnected" });
    },
    onError: () => {
      toast({ title: "Failed to disconnect", variant: "destructive" });
    },
  });

  const handleConnect = (integrationId: string) => {
    if (integrationId === "shopify") {
      setIsShopifyDialogOpen(true);
    } else {
      setConnectingId(integrationId);
      connectMutation.mutate({ platform: integrationId });
    }
  };

  const handleShopifyConnect = () => {
    if (!shopifyDomain) {
      toast({ title: "Please enter your Shopify store domain", variant: "destructive" });
      return;
    }
    setConnectingId("shopify");
    connectMutation.mutate({ platform: "shopify", domain: shopifyDomain });
  };

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-integrations-title">Integrations</h1>
          <p className="text-muted-foreground">Connect your sales channels and tools</p>
        </div>
      </div>

      {/* Connected Integration Banner */}
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
                  {user?.merchant?.shopifyStore?.domain}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => disconnectMutation.mutate("shopify")}
                disabled={disconnectMutation.isPending}
              >
                Disconnect
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available Integrations */}
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
                    <Button variant="outline" className="flex-1 gap-2">
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

      {/* How It Works */}
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
                Click connect and authorize Apex Mart to access your store. We use secure OAuth.
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

      {/* Shopify Connect Dialog */}
      <Dialog open={isShopifyDialogOpen} onOpenChange={setIsShopifyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Shopify Store</DialogTitle>
            <DialogDescription>
              Enter your Shopify store domain to connect
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
                />
                <div className="flex items-center rounded-r-md border border-l-0 bg-muted px-3 text-sm text-muted-foreground">
                  .myshopify.com
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              You'll be redirected to Shopify to authorize the connection. This uses secure OAuth authentication.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsShopifyDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleShopifyConnect}
              disabled={connectMutation.isPending}
              className="gap-2"
              data-testid="button-confirm-shopify-connect"
            >
              {connectMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <SiShopify className="h-4 w-4" />
              Connect Store
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
