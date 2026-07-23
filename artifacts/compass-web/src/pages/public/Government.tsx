import { usePageMeta } from "@/lib/seo";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Building2, FileText } from "lucide-react";

export default function Government() {
  usePageMeta(
    "Government Contracting",
    "Federal and multi-state ready: SWaM certified, eVA registered, active federal SAM.gov registration.",
  );

  const codes = [
    "918-75 Management Consulting",
    "918-78 Medical Consulting",
    "918-06 Administrative Consulting",
    "918-67 Human Services Consulting",
    "918-83 Organizational Development",
    "918-90 Strategic Planning",
    "918-88 Quality Assurance",
    "918-58 Governmental Consulting"
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-24 space-y-16">
      <div className="space-y-6">
        <Badge variant="outline" className="text-primary border-primary">Government Procurement</Badge>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Federal & Multi-State Ready</h1>
        <p className="text-xl text-muted-foreground leading-relaxed max-w-3xl">
          Synops Consulting Group provides enterprise-grade consulting and technical execution for government agencies across the United States. We are fully remote and deliver across all U.S. time zones.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              Active Registrations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <span className="font-medium">Federal SAM.gov Registered</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <span className="font-medium">Virginia SWaM Certified</span>
              <span className="text-sm text-muted-foreground">(Small, Women- & Minority-Owned)</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <span className="font-medium">eVA Registered</span>
              <span className="text-sm text-muted-foreground">(Virginia eProcurement)</span>
            </div>
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border/50">
              <span className="font-medium">Ownership:</span>
              <span className="text-sm text-muted-foreground">Woman-owned, Minority-owned</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-muted-foreground" />
              Past Performance Themes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm text-muted-foreground list-disc list-inside ml-4">
              <li>Medicaid managed care operations & oversight</li>
              <li>Large-scale provider relations ($1B+ spend)</li>
              <li>Vendor oversight & performance (300+ agents)</li>
              <li>Instructional design & workforce training at scale</li>
              <li>Educational technology platform implementation</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <h2 className="text-2xl font-bold">NIGP Commodity Codes</h2>
        <div className="flex flex-wrap gap-2">
          {codes.map(code => {
            const [num, ...rest] = code.split(' ');
            return (
              <Badge key={num} variant="secondary" className="px-3 py-1.5 text-sm font-normal">
                <span className="font-mono text-xs opacity-60 mr-2">{num}</span>
                {rest.join(' ')}
              </Badge>
            );
          })}
        </div>
      </div>

      <div className="bg-muted p-8 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-6 border border-border">
        <div>
          <h3 className="font-bold text-lg mb-1">Capability Statement</h3>
          <p className="text-muted-foreground text-sm">Request our complete corporate overview, core competencies, and past performance details for your procurement files.</p>
        </div>
        <Button className="shrink-0 group" asChild>
          <Link href="/contact">
            <FileText className="mr-2 w-4 h-4" />
            Request capability statement
          </Link>
        </Button>
      </div>
    </div>
  );
}