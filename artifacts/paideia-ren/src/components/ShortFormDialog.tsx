import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getAnonymousId, getUtm, track } from "@/lib/analytics";

const schema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email required"),
  organization: z.string().optional(),
  message: z.string().optional(),
});

type Values = z.infer<typeof schema>;

interface Props {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description: string;
  orgLabel?: string;
  orgPlaceholder?: string;
  submitLabel: string;
  toastTitle: string;
  toastDescription: string;
  testIdPrefix?: string;
  endpoint?: string;
  source?: string;
}

export function ShortFormDialog({
  trigger,
  open: openProp,
  onOpenChange,
  title,
  description,
  orgLabel,
  orgPlaceholder,
  submitLabel,
  toastTitle,
  toastDescription,
  testIdPrefix = "shortform",
  endpoint,
  source,
}: Props) {
  const { toast } = useToast();
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = (v: boolean) => {
    if (!isControlled) setInternalOpen(v);
    onOpenChange?.(v);
  };
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", organization: "", message: "" },
  });

  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(values: Values) {
    if (endpoint) {
      setSubmitting(true);
      try {
        const utm = getUtm();
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: source ?? testIdPrefix,
            contactName: values.name,
            contactEmail: values.email,
            organization: values.organization || null,
            message: values.message || null,
            sourcePath: typeof window !== "undefined" ? window.location.pathname + window.location.search : null,
            sourceReferrer: typeof document !== "undefined" ? document.referrer || null : null,
            sourceUtm: Object.keys(utm).length > 0 ? utm : null,
            anonymousId: getAnonymousId(),
          }),
        });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        track("pilot_form_submitted", { source: source ?? testIdPrefix });
        toast({ title: toastTitle, description: toastDescription });
        form.reset();
        setOpen(false);
      } catch (err) {
        toast({
          title: "Could not send",
          description: (err as Error).message + ". Please try again or email info@synops-consulting.com.",
          variant: "destructive",
        });
      } finally {
        setSubmitting(false);
      }
      return;
    }
    toast({ title: toastTitle, description: toastDescription });
    form.reset();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-[480px] rounded-none">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl text-primary">{title}</DialogTitle>
          <DialogDescription className="text-[14px] text-foreground/70 leading-[1.6]">
            {description}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[12px] font-semibold uppercase tracking-wide">Full name</FormLabel>
                <FormControl><Input {...field} placeholder="Your name" className="rounded-none h-11" data-testid={`${testIdPrefix}-input-name`} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[12px] font-semibold uppercase tracking-wide">Email</FormLabel>
                <FormControl><Input {...field} type="email" placeholder="name@example.org" className="rounded-none h-11" data-testid={`${testIdPrefix}-input-email`} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            {orgLabel && (
              <FormField control={form.control} name="organization" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[12px] font-semibold uppercase tracking-wide">{orgLabel}</FormLabel>
                  <FormControl><Input {...field} placeholder={orgPlaceholder ?? ""} className="rounded-none h-11" data-testid={`${testIdPrefix}-input-org`} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}
            <FormField control={form.control} name="message" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[12px] font-semibold uppercase tracking-wide">Message (optional)</FormLabel>
                <FormControl><Textarea {...field} rows={3} placeholder="A short note about your interest" className="rounded-none" data-testid={`${testIdPrefix}-input-message`} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <Button type="submit" disabled={submitting} className="bg-primary hover:bg-primary/90 text-white rounded-none h-12 w-full" data-testid={`${testIdPrefix}-submit`}>
              {submitting ? "Sending." : submitLabel}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
