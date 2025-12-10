import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back-home">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">Terms of Service</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <h2 className="text-4xl font-bold mb-8" data-testid="text-terms-heading">
          Terms of Service
        </h2>
        
        <div className="prose prose-lg dark:prose-invert">
          <p className="text-muted-foreground mb-6">Last updated: December 10, 2025</p>

          <h3>1. Acceptance of Terms</h3>
          <p>
            By accessing or using Apex Mart Wholesale, you agree to be bound by these 
            Terms of Service and all applicable laws and regulations.
          </p>

          <h3>2. Use of Service</h3>
          <p>
            You must be at least 18 years old and have the legal authority to enter into 
            these terms. You agree to use the service only for lawful purposes and in 
            accordance with these terms.
          </p>

          <h3>3. Account Responsibilities</h3>
          <p>
            You are responsible for maintaining the confidentiality of your account 
            credentials and for all activities that occur under your account.
          </p>

          <h3>4. Subscription and Payments</h3>
          <p>
            Subscription fees are billed in advance on a monthly basis. You authorize us 
            to charge your payment method for all fees and charges.
          </p>

          <h3>5. Product Listings and Orders</h3>
          <p>
            Product availability, pricing, and specifications are subject to change without 
            notice. We reserve the right to limit quantities or refuse orders.
          </p>

          <h3>6. Intellectual Property</h3>
          <p>
            All content on the platform, including text, graphics, logos, and software, 
            is the property of Apex Mart Wholesale and is protected by intellectual 
            property laws.
          </p>

          <h3>7. Limitation of Liability</h3>
          <p>
            Apex Mart Wholesale shall not be liable for any indirect, incidental, special, 
            consequential, or punitive damages arising from your use of the service.
          </p>

          <h3>8. Termination</h3>
          <p>
            We may terminate or suspend your account at any time for any reason, including 
            violation of these terms.
          </p>

          <h3>9. Changes to Terms</h3>
          <p>
            We reserve the right to modify these terms at any time. Continued use of the 
            service after changes constitutes acceptance of the new terms.
          </p>

          <h3>10. Contact</h3>
          <p>
            For questions about these terms, please contact us at legal@apexmart.com.
          </p>
        </div>
      </main>
    </div>
  );
}
