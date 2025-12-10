import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Package, 
  ShoppingCart, 
  BarChart3, 
  Zap, 
  Globe, 
  Shield, 
  Truck, 
  Users,
  ArrowLeft
} from "lucide-react";

const features = [
  {
    icon: Package,
    title: "64,000+ Products",
    description: "Access a massive catalog of wholesale products from verified suppliers, ready to import to your store."
  },
  {
    icon: ShoppingCart,
    title: "One-Click Import",
    description: "Import products to your Shopify store with a single click. Set your own prices and margins."
  },
  {
    icon: Zap,
    title: "Automated Fulfillment",
    description: "Orders are automatically sent to suppliers for fulfillment. No manual processing required."
  },
  {
    icon: Truck,
    title: "Real-Time Tracking",
    description: "Track all your orders with live updates. Keep your customers informed every step of the way."
  },
  {
    icon: BarChart3,
    title: "Advanced Analytics",
    description: "Gain insights into your sales, revenue, and product performance with detailed analytics."
  },
  {
    icon: Globe,
    title: "Multi-Currency Support",
    description: "Sell globally with support for multiple currencies and automatic price conversion."
  },
  {
    icon: Shield,
    title: "Secure & Reliable",
    description: "Enterprise-grade security with encrypted data, secure payments, and 99.9% uptime."
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description: "Invite team members with role-based access. Manage your business together."
  }
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back-home">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">Features</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4" data-testid="text-features-heading">
            Everything You Need to Scale Your Business
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Apex Mart Wholesale provides all the tools you need to source products, 
            fulfill orders, and grow your e-commerce business.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <Card key={index} className="hover-elevate" data-testid={`card-feature-${index}`}>
              <CardHeader>
                <feature.icon className="h-10 w-10 text-primary mb-2" />
                <CardTitle>{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center mt-12">
          <Link href="/register">
            <Button size="lg" data-testid="button-get-started">
              Get Started Free
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
