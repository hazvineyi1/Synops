import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getAnonymousId, getUtm, track } from "@/lib/analytics";

const schema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email required"),
  organization: z.string().optional(),
  area: z.string().min(1, "Please select an area of interest"),
  message: z.string().min(10, "Please include a message"),
});

type FormValues = z.infer<typeof schema>;

export default function Contact() {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", organization: "", area: "", message: "" },
  });

  // Handle ?area= query param
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const areaMap: Record<string, string> = {
        healthcare: "Healthcare & Operations",
        learning: "Learning, EdTech & AI",
        platforms: "Platforms & SaaS",
        other: "Other"
      };
      const area = params.get("area");
      if (area && areaMap[area.toLowerCase()]) {
        form.setValue("area", areaMap[area.toLowerCase()]);
      }
    }
  }, [form]);

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const utm = getUtm();
      const res = await fetch("/api/copilot/pilot-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "contact_form",
          contactName: values.name,
          contactEmail: values.email,
          organization: values.organization || null,
          message: `[Area: ${values.area}] ${values.message}`,
          sourcePath: typeof window !== "undefined" ? window.location.pathname + window.location.search : null,
          sourceReferrer: typeof document !== "undefined" ? document.referrer || null : null,
          sourceUtm: Object.keys(utm).length > 0 ? utm : null,
          anonymousId: getAnonymousId(),
        }),
      });
      
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      
      track("pilot_form_submitted", { source: "contact_form" });
      
      toast({
        title: "Message received",
        description: "Your team will follow up within 2 business days.",
      });
      form.reset();
    } catch (err) {
      toast({
        title: "Could not send",
        description: (err as Error).message + ". Please try again or email info@synops-consulting.com.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen pt-[88px] bg-background">
      <section className="py-24 max-w-[800px] mx-auto px-6">
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-[64px] font-bold text-primary leading-[1.1] tracking-tight mb-6">
            Tell us what you need
          </h1>
          <p className="text-[20px] text-muted-foreground leading-relaxed">
            Whether you are a school exploring our curriculum platform, a provider streamlining operations, or an organization building new technology, share a few details and our team will follow up.
          </p>
        </div>

        <div className="bg-white border border-border p-8 md:p-12">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[14px] font-bold">Full name *</FormLabel>
                    <FormControl><Input {...field} placeholder="Your name" className="rounded-[4px] h-12" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[14px] font-bold">Work email *</FormLabel>
                    <FormControl><Input {...field} type="email" placeholder="name@organization.com" className="rounded-[4px] h-12" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              
              <FormField control={form.control} name="organization" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[14px] font-bold">Organization or school</FormLabel>
                  <FormControl><Input {...field} placeholder="Organization name" className="rounded-[4px] h-12" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="area" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[14px] font-bold">Area of interest *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="rounded-[4px] h-12">
                        <SelectValue placeholder="Select an area" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Healthcare & Operations">Healthcare & Operations</SelectItem>
                      <SelectItem value="Learning, EdTech & AI">Learning, EdTech & AI</SelectItem>
                      <SelectItem value="Platforms & SaaS">Platforms & SaaS</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              
              <FormField control={form.control} name="message" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[14px] font-bold">How can we help? *</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Tell us about your project or inquiry..." className="rounded-[4px] min-h-[160px] resize-y" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              
              <Button type="submit" disabled={submitting} size="lg" className="w-full bg-primary hover:bg-primary/90 text-white h-14 text-[16px] font-bold rounded-[6px]">
                {submitting ? "Sending..." : "Submit interest"}
              </Button>
              
              <p className="text-center text-[14px] text-muted-foreground pt-4">
                You can also email us directly at <a href="mailto:info@synops-consulting.com" className="text-primary font-bold hover:underline">info@synops-consulting.com</a>
              </p>
            </form>
          </Form>
        </div>
      </section>
    </div>
  );
}
