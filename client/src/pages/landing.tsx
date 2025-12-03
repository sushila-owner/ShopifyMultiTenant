import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  ShoppingCart,
  Package,
  TrendingUp,
  Users,
  Globe,
  Zap,
  Shield,
  BarChart3,
  Check,
  ArrowRight,
  Truck,
  CreditCard,
} from "lucide-react";
import { SiShopify } from "react-icons/si";
import logoImage from "@assets/F66C5CC9-75FA-449A-AAF8-3CBF0FAC2486_1764749832622.png";

const features = [
  {
    icon: Package,
    title: "Global Product Catalog",
    description: "Access thousands of products from verified suppliers worldwide. Import with one click.",
  },
  {
    icon: Zap,
    title: "One-Click Import",
    description: "Import products directly to your Shopify store. Set custom pricing rules automatically.",
  },
  {
    icon: Truck,
    title: "Auto-Fulfillment",
    description: "Orders automatically fulfilled through suppliers. Real-time tracking updates.",
  },
  {
    icon: TrendingUp,
    title: "Smart Analytics",
    description: "Track sales, profits, and trending products. Make data-driven decisions.",
  },
  {
    icon: Users,
    title: "Team Management",
    description: "Invite staff with role-based permissions. Control who can access what.",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description: "Bank-grade encryption, secure OAuth, and complete data isolation.",
  },
];

const plans = [
  {
    name: "Free",
    price: 0,
    period: "forever",
    description: "Get started with dropshipping",
    badge: null,
    features: ["25 Products", "50 Orders/month", "1 Team Member", "Basic Analytics", "Email Support"],
    popular: false,
  },
  {
    name: "Starter",
    price: 29,
    period: "month",
    description: "For growing businesses",
    badge: null,
    features: ["100 Products", "500 Orders/month", "3 Team Members", "1 AI Ad/day", "Priority Support"],
    popular: false,
  },
  {
    name: "Growth",
    price: 49,
    period: "month",
    description: "Scale your business faster",
    badge: null,
    features: ["250 Products", "1,500 Orders/month", "5 Team Members", "2 AI Ads/day", "Chat Support"],
    popular: true,
  },
  {
    name: "Professional",
    price: 99,
    period: "month",
    description: "For serious dropshippers",
    badge: "POPULAR",
    features: ["1,000 Products", "5,000 Orders/month", "10 Team Members", "3 AI Ads/day", "Video Ads", "API Access"],
    popular: false,
  },
  {
    name: "Millionaire",
    price: 499,
    period: "month",
    description: "Enterprise-grade features",
    badge: "FUTURE MILLIONAIRE CHOICE",
    features: ["Unlimited Products", "Unlimited Orders", "Unlimited Team", "5 AI Ads/day", "White-Label", "VIP Support", "Dedicated Manager"],
    popular: false,
  },
];

