import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back-home">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">Privacy Policy</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <h2 className="text-4xl font-bold mb-8" data-testid="text-privacy-heading">
          Privacy Policy
        </h2>
        
        <div className="prose prose-lg dark:prose-invert">
          <p className="text-muted-foreground mb-6">Last updated: December 10, 2025</p>

          <h3>1. Information We Collect</h3>
          <p>
            We collect information you provide directly to us, including your name, email 
            address, business information, and payment details. We also automatically 
            collect certain information when you use our platform.
          </p>

          <h3>2. How We Use Your Information</h3>
          <p>
            We use the information we collect to provide, maintain, and improve our services, 
            process transactions, send communications, and for security purposes.
          </p>

          <h3>3. Information Sharing</h3>
          <p>
            We do not sell your personal information. We may share your information with 
            suppliers to fulfill orders, with service providers who assist in our operations, 
            and as required by law.
          </p>

          <h3>4. Data Security</h3>
          <p>
            We implement appropriate technical and organizational measures to protect your 
            personal information against unauthorized access, alteration, disclosure, or 
            destruction.
          </p>

          <h3>5. Your Rights</h3>
          <p>
            You have the right to access, correct, or delete your personal information. 
            You may also opt out of marketing communications at any time.
          </p>

          <h3>6. Cookies</h3>
          <p>
            We use cookies and similar technologies to enhance your experience, analyze 
            usage patterns, and deliver personalized content.
          </p>

          <h3>7. Changes to This Policy</h3>
          <p>
            We may update this privacy policy from time to time. We will notify you of 
            any changes by posting the new policy on this page.
          </p>

          <h3>8. Contact Us</h3>
          <p>
            If you have any questions about this privacy policy, please contact us at 
            privacy@apexmart.com.
          </p>
        </div>
      </main>
    </div>
  );
}
