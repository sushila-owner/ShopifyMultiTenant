import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Check,
  CreditCard,
  Zap,
  Package,
  ShoppingCart,
  Users,
  ArrowRight,
  Trophy,
  Sparkles,
  Video,
  Palette,
  HeadphonesIcon,
  Crown,
  Star,
  TrendingUp,
} from "lucide-react";
import type { Plan, Subscription } from "@shared/schema";

interface SubscriptionData {
  subscription: Subscription | null;
  currentPlan: Plan | null;
  availablePlans: Plan[];
  freeForLifePlan: Plan | null;
  freeForLifeThreshold: number;
}

export default function SubscriptionPage() {
  const { toast } = useToast();
  
  const { data, isLoading } = useQuery<{ success: boolean; data: SubscriptionData }>({
    queryKey: ["/api/merchant/subscription"],
  });

  const { data: statsData, isLoading: statsLoading } = useQuery<{
    success: boolean;
    data: {
      currentProductCount: number;
      productLimit: number;
      totalOrders: number;
    };
  }>({
    queryKey: ["/api/merchant/stats"],
  });

  const upgradeMutation = useMutation({
    mutationFn: async ({ planSlug, billingInterval }: { planSlug: string; billingInterval: string }) => {
      const response = await apiRequest("POST", "/api/merchant/subscription/upgrade", {
        planSlug,
        billingInterval,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/subscription"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/stats"] });
      toast({
        title: "Plan Upgraded",
        description: "Your subscription has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Upgrade Failed",
        description: error.message || "Failed to upgrade plan",
        variant: "destructive",
      });
    },
  });

  const subscription = data?.data?.subscription;
  const currentPlan = data?.data?.currentPlan;
  const availablePlans = data?.data?.availablePlans || [];
  const freeForLifeThreshold = data?.data?.freeForLifeThreshold || 5000000;
  const stats = statsData?.data;

  const lifetimeSales = subscription?.lifetimeSales || 0;
  const progressToFreeForLife = Math.min((lifetimeSales / freeForLifeThreshold) * 100, 100);
  const isFreeForLife = subscription?.status === "free_for_life";

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
  };

  const getPlanIcon = (planName: string) => {
    switch (planName) {
      case "free":
        return <Package className="h-7 w-7" />;
      case "starter":
        return <Zap className="h-7 w-7" />;
      case "growth":
        return <TrendingUp className="h-7 w-7" />;
      case "professional":
        return <Star className="h-7 w-7" />;
      case "millionaire":
        return <Crown className="h-7 w-7" />;
      case "free_for_life":
        return <Trophy className="h-7 w-7" />;
      default:
        return <Package className="h-7 w-7" />;
    }
  };

  const handleUpgrade = (planSlug: string) => {
    upgradeMutation.mutate({ planSlug, billingInterval: "monthly" });
  };

  if (isLoading) {
    return (
      <div className="flex-1 space-y-6 p-6 md:p-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-subscription-title">Subscription</h1>
          <p className="text-muted-foreground">Manage your plan and billing</p>
        </div>
      </div>

      {/* FREE FOR LIFE Progress Card */}
      <Card className="bg-gradient-to-r from-amber-500/10 via-yellow-500/10 to-orange-500/10 border-amber-500/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20">
              <Trophy className="h-6 w-6 text-amber-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">FREE FOR LIFE Progress</CardTitle>
                {isFreeForLife && (
                  <Badge className="bg-amber-500 text-amber-950">UNLOCKED</Badge>
                )}
              </div>
              <CardDescription>
                {isFreeForLife 
                  ? "You've earned FREE FOR LIFE status - all features are permanently unlocked!"
                  : `Reach ${formatCurrency(freeForLifeThreshold)} in lifetime sales to unlock FREE FOR LIFE access`
                }
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Lifetime Sales: {formatCurrency(lifetimeSales)}</span>
              <span className="text-muted-foreground">
                {formatCurrency(freeForLifeThreshold - lifetimeSales)} to go
              </span>
            </div>
            <Progress 
              value={progressToFreeForLife} 
              className="h-4 bg-amber-100 dark:bg-amber-950"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>$0</span>
              <span className="font-medium text-amber-600">{progressToFreeForLife.toFixed(1)}% Complete</span>
              <span>{formatCurrency(freeForLifeThreshold)}</span>
            </div>
          </div>
          {!isFreeForLife && (
            <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <Sparkles className="inline h-4 w-4 mr-1" />
                Once you hit {formatCurrency(freeForLifeThreshold)} in lifetime sales, you'll automatically unlock 
                <strong> unlimited access to all features forever</strong> - including unlimited products, 
                orders, AI ads, white-label branding, and VIP support.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Current Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>Your subscription details</CardDescription>
            </div>
            <Badge 
              variant={subscription?.status === "active" || subscription?.status === "free_for_life" ? "default" : "outline"}
              className={subscription?.status === "free_for_life" ? "bg-amber-500 text-amber-950" : ""}
            >
              {subscription?.status || "trial"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {getPlanIcon(currentPlan?.name || "free")}
            </div>
            <div>
              <h3 className="text-2xl font-bold">{currentPlan?.displayName || "Free"}</h3>
              <p className="text-muted-foreground">{currentPlan?.description}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-3xl font-bold">
                {formatCurrency(currentPlan?.monthlyPrice || 0)}
              </p>
              <p className="text-sm text-muted-foreground">/month</p>
            </div>
          </div>

          {/* Usage Stats */}
          <div className="grid gap-6 md:grid-cols-3 p-4 rounded-lg bg-muted/50">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Products</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {statsLoading ? (
                    <Skeleton className="h-4 w-16" />
                  ) : (
                    `${stats?.currentProductCount || 0} / ${currentPlan?.productLimit === -1 ? "∞" : currentPlan?.productLimit || 25}`
                  )}
                </span>
              </div>
              <Progress 
                value={currentPlan?.productLimit === -1 ? 10 : ((stats?.currentProductCount || 0) / (currentPlan?.productLimit || 25)) * 100} 
                className="h-2" 
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Orders</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {stats?.totalOrders || 0} / {currentPlan?.orderLimit === -1 ? "∞" : currentPlan?.orderLimit || 50}
                </span>
              </div>
              <Progress 
                value={currentPlan?.orderLimit === -1 ? 10 : ((stats?.totalOrders || 0) / (currentPlan?.orderLimit || 50)) * 100} 
                className="h-2" 
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Team</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  1 / {currentPlan?.teamMemberLimit === -1 ? "∞" : currentPlan?.teamMemberLimit || 1}
                </span>
              </div>
              <Progress 
                value={currentPlan?.teamMemberLimit === -1 ? 10 : (1 / (currentPlan?.teamMemberLimit || 1)) * 100} 
                className="h-2" 
              />
            </div>
          </div>

          {/* Plan Features */}
          {currentPlan && (
            <div className="mt-6 pt-6 border-t">
              <h4 className="text-sm font-medium mb-3">Plan Features</h4>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                <div className="flex items-center gap-2 text-sm">
                  <Sparkles className={`h-4 w-4 ${currentPlan.dailyAdsLimit ? "text-primary" : "text-muted-foreground"}`} />
                  <span>
                    {currentPlan.dailyAdsLimit === -1 
                      ? "Unlimited AI Ads" 
                      : currentPlan.dailyAdsLimit 
                        ? `${currentPlan.dailyAdsLimit} AI Ad${currentPlan.dailyAdsLimit > 1 ? "s" : ""}/day`
                        : "No AI Ads"
                    }
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Video className={`h-4 w-4 ${currentPlan.hasVideoAds ? "text-primary" : "text-muted-foreground"}`} />
                  <span>{currentPlan.hasVideoAds ? "Video Ads Included" : "No Video Ads"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Palette className={`h-4 w-4 ${currentPlan.isWhiteLabel ? "text-primary" : "text-muted-foreground"}`} />
                  <span>{currentPlan.isWhiteLabel ? "White-Label Branding" : "No White-Label"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <HeadphonesIcon className={`h-4 w-4 ${currentPlan.hasVipSupport ? "text-primary" : "text-muted-foreground"}`} />
                  <span>{currentPlan.hasVipSupport ? "VIP Support" : "Standard Support"}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available Plans */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Available Plans</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {availablePlans.map((plan) => {
            const isCurrentPlan = plan.id === currentPlan?.id;
            return (
              <Card
                key={plan.id}
                className={`relative ${plan.isPopular ? "border-primary shadow-lg" : ""} ${
                  isCurrentPlan ? "bg-primary/5 border-primary/50" : ""
                }`}
                data-testid={`card-plan-${plan.slug}`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge 
                      className={
                        plan.badge === "POPULAR" 
                          ? "bg-primary text-primary-foreground" 
                          : plan.badge === "BEST VALUE"
                            ? "bg-amber-500 text-amber-950"
                            : "bg-chart-2 text-white"
                      }
                    >
                      {plan.badge}
                    </Badge>
                  </div>
                )}
                {plan.isPopular && !plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                  </div>
                )}
                <CardHeader className="text-center pt-6">
                  <div className="flex justify-center mb-2 text-primary">
                    {getPlanIcon(plan.name)}
                  </div>
                  <CardTitle>{plan.displayName}</CardTitle>
                  <CardDescription className="min-h-[40px]">{plan.description}</CardDescription>
                  <div className="pt-4">
                    <span className="text-4xl font-bold">{formatCurrency(plan.monthlyPrice)}</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                  {plan.yearlyPrice > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      or {formatCurrency(plan.yearlyPrice)}/year (save 17%)
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 mb-6 text-sm">
                    {(plan.features as string[] || []).slice(0, 6).map((feature, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-chart-2 flex-shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  
                  {/* Special Feature Icons */}
                  <div className="flex items-center justify-center gap-3 py-3 mb-4 border-t border-b">
                    {plan.hasAiAds && (
                      <div className="flex items-center gap-1" title="AI Ads">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span className="text-xs">{plan.dailyAdsLimit === -1 ? "∞" : plan.dailyAdsLimit}</span>
                      </div>
                    )}
                    {plan.hasVideoAds && (
                      <Video className="h-4 w-4 text-primary" title="Video Ads" />
                    )}
                    {plan.isWhiteLabel && (
                      <Palette className="h-4 w-4 text-primary" title="White-Label" />
                    )}
                    {plan.hasVipSupport && (
                      <HeadphonesIcon className="h-4 w-4 text-primary" title="VIP Support" />
                    )}
                    {!plan.hasAiAds && !plan.hasVideoAds && !plan.isWhiteLabel && !plan.hasVipSupport && (
                      <span className="text-xs text-muted-foreground">Basic features</span>
                    )}
                  </div>

                  {isCurrentPlan ? (
                    <Button variant="outline" className="w-full" disabled>
                      Current Plan
                    </Button>
                  ) : (
                    <Button
                      variant={plan.isPopular ? "default" : "outline"}
                      className="w-full gap-2"
                      onClick={() => handleUpgrade(plan.slug)}
                      disabled={upgradeMutation.isPending}
                      data-testid={`button-select-${plan.slug}`}
                    >
                      {plan.monthlyPrice > (currentPlan?.monthlyPrice || 0) ? "Upgrade" : "Select"}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Billing Information */}
      <Card>
        <CardHeader>
          <CardTitle>Billing Information</CardTitle>
          <CardDescription>Your payment method and billing details</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 p-4 rounded-lg border">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                <CreditCard className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">No payment method</p>
                <p className="text-sm text-muted-foreground">Add a payment method to upgrade to paid plans</p>
              </div>
            </div>
            <Button variant="outline" data-testid="button-add-payment">
              Add Payment Method
            </Button>
          </div>
          {subscription?.status === "trial" && (
            <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <Zap className="inline h-4 w-4 mr-1" />
                You're currently on a free trial. Upgrade to a paid plan to access more features and higher limits.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
