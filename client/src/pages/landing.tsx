import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GlobeSettings, CurrencyDisplay } from "@/components/globe-settings";
import { useI18n } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
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
  Menu,
  X,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetClose, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useState } from "react";
import { SiShopify } from "react-icons/si";
import logoImage from "@assets/F66C5CC9-75FA-449A-AAF8-3CBF0FAC2486_1764749832622.png";

type PlanConfig = {
  id: string;
  nameKey: string;
  price: number;
  period: "forever" | "month";
  descriptionKey: string;
  badge: null | "popular" | "millionaire";
  featureKeys: string[];
  popular: boolean;
  freeForLife: boolean;
};

const planConfigs: PlanConfig[] = [
  {
    id: "free",
    nameKey: "pricing.free",
    price: 0,
    period: "forever",
    descriptionKey: "pricing.freeDescription",
    badge: null,
    featureKeys: ["pricing.features.products25", "pricing.features.orders50", "pricing.features.team1", "pricing.features.basicAnalytics", "pricing.features.emailSupport"],
    popular: false,
    freeForLife: false,
  },
  {
    id: "starter",
    nameKey: "pricing.starter",
    price: 29,
    period: "month",
    descriptionKey: "pricing.starterDescription",
    badge: null,
    featureKeys: ["pricing.features.products100", "pricing.features.orders500", "pricing.features.team3", "pricing.features.aiAd1", "pricing.features.prioritySupport"],
    popular: false,
    freeForLife: true,
  },
  {
    id: "growth",
    nameKey: "pricing.growth",
    price: 49,
    period: "month",
    descriptionKey: "pricing.growthDescription",
    badge: null,
    featureKeys: ["pricing.features.products250", "pricing.features.orders1500", "pricing.features.team5", "pricing.features.aiAd2", "pricing.features.chatSupport"],
    popular: true,
    freeForLife: true,
  },
  {
    id: "professional",
    nameKey: "pricing.professional",
    price: 99,
    period: "month",
    descriptionKey: "pricing.professionalDescription",
    badge: "popular",
    featureKeys: ["pricing.features.products1000", "pricing.features.orders5000", "pricing.features.team10", "pricing.features.aiAd3", "pricing.features.videoAds", "pricing.features.apiAccess"],
    popular: false,
    freeForLife: true,
  },
  {
    id: "millionaire",
    nameKey: "pricing.millionaire",
    price: 259,
    period: "month",
    descriptionKey: "pricing.millionaireDescription",
    badge: "millionaire",
    featureKeys: ["pricing.features.unlimitedProducts", "pricing.features.unlimitedOrders", "pricing.features.unlimitedTeam", "pricing.features.aiAd5", "pricing.features.whiteLabel", "pricing.features.vipSupport", "pricing.features.dedicatedManager"],
    popular: false,
    freeForLife: true,
  },
];

