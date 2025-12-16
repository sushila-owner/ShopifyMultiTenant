import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, ArrowLeft } from "lucide-react";
import { PRICING_PLANS, FREE_FOR_LIFE_THRESHOLD, formatPrice, TRIAL_DAYS } from "@/lib/pricing";

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back-home">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">Pricing</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4" data-testid="text-pricing-heading">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Choose the plan that fits your business. Upgrade or downgrade anytime.
          </p>
          <Badge variant="secondary" className="mt-4 text-sm" data-testid="badge-free-trial">
            {TRIAL_DAYS}-Day Free Trial on All Plans
          </Badge>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          {PRICING_PLANS.map((plan, index) => (
            <Card 
              key={plan.id} 
              className={`relative ${plan.popular ? 'border-primary shadow-lg' : ''}`}
              data-testid={`card-plan-${plan.id}`}
            >
              {plan.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                  Most Popular
                </Badge>
              )}
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold">{formatPrice(plan.price)}</span>
                  <span className="text-muted-foreground">/{plan.period === "forever" ? "forever" : "month"}</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="flex-col gap-2">
                <Link href="/register" className="w-full">
                  <Button 
                    className="w-full" 
                    variant={plan.popular ? "default" : "outline"}
                    data-testid={`button-select-${plan.id}`}
                  >
                    {plan.trialDays > 0 ? `Start ${plan.trialDays}-Day Trial` : "Get Started"}
                  </Button>
                </Link>
                {plan.trialDays > 0 && (
                  <p className="text-xs text-muted-foreground text-center">
                    No credit card required
                  </p>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* Promotional Banner */}
        <div className="mt-12 p-6 rounded-xl border-2 border-amber-400 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30">
          <p className="text-center text-lg font-medium text-slate-700 dark:text-slate-200" data-testid="text-promo-banner">
            When your sales reach <span className="font-bold text-amber-600 dark:text-amber-400">$1M</span>, All plans become{" "}
            <span className="font-bold text-amber-600 dark:text-amber-400">FREE FOR LIFE</span>. Choose wisely!
          </p>
        </div>

        <div className="text-center mt-8 p-6 bg-muted rounded-lg">
          <h3 className="text-xl font-semibold mb-2">FREE FOR LIFE Program</h3>
          <p className="text-muted-foreground mb-4">
            Reach $1,000,000 in lifetime sales and get unlimited access forever - completely free!
          </p>
          <Link href="/register">
            <Button variant="outline" data-testid="button-learn-more">Learn More</Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
