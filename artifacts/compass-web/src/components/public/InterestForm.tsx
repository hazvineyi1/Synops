import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm as useHookForm } from "react-hook-form";
import { z } from "zod";
import { useSubmitContact, ContactInputAreaOfInterest } from "@workspace/compass-api-client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2 } from "lucide-react";

const formSchema = z.object({
  name: z.string().min(2, "Name is required"),
  organization: z.string().optional(),
  email: z.string().email("Invalid email address"),
  areaOfInterest: z.nativeEnum(ContactInputAreaOfInterest, {
    errorMap: () => ({ message: "Please select an area of interest" }),
  }),
  message: z.string().min(10, "Please provide more detail in your message"),
  website: z.string().optional(), // Honeypot
});

type InterestFormValues = z.infer<typeof formSchema>;

export function InterestForm() {
  const { toast } = useToast();
  const submitContact = useSubmitContact();
  const [submitted, setSubmitted] = useState(false);
  const successRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (submitted) {
      successRef.current?.focus();
    }
  }, [submitted]);

  const form = useHookForm<InterestFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      organization: "",
      email: "",
      message: "",
      website: "",
    },
  });

  async function onSubmit(values: InterestFormValues) {
    try {
      await submitContact.mutateAsync({ data: values });
      toast({
        title: "Request received",
        description: "Thank you for your interest. We will be in touch shortly.",
      });
      form.reset();
      setSubmitted(true);
    } catch (err) {
      toast({
        title: "Error",
        description: "We could not send your request. Please try again later.",
        variant: "destructive",
      });
    }
  }

  if (submitted) {
    return (
      <div
        ref={successRef}
        role="status"
        tabIndex={-1}
        className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card p-10 text-center shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <CheckCircle2 className="h-12 w-12 text-primary" aria-hidden="true" />
        <h3 className="text-xl font-semibold">Thank you for reaching out</h3>
        <p className="max-w-md text-muted-foreground">
          We have received your details and a member of our team will follow up
          with you shortly.
        </p>
        <Button variant="outline" onClick={() => setSubmitted(false)}>
          Submit another request
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Honeypot */}
          <div aria-hidden="true" className="pointer-events-none absolute -z-50 hidden opacity-0">
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

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full name *</FormLabel>
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
                  <FormLabel>Organization or school</FormLabel>
                  <FormControl>
                    <Input placeholder="Lincoln School District" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Work email *</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="jane@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="areaOfInterest"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Area of interest *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an area" />
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
          </div>

          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem>
                <FormLabel>How can we help? *</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Tell us about your goals, your timeline, and what you are looking to build."
                    className="min-h-[120px] resize-y"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            size="lg"
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            disabled={submitContact.isPending}
          >
            {submitContact.isPending ? "Sending..." : "Submit interest"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