export default function LandingPage() {
  const { t } = useI18n();
  const { formatPrice } = useCurrency();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-2">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" data-testid="button-mobile-menu">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] sm:w-[320px]">
                <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                <SheetDescription className="sr-only">Main navigation links for Apex Mart Wholesale</SheetDescription>
                <div className="flex flex-col h-full">
                  <div className="flex items-center gap-3 pb-6 border-b">
                    <img 
                      src={logoImage} 
                      alt="Apex Mart Wholesale" 
                      className="h-10 w-10 rounded-lg object-cover" 
                    />
                    <div>
                      <span className="text-lg font-bold">Apex Mart</span>
                      <span className="text-lg font-bold text-primary ml-1">Wholesale</span>
                    </div>
                  </div>
                  <nav className="flex flex-col gap-2 py-6">
                    <SheetClose asChild>
                      <a 
                        href="#features" 
                        className="flex items-center gap-3 px-3 py-2.5 rounded-md text-base font-medium hover:bg-accent transition-colors"
                        data-testid="mobile-link-features"
                      >
                        <Zap className="h-5 w-5 text-muted-foreground" />
                        {t("nav.features")}
                      </a>
                    </SheetClose>
                    <SheetClose asChild>
                      <a 
                        href="#pricing" 
                        className="flex items-center gap-3 px-3 py-2.5 rounded-md text-base font-medium hover:bg-accent transition-colors"
                        data-testid="mobile-link-pricing"
                      >
                        <CreditCard className="h-5 w-5 text-muted-foreground" />
                        {t("nav.pricing")}
                      </a>
                    </SheetClose>
                    <SheetClose asChild>
                      <a 
                        href="#how-it-works" 
                        className="flex items-center gap-3 px-3 py-2.5 rounded-md text-base font-medium hover:bg-accent transition-colors"
                        data-testid="mobile-link-how-it-works"
                      >
                        <BarChart3 className="h-5 w-5 text-muted-foreground" />
                        {t("nav.howItWorks")}
                      </a>
                    </SheetClose>
                  </nav>
                  <div className="mt-auto pt-6 border-t space-y-3">
                    <SheetClose asChild>
                      <Link href="/login">
                        <Button variant="outline" className="w-full" data-testid="mobile-button-login">
                          {t("nav.login")}
                        </Button>
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link href="/register">
                        <Button className="w-full" data-testid="mobile-button-get-started">
                          {t("nav.getStarted")}
                        </Button>
                      </Link>
                    </SheetClose>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            
            <Link href="/">
              <div className="flex items-center gap-3 cursor-pointer group" data-testid="link-logo">
                <img 
                  src={logoImage} 
                  alt="Apex Mart Wholesale" 
                  className="h-10 w-10 rounded-lg object-cover shadow-sm ring-1 ring-border/50 group-hover:ring-primary/30 transition-all" 
                />
                <div className="hidden sm:block">
                  <span className="text-lg font-bold tracking-tight">Apex Mart</span>
                  <span className="text-lg font-bold tracking-tight text-primary ml-1">Wholesale</span>
                </div>
              </div>
            </Link>
          </div>
          
          <nav className="hidden lg:flex items-center gap-8">
            <a 
              href="#features" 
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors relative after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 hover:after:w-full after:bg-primary after:transition-all" 
              data-testid="link-features"
            >
              {t("nav.features")}
            </a>
            <a 
              href="#pricing" 
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors relative after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 hover:after:w-full after:bg-primary after:transition-all" 
              data-testid="link-pricing"
            >
              {t("nav.pricing")}
            </a>
            <a 
              href="#how-it-works" 
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors relative after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 hover:after:w-full after:bg-primary after:transition-all" 
              data-testid="link-how-it-works"
            >
              {t("nav.howItWorks")}
            </a>
          </nav>

          <div className="flex items-center gap-1 md:gap-2">
            <GlobeSettings />
            <div className="hidden sm:flex items-center">
              <CurrencyDisplay />
            </div>
            <div className="h-5 w-px bg-border mx-1 hidden md:block" />
            <Link href="/login">
              <Button 
                variant="ghost" 
                size="sm"
                className="font-medium hidden md:flex"
                data-testid="button-login"
              >
                {t("nav.login")}
              </Button>
            </Link>
            <Link href="/register">
              <Button 
                size="sm"
                className="font-medium shadow-sm hidden sm:flex"
                data-testid="button-get-started"
              >
                {t("nav.getStarted")}
              </Button>
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
                <span className="text-muted-foreground">{t("hero.badge")}</span>
              </div>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
                {t("hero.title")}{" "}
                <span className="text-primary">{t("hero.titleHighlight")}</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-xl">
                {t("hero.description")}
              </p>
              <div className="flex flex-wrap gap-4">
                <Link href="/register">
                  <Button size="lg" className="gap-2" data-testid="button-hero-start-free">
                    {t("hero.startTrial")}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <a href="#how-it-works">
                  <Button size="lg" variant="outline" data-testid="button-hero-see-how">
                    {t("hero.seeHow")}
                  </Button>
                </a>
              </div>
              <div className="flex flex-wrap items-center gap-6 pt-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-chart-2" />
                  <span>{t("hero.benefit1")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-chart-2" />
                  <span>{t("hero.benefit2")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-chart-2" />
                  <span>{t("hero.benefit3")}</span>
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
            <div className="text-center">
              <p className="text-3xl md:text-4xl font-bold text-primary">10K+</p>
              <p className="text-sm text-muted-foreground mt-1">{t("stats.merchants")}</p>
            </div>
            <div className="text-center">
              <p className="text-3xl md:text-4xl font-bold text-primary">500K+</p>
              <p className="text-sm text-muted-foreground mt-1">{t("stats.products")}</p>
            </div>
            <div className="text-center">
              <p className="text-3xl md:text-4xl font-bold text-primary">$50M+</p>
              <p className="text-sm text-muted-foreground mt-1">{t("stats.orders")}</p>
            </div>
            <div className="text-center">
              <p className="text-3xl md:text-4xl font-bold text-primary">99.9%</p>
              <p className="text-sm text-muted-foreground mt-1">{t("stats.uptime")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 md:py-32">
        <div className="container mx-auto px-4 md:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold sm:text-4xl mb-4">
              {t("features.title")}
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              {t("features.description")}
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="hover-elevate">
              <CardContent className="p-6">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Package className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{t("features.catalog.title")}</h3>
                <p className="text-muted-foreground">{t("features.catalog.description")}</p>
              </CardContent>
            </Card>
            <Card className="hover-elevate">
              <CardContent className="p-6">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{t("features.import.title")}</h3>
                <p className="text-muted-foreground">{t("features.import.description")}</p>
              </CardContent>
            </Card>
            <Card className="hover-elevate">
              <CardContent className="p-6">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Truck className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{t("features.fulfillment.title")}</h3>
                <p className="text-muted-foreground">{t("features.fulfillment.description")}</p>
              </CardContent>
            </Card>
            <Card className="hover-elevate">
              <CardContent className="p-6">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{t("features.analytics.title")}</h3>
                <p className="text-muted-foreground">{t("features.analytics.description")}</p>
              </CardContent>
            </Card>
            <Card className="hover-elevate">
              <CardContent className="p-6">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{t("features.team.title")}</h3>
                <p className="text-muted-foreground">{t("features.team.description")}</p>
              </CardContent>
            </Card>
            <Card className="hover-elevate">
              <CardContent className="p-6">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{t("features.security.title")}</h3>
                <p className="text-muted-foreground">{t("features.security.description")}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 md:py-32 bg-muted/30">
        <div className="container mx-auto px-4 md:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold sm:text-4xl mb-4">
              {t("howItWorks.title")}
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              {t("howItWorks.description")}
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="relative text-center">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground mb-6">
                1
              </div>
              <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
                <SiShopify className="h-7 w-7 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{t("howItWorks.step1.title")}</h3>
              <p className="text-muted-foreground">{t("howItWorks.step1.description")}</p>
            </div>
            <div className="relative text-center">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground mb-6">
                2
              </div>
              <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
                <ShoppingCart className="h-7 w-7 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{t("howItWorks.step2.title")}</h3>
              <p className="text-muted-foreground">{t("howItWorks.step2.description")}</p>
            </div>
            <div className="relative text-center">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground mb-6">
                3
              </div>
              <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
                <CreditCard className="h-7 w-7 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{t("howItWorks.step3.title")}</h3>
              <p className="text-muted-foreground">{t("howItWorks.step3.description")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 md:py-32">
        <div className="container mx-auto px-4 md:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold sm:text-4xl mb-4">
              {t("pricing.title")}
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              {t("pricing.description")}
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 max-w-7xl mx-auto">
            {planConfigs.map((plan) => (
              <Card
                key={plan.id}
                className={`relative ${plan.popular ? "border-primary shadow-lg" : ""} ${plan.badge === "millionaire" ? "border-amber-500 shadow-lg" : ""}`}
                data-testid={`card-plan-${plan.id}`}
              >
                {plan.popular && !plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">{t("pricing.mostPopular")}</Badge>
                  </div>
                )}
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className={plan.badge === "millionaire" ? "bg-amber-500 text-amber-950 whitespace-nowrap text-xs" : "bg-primary text-primary-foreground"}>
                      {plan.badge === "millionaire" ? t("pricing.millionaireChoice") : t("pricing.popular")}
                    </Badge>
                  </div>
                )}
                <CardContent className="p-6 pt-8">
                  <h3 className="text-xl font-semibold mb-2">{t(plan.nameKey as any)}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{t(plan.descriptionKey as any)}</p>
                  <div className="mb-6">
                    <span className="text-4xl font-bold">{formatPrice(plan.price)}</span>
                    <span className="text-muted-foreground">/{plan.period === "forever" ? t("pricing.forever") : t("pricing.month")}</span>
                  </div>
                  <Link href="/register">
                    <Button
                      className={`w-full mb-6 ${plan.badge === "millionaire" ? "bg-amber-500 hover:bg-amber-600 text-amber-950" : ""}`}
                      variant={plan.popular ? "default" : "outline"}
                      data-testid={`button-plan-${plan.id}`}
                    >
                      {plan.price === 0 ? t("pricing.startFree") : t("pricing.getStarted")}
                    </Button>
                  </Link>
                  <ul className="space-y-3">
                    {plan.featureKeys.map((featureKey) => (
                      <li key={featureKey} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-chart-2 flex-shrink-0" />
                        <span>{t(featureKey as any)}</span>
                      </li>
                    ))}
                  </ul>
                  {plan.freeForLife && (
                    <div className="mt-4 pt-4 border-t border-dashed">
                      <p className="text-xs text-center text-muted-foreground leading-relaxed">
                        {t("pricing.freeForLife")}
                      </p>
                    </div>
                  )}
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
            {t("cta.title")}
          </h2>
          <p className="text-xl opacity-90 max-w-2xl mx-auto mb-8">
            {t("cta.description")}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/register">
              <Button size="lg" variant="secondary" className="gap-2" data-testid="button-cta-start">
                {t("cta.startTrial")}
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
                <img src={logoImage} alt="Apex Mart Wholesale" className="h-8 w-8 rounded-md object-cover" />
                <span className="text-lg font-bold">Apex Mart Wholesale</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("footer.tagline")}
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">{t("footer.product")}</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground transition-colors">{t("nav.features")}</a></li>
                <li><a href="#pricing" className="hover:text-foreground transition-colors">{t("nav.pricing")}</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">{t("footer.integrations")}</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">{t("footer.company")}</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">{t("footer.about")}</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">{t("footer.blog")}</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">{t("footer.careers")}</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">{t("footer.legal")}</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">{t("footer.privacy")}</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">{t("footer.terms")}</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">{t("footer.security")}</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Apex Mart Wholesale. {t("footer.rights")}
            </p>
            <div className="flex items-center gap-4">
              <Globe className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{t("footer.worldwide")}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
