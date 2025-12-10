import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  CreditCard,
  Users,
  DollarSign,
  TrendingUp,
  Edit,
  Check,
  X,
  Crown,
  Star,
  Zap,
  Rocket,
  Gift,
} from "lucide-react";
import { useState } from "react";
import { PRICING_PLANS, TRIAL_DAYS } from "@/lib/pricing";

const subscriptionStats = [
  {
    title: "Total Revenue",
    value: "$45,230",
    change: "+12.5%",
    icon: DollarSign,
  },
  {
    title: "Active Subscriptions",
    value: "142",
    change: "+8",
    icon: Users,
  },
  {
    title: "Trial Conversions",
    value: "68%",
    change: "+5.2%",
    icon: TrendingUp,
  },
  {
    title: "MRR",
    value: "$12,450",
    change: "+18.3%",
    icon: CreditCard,
  },
];

const subscribersByPlan = [
  { plan: "Free", count: 89, color: "bg-muted" },
  { plan: "Starter", count: 34, color: "bg-blue-500" },
  { plan: "Growth", count: 45, color: "bg-chart-2" },
  { plan: "Professional", count: 28, color: "bg-purple-500" },
  { plan: "Millionaire", count: 12, color: "bg-amber-500" },
  { plan: "FREE FOR LIFE", count: 3, color: "bg-primary" },
];

const recentSubscriptions = [
  { id: 1, merchant: "Tech Store Pro", plan: "Professional", status: "active", amount: "$99/mo", date: "2024-12-10" },
  { id: 2, merchant: "Fashion Hub", plan: "Growth", status: "active", amount: "$49/mo", date: "2024-12-09" },
  { id: 3, merchant: "Home Essentials", plan: "Starter", status: "trial", amount: "$29/mo", date: "2024-12-08" },
  { id: 4, merchant: "Sports Gear", plan: "Millionaire", status: "active", amount: "$249/mo", date: "2024-12-07" },
  { id: 5, merchant: "Beauty Plus", plan: "Growth", status: "cancelled", amount: "$49/mo", date: "2024-12-06" },
];

export default function AdminPlans() {
  const [editingPlan, setEditingPlan] = useState<string | null>(null);

  const getPlanIcon = (planId: string) => {
    switch (planId) {
      case "free": return Gift;
      case "starter": return Zap;
      case "growth": return Rocket;
      case "professional": return Star;
      case "millionaire": return Crown;
      default: return CreditCard;
    }
  };

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-plans-title">Plans & Billing</h1>
          <p className="text-muted-foreground">Manage subscription plans and billing</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="gap-1">
            <Check className="h-3 w-3 text-chart-2" />
            {TRIAL_DAYS}-Day Trial Active
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {subscriptionStats.map((stat) => (
          <Card key={stat.title} data-testid={`card-stat-${stat.title.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-chart-2">{stat.change} from last month</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" data-testid="card-subscription-plans">
          <CardHeader>
            <CardTitle>Subscription Plans</CardTitle>
            <CardDescription>Configure pricing and features for each plan</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {PRICING_PLANS.map((plan) => {
                const PlanIcon = getPlanIcon(plan.id);
                return (
                  <div 
                    key={plan.id}
                    className="flex items-center justify-between p-4 rounded-lg border"
                    data-testid={`plan-row-${plan.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                        plan.id === "millionaire" ? "bg-amber-500/20" : "bg-primary/10"
                      }`}>
                        <PlanIcon className={`h-5 w-5 ${
                          plan.id === "millionaire" ? "text-amber-500" : "text-primary"
                        }`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{plan.name}</h3>
                          {plan.popular && <Badge>Popular</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {plan.productLimit === -1 ? "Unlimited" : plan.productLimit} products, {plan.orderLimit === -1 ? "Unlimited" : plan.orderLimit} orders
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="font-bold">${plan.price}</div>
                        <div className="text-xs text-muted-foreground">/{plan.period}</div>
                      </div>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="ghost" data-testid={`button-edit-${plan.id}`}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Edit {plan.name} Plan</DialogTitle>
                            <DialogDescription>
                              Update pricing and limits for this plan
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="grid gap-2">
                              <Label>Monthly Price ($)</Label>
                              <Input type="number" defaultValue={plan.price} />
                            </div>
                            <div className="grid gap-2">
                              <Label>Product Limit</Label>
                              <Input type="number" defaultValue={plan.productLimit === -1 ? "" : plan.productLimit} placeholder="Leave empty for unlimited" />
                            </div>
                            <div className="grid gap-2">
                              <Label>Order Limit</Label>
                              <Input type="number" defaultValue={plan.orderLimit === -1 ? "" : plan.orderLimit} placeholder="Leave empty for unlimited" />
                            </div>
                            <div className="flex items-center justify-between">
                              <Label>Active</Label>
                              <Switch defaultChecked />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline">Cancel</Button>
                            <Button>Save Changes</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-subscribers-by-plan">
          <CardHeader>
            <CardTitle>Subscribers by Plan</CardTitle>
            <CardDescription>Distribution of active subscribers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {subscribersByPlan.map((item) => (
                <div key={item.plan} className="flex items-center gap-3">
                  <div className={`h-3 w-3 rounded-full ${item.color}`} />
                  <div className="flex-1">
                    <div className="flex justify-between text-sm">
                      <span>{item.plan}</span>
                      <span className="font-medium">{item.count}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted mt-1">
                      <div 
                        className={`h-full rounded-full ${item.color}`}
                        style={{ width: `${(item.count / 89) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-recent-subscriptions">
        <CardHeader>
          <CardTitle>Recent Subscriptions</CardTitle>
          <CardDescription>Latest subscription activity</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Merchant</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentSubscriptions.map((sub) => (
                <TableRow key={sub.id} data-testid={`row-subscription-${sub.id}`}>
                  <TableCell className="font-medium">{sub.merchant}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{sub.plan}</Badge>
                  </TableCell>
                  <TableCell>
                    {sub.status === "active" && (
                      <Badge className="bg-chart-2/20 text-chart-2 border-chart-2/30">Active</Badge>
                    )}
                    {sub.status === "trial" && (
                      <Badge variant="secondary">Trial</Badge>
                    )}
                    {sub.status === "cancelled" && (
                      <Badge variant="destructive">Cancelled</Badge>
                    )}
                  </TableCell>
                  <TableCell>{sub.amount}</TableCell>
                  <TableCell className="text-muted-foreground">{sub.date}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