const stats = [
  { value: "10K+", label: "Active Merchants" },
  { value: "500K+", label: "Products Listed" },
  { value: "$50M+", label: "Orders Processed" },
  { value: "99.9%", label: "Uptime" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-8">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer" data-testid="link-logo">
              <img src={logoImage} alt="Apex Mart" className="h-9 w-9 rounded-md object-cover" />
              <span className="text-xl font-bold">Apex Mart</span>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-features">
              Features
            </a>
            <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-pricing">
              Pricing
            </a>
            <a href="#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-how-it-works">
              How It Works
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/login">
              <Button variant="ghost" data-testid="button-login">Log In</Button>
            </Link>
            <Link href="/register">
              <Button data-testid="button-get-started">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="container mx-auto px-4 md:px-8 py-20 md:py-32">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border bg-background px-4 py-1.5 text-sm">
                <SiShopify className="h-4 w-4 text-[#95BF47]" />
                <span className="text-muted-foreground">Official Shopify Partner</span>
              </div>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
                The Wholesale Marketplace for{" "}
                <span className="text-primary">Shopify Merchants</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-xl">
                Connect with verified suppliers, import products with one click, and automate your
                order fulfillment. Scale your e-commerce business effortlessly.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link href="/register">
                  <Button size="lg" className="gap-2" data-testid="button-hero-start-free">
                    Start Free Trial
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <a href="#how-it-works">
                  <Button size="lg" variant="outline" data-testid="button-hero-see-how">
                    See How It Works
                  </Button>
                </a>
              </div>
              <div className="flex flex-wrap items-center gap-6 pt-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-chart-2" />
                  <span>14-day free trial</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-chart-2" />
                  <span>No credit card required</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-chart-2" />
                  <span>Cancel anytime</span>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="relative rounded-xl border bg-card p-2 shadow-2xl">
                <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-chart-3/20 to-chart-2/20 rounded-2xl blur-2xl opacity-50" />
                <div className="relative rounded-lg bg-gradient-to-br from-sidebar via-sidebar to-muted p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-md bg-primary/20 flex items-center justify-center">
                        <BarChart3 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Dashboard</p>
                        <p className="text-xs text-muted-foreground">Merchant Overview</p>
                      </div>
                    </div>
                    <Badge variant="secondary">Live</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    {[
                      { label: "Revenue", value: "$24,580", change: "+12.5%" },
                      { label: "Orders", value: "342", change: "+8.2%" },
                      { label: "Products", value: "1,284", change: "+45" },
                      { label: "Customers", value: "892", change: "+23" },
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-md bg-background/50 p-3">
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                        <p className="text-lg font-semibold">{stat.value}</p>
                        <p className="text-xs text-chart-2">{stat.change}</p>
                      </div>
                    ))}
                  </div>
                  <div className="h-32 rounded-md bg-background/30 flex items-end justify-around px-4 pb-4">
                    {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
                      <div
                        key={i}
                        className="w-6 rounded-t bg-gradient-to-t from-primary to-primary/50"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-y bg-muted/30">
        <div className="container mx-auto px-4 md:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-3xl md:text-4xl font-bold text-primary">{stat.value}</p>
                <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 md:py-32">
        <div className="container mx-auto px-4 md:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold sm:text-4xl mb-4">
              Everything You Need to Scale
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              From product sourcing to order fulfillment, we've got you covered with powerful
              tools designed for Shopify merchants.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <Card key={feature.title} className="hover-elevate">
                <CardContent className="p-6">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 md:py-32 bg-muted/30">
        <div className="container mx-auto px-4 md:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold sm:text-4xl mb-4">
              How It Works
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Get started in minutes. Connect your store, import products, and start selling.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                step: "1",
                icon: SiShopify,
                title: "Connect Your Store",
                description: "Securely connect your Shopify store with just one click. We use OAuth for maximum security.",
              },
              {
                step: "2",
                icon: ShoppingCart,
                title: "Import Products",
                description: "Browse our catalog of verified suppliers. Import products with custom pricing rules.",
              },
              {
                step: "3",
                icon: CreditCard,
                title: "Start Selling",
                description: "Orders are automatically fulfilled through suppliers. Track everything in real-time.",
              },
            ].map((item) => (
              <div key={item.step} className="relative text-center">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground mb-6">
                  {item.step}
                </div>
                <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <item.icon className="h-7 w-7 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                <p className="text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 md:py-32">
        <div className="container mx-auto px-4 md:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold sm:text-4xl mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Choose the plan that fits your business. Upgrade or downgrade anytime.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 max-w-7xl mx-auto">
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={`relative ${plan.popular ? "border-primary shadow-lg" : ""} ${plan.badge === "FUTURE MILLIONAIRE CHOICE" ? "border-amber-500 shadow-lg" : ""}`}
                data-testid={`card-plan-${plan.name.toLowerCase()}`}
              >
                {plan.popular && !plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                  </div>
                )}
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className={plan.badge === "FUTURE MILLIONAIRE CHOICE" ? "bg-amber-500 text-amber-950 whitespace-nowrap text-xs" : "bg-primary text-primary-foreground"}>
                      {plan.badge}
                    </Badge>
                  </div>
                )}
                <CardContent className="p-6 pt-8">
                  <h3 className="text-xl font-semibold mb-2">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{plan.description}</p>
                  <div className="mb-6">
                    <span className="text-4xl font-bold">${plan.price}</span>
                    <span className="text-muted-foreground">/{plan.period}</span>
                  </div>
                  <Link href="/register">
                    <Button
                      className={`w-full mb-6 ${plan.badge === "FUTURE MILLIONAIRE CHOICE" ? "bg-amber-500 hover:bg-amber-600 text-amber-950" : ""}`}
                      variant={plan.popular ? "default" : "outline"}
                      data-testid={`button-plan-${plan.name.toLowerCase()}`}
                    >
                      {plan.price === 0 ? "Start Free" : "Get Started"}
                    </Button>
                  </Link>
                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-chart-2 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-32 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 md:px-8 text-center">
          <h2 className="text-3xl font-bold sm:text-4xl mb-4">
            Ready to Scale Your Business?
          </h2>
          <p className="text-xl opacity-90 max-w-2xl mx-auto mb-8">
            Join thousands of merchants who are already growing their businesses with Apex Mart.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/register">
              <Button size="lg" variant="secondary" className="gap-2" data-testid="button-cta-start">
                Start Your Free Trial
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="container mx-auto px-4 md:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <img src={logoImage} alt="Apex Mart" className="h-8 w-8 rounded-md object-cover" />
                <span className="text-lg font-bold">Apex Mart</span>
              </div>
              <p className="text-sm text-muted-foreground">
                The wholesale marketplace for Shopify merchants.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Integrations</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">About</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Careers</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">Privacy</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Terms</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Security</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Apex Mart Wholesale. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <Globe className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Available Worldwide</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
