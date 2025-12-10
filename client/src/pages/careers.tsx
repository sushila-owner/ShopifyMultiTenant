import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, MapPin, Clock, Briefcase } from "lucide-react";

const openings = [
  {
    title: "Senior Full-Stack Developer",
    department: "Engineering",
    location: "Remote",
    type: "Full-time"
  },
  {
    title: "Product Manager",
    department: "Product",
    location: "Remote",
    type: "Full-time"
  },
  {
    title: "Customer Success Manager",
    department: "Customer Success",
    location: "Remote",
    type: "Full-time"
  },
  {
    title: "Sales Development Representative",
    department: "Sales",
    location: "Remote",
    type: "Full-time"
  }
];

export default function CareersPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back-home">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">Careers</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4" data-testid="text-careers-heading">
            Join Our Team
          </h2>
          <p className="text-xl text-muted-foreground">
            Help us build the future of B2B e-commerce.
          </p>
        </div>

        <div className="prose prose-lg dark:prose-invert mx-auto mb-12">
          <p>
            At Apex Mart Wholesale, we're building a platform that empowers thousands of 
            entrepreneurs to build successful businesses. We're looking for talented, 
            passionate people who want to make a real impact.
          </p>
          <p>
            We offer competitive compensation, remote-first culture, unlimited PTO, 
            and the opportunity to work on challenging problems with a great team.
          </p>
        </div>

        <h3 className="text-2xl font-bold mb-6">Open Positions</h3>
        
        <div className="space-y-4 mb-12">
          {openings.map((job, index) => (
            <Card key={index} className="hover-elevate" data-testid={`card-job-${index}`}>
              <CardHeader>
                <CardTitle>{job.title}</CardTitle>
                <CardDescription>{job.department}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {job.location}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {job.type}
                  </div>
                  <div className="flex items-center gap-1">
                    <Briefcase className="h-4 w-4" />
                    {job.department}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center p-6 bg-muted rounded-lg">
          <h3 className="text-xl font-semibold mb-2">Don't see your role?</h3>
          <p className="text-muted-foreground mb-4">
            We're always looking for talented people. Send us your resume and tell us 
            how you can contribute.
          </p>
          <Button variant="outline" data-testid="button-general-application">
            Submit General Application
          </Button>
        </div>
      </main>
    </div>
  );
}
