import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Calendar } from "lucide-react";

const blogPosts = [
  {
    title: "How to Scale Your Shopify Store with Wholesale Products",
    description: "Learn the strategies successful merchants use to grow their businesses using wholesale sourcing.",
    date: "December 5, 2025",
    category: "Growth"
  },
  {
    title: "The Complete Guide to Dropshipping vs Wholesale",
    description: "Understanding the differences between dropshipping and wholesale, and which is right for your business.",
    date: "December 1, 2025",
    category: "Education"
  },
  {
    title: "Top 10 Product Categories for 2025",
    description: "Discover the trending product categories that are expected to dominate e-commerce in 2025.",
    date: "November 28, 2025",
    category: "Trends"
  },
  {
    title: "Maximizing Profit Margins with Smart Pricing",
    description: "Tips and strategies for setting competitive prices while maintaining healthy profit margins.",
    date: "November 20, 2025",
    category: "Strategy"
  },
  {
    title: "Building Customer Trust in E-commerce",
    description: "How to build a trustworthy brand and increase customer loyalty in your online store.",
    date: "November 15, 2025",
    category: "Marketing"
  },
  {
    title: "Automating Your Order Fulfillment Process",
    description: "Step-by-step guide to setting up automated fulfillment and saving hours every week.",
    date: "November 10, 2025",
    category: "Operations"
  }
];

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back-home">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">Blog</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4" data-testid="text-blog-heading">
            Insights & Resources
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Tips, strategies, and industry insights to help you grow your e-commerce business.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {blogPosts.map((post, index) => (
            <Card key={index} className="hover-elevate cursor-pointer" data-testid={`card-blog-${index}`}>
              <CardHeader>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <Calendar className="h-4 w-4" />
                  {post.date}
                </div>
                <CardTitle className="text-lg">{post.title}</CardTitle>
                <CardDescription>{post.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="inline-block px-2 py-1 text-xs font-medium bg-primary/10 text-primary rounded">
                  {post.category}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center mt-12">
          <p className="text-muted-foreground mb-4">
            Want to stay updated with the latest insights?
          </p>
          <Link href="/register">
            <Button data-testid="button-subscribe">Join Our Newsletter</Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
