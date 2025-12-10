import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, ArrowLeft } from "lucide-react";

const plans = [
  {
    name: "Free",
    price: 0,
    description: "Get started with basic features",
    features: [
      "Up to 25 products",
      "10 orders per month",
      "Basic analytics",
      "Email support"
    ],
    popular: false
  },
  {
    name: "Starter",
    price: 29,
    description: "For growing businesses",
    features: [
      "Up to 100 products",
      "100 orders per month",
      "Advanced analytics",
      "Priority email support",
      "Shopify integration"
    ],
    popular: false
  },
  {
    name: "Growth",
    price: 49,
    description: "Scale your operations",
    features: [
      "Up to 500 products",
      "500 orders per month",
      "Full analytics suite",
      "Priority support",
      "Multi-currency",
      "Team members (3)"
    ],
    popular: true
  },
  {
    name: "Professional",
    price: 99,
    description: "For established businesses",
    features: [
      "Up to 2,000 products",
      "2,000 orders per month",
      "AI-powered insights",
      "Dedicated support",
      "White-label options",
      "Team members (10)",
      "API access"
    ],
    popular: false
  },
  {
    name: "Millionaire",
    price: 249,
    description: "Enterprise-grade features",
    features: [
      "Unlimited products",
      "Unlimited orders",
      "VIP support",
      "Custom integrations",
      "Dedicated account manager",
      "Unlimited team members",
      "Full API access",
      "Custom reporting"
    ],
    popular: false
  }
];

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
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          {plans.map((plan, index) => (
            <Card 
              key={index} 
              className={`relative ${plan.popular ? 'border-primary shadow-lg' : ''}`}
              data-testid={`card-plan-${plan.name.toLowerCase()}`}
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
                  <span className="text-4xl font-bold">${plan.price}</span>
                  <span className="text-muted-foreground">/month</span>
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
              <CardFooter>
                <Link href="/register" className="w-full">
                  <Button 
                    className="w-full" 
                    variant={plan.popular ? "default" : "outline"}
                    data-testid={`button-select-${plan.name.toLowerCase()}`}
                  >
                    Get Started
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>

        <div className="text-center mt-12 p-6 bg-muted rounded-lg">
          <h3 className="text-xl font-semibold mb-2">FREE FOR LIFE Program</h3>
          <p className="text-muted-foreground mb-4">
            Reach $50,000 in lifetime sales and get unlimited access forever - completely free!
          </p>
          <Link href="/register">
            <Button variant="outline" data-testid="button-learn-more">Learn More</Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
