import { usePageMeta } from "@/lib/seo";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm as useHookForm } from "react-hook-form";
import { z } from "zod";
import { useSubmitContact, ContactInputAreaOfInterest } from "@workspace/kanon-api-client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, MapPin } from "lucide-react";

const formSchema = z.object({
  name: z.string().min(2, "Name is required"),
  organization: z.string().optional(),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  areaOfInterest: z.nativeEnum(ContactInputAreaOfInterest, {
    errorMap: () => ({ message: "Please select an area of interest" })
  }),
  message: z.string().min(10, "Please provide more detail in your message"),
  website: z.string().optional() // Honeypot
});

export default function Contact() {
  usePageMeta("Contact", "Book a consultation with Synops Consulting Group.");
  const { toast } = useToast();
  const submitContact = useSubmitContact();

  const form = useHookForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      organization: "",
      email: "",
      phone: "",
      message: "",
      website: ""
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      await submitContact.mutateAsync({ data: values });
      toast({
        title: "Message sent",
        description: "Thank you for reaching out. We will respond shortly.",
      });
      form.reset();
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to send message. Please try again later.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-24">
      <div className="grid md:grid-cols-2 gap-16">
        
        <div className="space-y-12">
          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Let's build something.</h1>
            <p className="text-xl text-muted-foreground">
              Contact us to discuss your operational challenges, learning initiatives, or platform needs.
            </p>
          </div>

          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <Mail className="w-6 h-6 text-primary mt-1" />
              <div>
                <h3 className="font-medium text-foreground">Email</h3>
                <a href="mailto:info@synops-consulting.com" className="text-muted-foreground hover:text-primary transition-colors">
                  info@synops-consulting.com
                </a>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <MapPin className="w-6 h-6 text-primary mt-1" />
              <div>
                <h3 className="font-medium text-foreground">Locations</h3>
                <p className="text-muted-foreground">Principal hubs in Virginia and Texas.<br/>Serving clients nationwide.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card p-8 rounded-xl border border-border shadow-sm">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              {/* HONEYPOT */}
              <div aria-hidden="true" className="hidden opacity-0 absolute -z-50 pointer-events-none">
                <FormField
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Website</FormLabel>
                      <FormControl>
                        <Input tabIndex={-1} autoComplete="off" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Jane Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="organization"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Organization</FormLabel>
                      <FormControl>
                        <Input placeholder="Acme Corp" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Work Email *</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="jane@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="(555) 000-0000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="areaOfInterest"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Area of Interest *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a practice area" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.values(ContactInputAreaOfInterest).map((val) => (
                          <SelectItem key={val} value={val}>{val}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Message *</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Tell us about your project or operational challenges..." 
                        className="min-h-[120px] resize-y"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" size="lg" className="w-full bg-accent hover:bg-accent/90 text-accent-foreground" disabled={submitContact.isPending}>
                {submitContact.isPending ? "Sending..." : "Send Message"}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}