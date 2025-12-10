import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Shield, Lock, Eye, Server, CheckCircle } from "lucide-react";

const securityFeatures = [
  {
    icon: Lock,
    title: "End-to-End Encryption",
    description: "All data transmitted between your browser and our servers is encrypted using TLS 1.3."
  },
  {
    icon: Shield,
    title: "SOC 2 Compliant",
    description: "Our infrastructure and processes meet rigorous security and privacy standards."
  },
  {
    icon: Server,
    title: "Secure Infrastructure",
    description: "Hosted on enterprise-grade cloud infrastructure with 99.9% uptime SLA."
  },
  {
    icon: Eye,
    title: "Access Controls",
    description: "Role-based access control ensures team members only see what they need."
  }
];

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back-home">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">Security</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4" data-testid="text-security-heading">
            Enterprise-Grade Security
          </h2>
          <p className="text-xl text-muted-foreground">
            Your data security is our top priority.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-12">
          {securityFeatures.map((feature, index) => (
            <Card key={index} data-testid={`card-security-${index}`}>
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

        <div className="prose prose-lg dark:prose-invert">
          <h3>Our Security Practices</h3>
          
          <ul className="space-y-2">
            <li className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <span>Regular security audits and penetration testing</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <span>Employee background checks and security training</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <span>24/7 infrastructure monitoring and alerting</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <span>Automated backup and disaster recovery</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <span>PCI DSS compliant payment processing</span>
            </li>
          </ul>

          <h3>Report a Vulnerability</h3>
          <p>
            If you discover a security vulnerability, please report it to security@apexmart.com. 
            We take all reports seriously and will respond promptly.
          </p>
        </div>
      </main>
    </div>
  );
}
