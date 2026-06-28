import { usePageMeta } from "@/lib/seo";
import { Link } from "wouter";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

export default function Healthcare() {
  usePageMeta(
    "Healthcare & Operations Consulting",
    "Provider relations, managed care program support, healthcare operations, and organizational change.",
  );
  return (
    <div className="mx-auto max-w-5xl px-4 py-24 space-y-16">
      <div className="space-y-6 max-w-3xl">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight" style={{ color: "hsl(var(--practice-health))" }}>
          Healthcare & Operations
        </h1>
        <p className="text-xl text-muted-foreground leading-relaxed">
          Led by Bertha D. Musoni, we bring over 20 years of managed care leadership to solving complex operational challenges in Medicaid programs and provider networks.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-12 items-start">
        <div className="md:col-span-2 space-y-8">
          <h2 className="text-2xl font-semibold">Core Services</h2>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1" className="border-border">
              <AccordionTrigger className="text-lg font-medium hover:no-underline hover:text-primary">
                Provider Relations & Network Management
              </AccordionTrigger>
              <AccordionContent className="text-base text-muted-foreground space-y-2">
                <p>Network adequacy & gap analysis</p>
                <p>Enrollment, credentialing & revalidation process design</p>
                <p>Dispute resolution & escalation frameworks</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2" className="border-border">
              <AccordionTrigger className="text-lg font-medium hover:no-underline hover:text-primary">
                Managed Care Program Support
              </AccordionTrigger>
              <AccordionContent className="text-base text-muted-foreground space-y-2">
                <p>Medicaid managed care implementation & oversight</p>
                <p>MCO performance monitoring & NCQA compliance advisory</p>
                <p>Health risk assessment program design & quality improvement</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3" className="border-border">
              <AccordionTrigger className="text-lg font-medium hover:no-underline hover:text-primary">
                Healthcare Operations
              </AccordionTrigger>
              <AccordionContent className="text-base text-muted-foreground space-y-2">
                <p>End-to-end workflow analysis & redesign</p>
                <p>Compliance & regulatory readiness</p>
                <p>Care coordination & cross-functional integration</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4" className="border-border">
              <AccordionTrigger className="text-lg font-medium hover:no-underline hover:text-primary">
                Organizational Change & Workforce
              </AccordionTrigger>
              <AccordionContent className="text-base text-muted-foreground space-y-2">
                <p>Change strategy & implementation</p>
                <p>Workforce transition & performance management</p>
                <p>Leadership development & training</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <div className="bg-muted p-6 rounded-xl border border-border space-y-6 sticky top-24">
          <h3 className="font-semibold text-lg border-b border-border pb-4">Why it matters</h3>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground block">Root-Cause Analysis</strong>
              We move beyond symptomatic fixes to address underlying systemic failures in claims and operations.
            </p>
            <p>
              <strong className="text-foreground block">High-Dollar Claim Remediation</strong>
              Protecting revenue integrity through rigorous dispute resolution frameworks and provider collaboration.
            </p>
            <p>
              <strong className="text-foreground block">Large-Scale Oversight</strong>
              Experience directing vendor and offshore teams of up to 300 agents ensures your operational partners are held to standard.
            </p>
          </div>
          <Button className="w-full bg-accent hover:bg-accent/90 text-accent-foreground" asChild>
            <Link href="/contact?area=healthcare">Request a consultation</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}