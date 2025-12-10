import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Target, Eye, Heart } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back-home">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">About Us</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4" data-testid="text-about-heading">
            About Apex Mart Wholesale
          </h2>
          <p className="text-xl text-muted-foreground">
            Connecting suppliers with e-commerce merchants worldwide.
          </p>
        </div>

        <div className="prose prose-lg dark:prose-invert mx-auto mb-12">
          <p>
            Apex Mart Wholesale is a leading B2B wholesale marketplace designed to help 
            Shopify merchants source quality products and scale their businesses. Our platform 
            connects verified suppliers with e-commerce entrepreneurs, making wholesale buying 
            simple, fast, and reliable.
          </p>
          <p>
            Founded with the mission to democratize wholesale access, we've grown to offer 
            over 64,000 products from trusted suppliers across multiple categories. Our 
            automated fulfillment system ensures your customers receive their orders on time, 
            every time.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Card data-testid="card-mission">
            <CardContent className="pt-6 text-center">
              <Target className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Our Mission</h3>
              <p className="text-muted-foreground">
                Empower entrepreneurs to build successful e-commerce businesses through 
                seamless wholesale access.
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-vision">
            <CardContent className="pt-6 text-center">
              <Eye className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Our Vision</h3>
              <p className="text-muted-foreground">
                To be the world's most trusted B2B marketplace connecting suppliers 
                and merchants globally.
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-values">
            <CardContent className="pt-6 text-center">
              <Heart className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Our Values</h3>
              <p className="text-muted-foreground">
                Transparency, reliability, and customer success drive everything we do.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="text-center">
          <Link href="/register">
            <Button size="lg" data-testid="button-join-us">
              Join Apex Mart Today
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
