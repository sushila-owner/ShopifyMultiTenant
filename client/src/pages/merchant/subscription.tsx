import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useEffect } from "react";
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
  ExternalLink,
  Loader2,
} from "lucide-react";
import type { Plan, Subscription } from "@shared/schema";
import { useCurrency } from "@/lib/currency";

interface SubscriptionData {
  subscription: Subscription | null;
  currentPlan: Plan | null;
  availablePlans: Plan[];
  freeForLifePlan: Plan | null;
  freeForLifeThreshold: number;
}

interface StripePlan {
  id: string;
  name: string;
  description: string;
  slug: string;
  productLimit: number;
  features: Record<string, string>;
  monthlyPriceId?: string;
  monthlyAmount: number;
  yearlyPriceId?: string;
  yearlyAmount: number;
}

export default function SubscriptionPage() {
  const { toast } = useToast();
  const [location] = useLocation();
  
  // Check for success/canceled URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      toast({
        title: "Subscription Updated",
        description: "Your subscription has been updated successfully!",
      });
      // Clean up URL
      window.history.replaceState({}, '', '/merchant/subscription');
      // Refresh subscription data
      queryClient.invalidateQueries({ queryKey: ["/api/stripe/subscription"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/subscription"] });
    } else if (params.get('canceled') === 'true') {
      toast({
        title: "Checkout Canceled",
        description: "You can upgrade anytime when you're ready.",
        variant: "destructive",
      });
      window.history.replaceState({}, '', '/merchant/subscription');
    }
  }, [location, toast]);

  const { data, isLoading } = useQuery<SubscriptionData>({
    queryKey: ["/api/merchant/subscription"],
  });

  const { data: stripePlansData, isLoading: stripePlansLoading } = useQuery<StripePlan[]>({
    queryKey: ["/api/stripe/plans"],
  });

  const { data: stripeSubData, isLoading: stripeSubLoading } = useQuery<{ 
    merchant: any; 
    subscription: any; 
    plan: any; 
    stripeSubscription: any;
  }>({
    queryKey: ["/api/stripe/subscription"],
  });

  const { data: statsData, isLoading: statsLoading } = useQuery<{
    currentProductCount: number;
    productLimit: number;
    totalOrders: number;
  }>({
    queryKey: ["/api/merchant/stats"],
  });

  const checkoutMutation = useMutation({
    mutationFn: async ({ priceId }: { priceId: string }) => {
      const response = await apiRequest("POST", "/api/stripe/checkout", { priceId });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.data?.url) {
        window.location.href = data.data.url;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Checkout Failed",
        description: error.message || "Failed to start checkout",
        variant: "destructive",
      });
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/stripe/portal", {});
      return response.json();
    },
    onSuccess: (data) => {
      if (data.data?.url) {
        window.location.href = data.data.url;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Portal Error",
        description: error.message || "Failed to open billing portal",
        variant: "destructive",
      });
    },
  });

  const subscription = data?.subscription;
  const currentPlan = data?.currentPlan;
  const availablePlans = data?.availablePlans || [];
  const stripePlans = stripePlansData || [];
  const freeForLifeThreshold = data?.freeForLifeThreshold || 100000000;
  const stats = statsData;
  const stripeSubscription = stripeSubData?.stripeSubscription;
  const merchantStripeData = stripeSubData?.merchant;

  const lifetimeSales = subscription?.lifetimeSales || 0;
  const progressToFreeForLife = Math.min((lifetimeSales / freeForLifeThreshold) * 100, 100);
  const isFreeForLife = subscription?.status === "free_for_life";
  const { formatPrice } = useCurrency();

  const formatCurrency = (cents: number) => {
    return formatPrice(cents / 100);
  };

  const getPlanIcon = (planName: string) => {
    const name = planName.toLowerCase();
    if (name.includes("free") && !name.includes("life")) return <Package className="h-7 w-7" />;
    if (name.includes("starter")) return <Zap className="h-7 w-7" />;
    if (name.includes("growth")) return <TrendingUp className="h-7 w-7" />;
    if (name.includes("professional")) return <Star className="h-7 w-7" />;
    if (name.includes("millionaire")) return <Crown className="h-7 w-7" />;
    if (name.includes("life")) return <Trophy className="h-7 w-7" />;
    return <Package className="h-7 w-7" />;
  };

  const handleCheckout = (priceId: string) => {
    checkoutMutation.mutate({ priceId });
  };

  const handleManageSubscription = () => {
    portalMutation.mutate();
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
              variant={stripeSubscription?.status === "active" || subscription?.status === "active" || subscription?.status === "free_for_life" ? "default" : "outline"}
              className={subscription?.status === "free_for_life" ? "bg-amber-500 text-amber-950" : ""}
            >
              {stripeSubscription?.status || subscription?.status || "trial"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {getPlanIcon(currentPlan?.name || "free")}
            </div>
            <div>
              <h3 className="text-2xl font-bold">{currentPlan?.displayName || "Free Trial"}</h3>
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

      {/* Promotional Banner */}
      <div className="p-6 rounded-xl border-2 border-amber-400 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30">
        <p className="text-center text-lg font-medium text-slate-700 dark:text-slate-200" data-testid="text-promo-banner">
          When your sales reach <span className="font-bold text-amber-600 dark:text-amber-400">$1M</span>, All plans become{" "}
          <span className="font-bold text-amber-600 dark:text-amber-400">FREE FOR LIFE</span>. Choose wisely!
        </p>
      </div>

      {/* All Available Plans */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Available Plans</h2>
        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-80" />
            ))}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {availablePlans
              .filter((plan: Plan) => plan.name?.toLowerCase() !== 'free_for_life')
              .sort((a: Plan, b: Plan) => (a.monthlyPrice || 0) - (b.monthlyPrice || 0))
              .map((plan: Plan) => {
                const isPopular = plan.slug === 'growth' || plan.slug === 'professional';
                const currentSlug = currentPlan?.slug || currentPlan?.name?.toLowerCase();
                const isCurrentPlan = plan.slug === currentSlug || plan.id === currentPlan?.id;
                const stripePlan = stripePlans.find((sp: StripePlan) => sp.slug === plan.slug);
                const isFree = (plan.monthlyPrice || 0) === 0;
                
                return (
                  <Card
                    key={plan.id}
                    className={`relative ${isPopular ? "border-primary shadow-lg" : ""} ${
                      isCurrentPlan ? "bg-primary/5 border-primary/50" : ""
                    }`}
                    data-testid={`card-plan-${plan.slug || plan.id}`}
                  >
                    {isPopular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-primary text-primary-foreground">Popular</Badge>
                      </div>
                    )}
                    <CardHeader className="text-center pt-6">
                      <div className="flex justify-center mb-2 text-primary">
                        {getPlanIcon(plan.name || plan.displayName || "free")}
                      </div>
                      <CardTitle>{plan.displayName || plan.name}</CardTitle>
                      <CardDescription className="min-h-[40px]">{plan.description}</CardDescription>
                      <div className="pt-4">
                        <span className="text-4xl font-bold">
                          {isFree ? "Free" : formatCurrency(plan.monthlyPrice || 0)}
                        </span>
                        {!isFree && <span className="text-muted-foreground">/month</span>}
                      </div>
                      {stripePlan?.yearlyAmount && stripePlan.yearlyAmount > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          or {formatCurrency(stripePlan.yearlyAmount)}/year (save 17%)
                        </p>
                      )}
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2 mb-6 text-sm">
                        <li className="flex items-start gap-2">
                          <Check className="h-4 w-4 text-chart-2 flex-shrink-0 mt-0.5" />
                          <span>
                            {plan.productLimit === -1 ? "Unlimited products" : `Up to ${(plan.productLimit || 25).toLocaleString()} products`}
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="h-4 w-4 text-chart-2 flex-shrink-0 mt-0.5" />
                          <span>
                            {plan.orderLimit === -1 ? "Unlimited orders" : `Up to ${(plan.orderLimit || 50).toLocaleString()} orders/month`}
                          </span>
                        </li>
                        {plan.dailyAdsLimit && plan.dailyAdsLimit > 0 && (
                          <li className="flex items-start gap-2">
                            <Check className="h-4 w-4 text-chart-2 flex-shrink-0 mt-0.5" />
                            <span>
                              {plan.dailyAdsLimit === -1 ? "Unlimited AI ads" : `${plan.dailyAdsLimit} AI ads/day`}
                            </span>
                          </li>
                        )}
                        {plan.hasVideoAds && (
                          <li className="flex items-start gap-2">
                            <Check className="h-4 w-4 text-chart-2 flex-shrink-0 mt-0.5" />
                            <span>Video ad generation</span>
                          </li>
                        )}
                        {plan.isWhiteLabel && (
                          <li className="flex items-start gap-2">
                            <Check className="h-4 w-4 text-chart-2 flex-shrink-0 mt-0.5" />
                            <span>White-label branding</span>
                          </li>
                        )}
                        {plan.hasVipSupport && (
                          <li className="flex items-start gap-2">
                            <Check className="h-4 w-4 text-chart-2 flex-shrink-0 mt-0.5" />
                            <span>VIP Support</span>
                          </li>
                        )}
                      </ul>
                      
                      {isCurrentPlan ? (
                        <Button variant="outline" className="w-full" disabled>
                          Current Plan
                        </Button>
                      ) : isFree ? (
                        <Button variant="outline" className="w-full" disabled>
                          Free Tier
                        </Button>
                      ) : (
                        <Button
                          variant={isPopular ? "default" : "outline"}
                          className="w-full gap-2"
                          onClick={() => stripePlan?.monthlyPriceId && handleCheckout(stripePlan.monthlyPriceId)}
                          disabled={checkoutMutation.isPending || !stripePlan?.monthlyPriceId}
                          data-testid={`button-select-${plan.slug || plan.id}`}
                        >
                          {checkoutMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              {stripePlan?.monthlyPriceId ? "Subscribe" : "Contact Sales"}
                              <ArrowRight className="h-4 w-4" />
                            </>
                          )}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        )}
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
                {merchantStripeData?.stripeCustomerId ? (
                  <>
                    <p className="font-medium">Payment method on file</p>
                    <p className="text-sm text-muted-foreground">Manage your subscription in the billing portal</p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">No payment method</p>
                    <p className="text-sm text-muted-foreground">Subscribe to a plan to add a payment method</p>
                  </>
                )}
              </div>
            </div>
            {merchantStripeData?.stripeCustomerId && (
              <Button 
                variant="outline" 
                onClick={handleManageSubscription}
                disabled={portalMutation.isPending}
                data-testid="button-manage-billing"
              >
                {portalMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <ExternalLink className="h-4 w-4 mr-2" />
                )}
                Manage Billing
              </Button>
            )}
          </div>
          {stripeSubscription && (
            <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <p className="text-sm text-green-800 dark:text-green-200">
                <Check className="inline h-4 w-4 mr-1" />
                Active subscription - Next billing date: {new Date(stripeSubscription.currentPeriodEnd * 1000).toLocaleDateString()}
                {stripeSubscription.cancelAtPeriodEnd && " (Cancels at end of period)"}
              </p>
            </div>
          )}
          {subscription?.status === "trial" && !stripeSubscription && (
            <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <Zap className="inline h-4 w-4 mr-1" />
                You're currently on a free trial. Subscribe to a paid plan to access more features and higher limits.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
