import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Store, ArrowRight } from "lucide-react";

export default function ShopifyConnected() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [shopName, setShopName] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const shop = urlParams.get("shop");

    if (shop) {
      setShopName(decodeURIComponent(shop));
    }

    if (code) {
      exchangeCodeForToken(code);
    } else {
      setErrorMessage("Missing authorization code");
      setStatus("error");
    }
  }, []);

  async function exchangeCodeForToken(code: string) {
    try {
      const response = await fetch("/api/shopify/exchange-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();

      if (data.success && data.token) {
        localStorage.setItem("auth_token", data.token);
        setStatus("success");
        
        setTimeout(() => {
          setLocation("/dashboard");
        }, 3000);
      } else {
        setErrorMessage(data.error || "Failed to authenticate");
        setStatus("error");
      }
    } catch (error) {
      console.error("Code exchange failed:", error);
      setErrorMessage("Connection failed. Please try again.");
      setStatus("error");
    }
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6 text-center">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <p className="mt-4 text-muted-foreground">Connecting your store...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <CardTitle className="text-destructive">Connection Failed</CardTitle>
            <CardDescription>
              {errorMessage || "There was an issue connecting your Shopify store. Please try again."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => setLocation("/login")} data-testid="button-go-to-login">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <CardTitle className="text-2xl" data-testid="text-success-title">
            Store Connected!
          </CardTitle>
          <CardDescription className="text-base">
            Your Shopify store has been successfully connected to Apex Mart Wholesale
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {shopName && (
            <div className="flex items-center justify-center gap-3 p-4 bg-muted rounded-lg">
              <Store className="h-5 w-5 text-primary" />
              <span className="font-medium" data-testid="text-shop-name">{shopName}</span>
            </div>
          )}
          
          <div className="space-y-3 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Account created automatically
            </p>
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Orders will sync automatically
            </p>
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              2-day free trial activated
            </p>
          </div>

          <div className="pt-4">
            <Button 
              onClick={() => setLocation("/dashboard")} 
              className="w-full gap-2"
              data-testid="button-go-to-dashboard"
            >
              Go to Dashboard
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Redirecting to your dashboard in a few seconds...
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
