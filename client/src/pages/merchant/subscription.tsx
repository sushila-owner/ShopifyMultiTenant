import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  Check,
  CreditCard,
  Zap,
  Package,
  ShoppingCart,
  Users,
  ArrowRight,
} from "lucide-react";
import type { Plan } from "@shared/schema";

const plans: Plan[] = [
  {
    id: "free",
    name: "free",
    displayName: "Free",
    description: "Perfect for getting started",
    pricing: { setupFee: 0, monthly: 0, yearly: 0, yearlyDiscount: 0 },
    limits: { products: 50, orders: 100, teamMembers: 1, suppliers: 1, apiCallsPerDay: 100, storageGB: 1 },
    features: ["50 Products", "100 Orders/month", "1 Team Member", "Basic Analytics", "Email Support"],
    isPopular: false,
    isActive: true,
    sortOrder: 0,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "starter",
    name: "starter",
    displayName: "Starter",
    description: "For growing businesses",
    pricing: { setupFee: 0, monthly: 29, yearly: 290, yearlyDiscount: 17 },
    limits: { products: 500, orders: 1000, teamMembers: 3, suppliers: 5, apiCallsPerDay: 1000, storageGB: 5 },
    features: ["500 Products", "1,000 Orders/month", "3 Team Members", "Advanced Analytics", "Priority Support", "Custom Pricing Rules"],
    isPopular: false,
    isActive: true,
    sortOrder: 1,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "pro",
    name: "professional",
    displayName: "Professional",
    description: "For scaling operations",
    pricing: { setupFee: 0, monthly: 79, yearly: 790, yearlyDiscount: 17 },
    limits: { products: 5000, orders: 10000, teamMembers: 10, suppliers: -1, apiCallsPerDay: 10000, storageGB: 20 },
    features: ["5,000 Products", "10,000 Orders/month", "10 Team Members", "Full Analytics Suite", "24/7 Support", "API Access", "White Label"],
    isPopular: true,
    isActive: true,
    sortOrder: 2,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "enterprise",
    name: "enterprise",
    displayName: "Enterprise",
    description: "For large-scale operations",
    pricing: { setupFee: 0, monthly: 199, yearly: 1990, yearlyDiscount: 17 },
    limits: { products: -1, orders: -1, teamMembers: -1, suppliers: -1, apiCallsPerDay: -1, storageGB: -1 },
    features: ["Unlimited Products", "Unlimited Orders", "Unlimited Team", "Custom Integrations", "Dedicated Manager", "SLA Guarantee", "Custom Features"],
    isPopular: false,
    isActive: true,
    sortOrder: 3,
    createdAt: "",
    updatedAt: "",
  },
];

export default function SubscriptionPage() {
  const { user } = useAuth();
  
  const { data: stats, isLoading } = useQuery<{
    currentProductCount: number;
    productLimit: number;
    totalOrders: number;
  }>({
    queryKey: ["/api/merchants/stats"],
  });

  const currentPlan = plans.find((p) => p.name === "starter") || plans[1];
  const productUsage = stats ? (stats.currentProductCount / stats.productLimit) * 100 : 0;

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-subscription-title">Subscription</h1>
          <p className="text-muted-foreground">Manage your plan and billing</p>
        </div>
      </div>

      {/* Current Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>Your subscription details</CardDescription>
            </div>
            <Badge variant={user?.merchant?.subscriptionStatus === "active" ? "default" : "outline"}>
              {user?.merchant?.subscriptionStatus || "trial"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10">
              <Zap className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h3 className="text-2xl font-bold">{currentPlan.displayName}</h3>
              <p className="text-muted-foreground">{currentPlan.description}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-3xl font-bold">${currentPlan.pricing.monthly}</p>
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
                  {isLoading ? (
                    <Skeleton className="h-4 w-16" />
                  ) : (
                    `${stats?.currentProductCount || 0} / ${stats?.productLimit || 50}`
                  )}
                </span>
              </div>
              <Progress value={productUsage} className="h-2" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Orders</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {stats?.totalOrders || 0} / {currentPlan.limits.orders}
                </span>
              </div>
              <Progress value={((stats?.totalOrders || 0) / currentPlan.limits.orders) * 100} className="h-2" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Team</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  1 / {currentPlan.limits.teamMembers}
                </span>
              </div>
              <Progress value={(1 / currentPlan.limits.teamMembers) * 100} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Available Plans */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Available Plans</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => {
            const isCurrentPlan = plan.name === currentPlan.name;
            return (
              <Card
                key={plan.id}
                className={`relative ${plan.isPopular ? "border-primary" : ""} ${
                  isCurrentPlan ? "bg-primary/5" : ""
                }`}
                data-testid={`card-plan-${plan.name}`}
              >
                {plan.isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                  </div>
                )}
                <CardHeader className="text-center">
                  <CardTitle>{plan.displayName}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="pt-4">
                    <span className="text-4xl font-bold">${plan.pricing.monthly}</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3 mb-6">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-chart-2 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {isCurrentPlan ? (
                    <Button variant="outline" className="w-full" disabled>
                      Current Plan
                    </Button>
                  ) : (
                    <Button
                      variant={plan.isPopular ? "default" : "outline"}
                      className="w-full gap-2"
                      data-testid={`button-select-${plan.name}`}
                    >
                      {plan.pricing.monthly > currentPlan.pricing.monthly ? "Upgrade" : "Downgrade"}
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
          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                <CreditCard className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">No payment method</p>
                <p className="text-sm text-muted-foreground">Add a payment method to upgrade</p>
              </div>
            </div>
            <Button variant="outline" data-testid="button-add-payment">
              Add Payment Method
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
