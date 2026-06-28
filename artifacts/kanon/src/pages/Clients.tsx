import { useMemo, useState } from "react";
import {
  useListClients,
  useCreateClient,
  useListOrganizations,
  getListClientsQueryKey,
  getListOrganizationsQueryKey,
} from "@workspace/kanon-api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Link } from "wouter";
import { Users, Plus, ArrowRight, Building2, Mail, User, Lock } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { isGlobalAdmin } from "@/lib/roles";

function serverErrorMessage(error: unknown, fallback: string): string {
  const e = error as { data?: { error?: unknown }; message?: unknown } | null;
  const fromBody = e?.data?.error;
  if (typeof fromBody === "string" && fromBody.trim()) return fromBody;
  const fromMessage = e?.message;
  if (typeof fromMessage === "string" && fromMessage.trim()) return fromMessage;
  return fallback;
}

export default function Clients() {
  const { user } = useAuth();
  const isGlobal = isGlobalAdmin(user?.role);
  const readOnly = !!user?.readOnly;

  const { data: clients, isLoading } = useListClients();
  const { data: organizations } = useListOrganizations({
    query: { enabled: isGlobal, queryKey: getListOrganizationsQueryKey() },
  });
  const createClient = useCreateClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  // Global admins are not bound to an organization, so they must choose the
  // owning tenant for a new client. Organization-bound users have no selector;
  // the server always uses their own organization.
  const clientSchema = useMemo(
    () =>
      z.object({
        name: z.string().min(1, "Name is required"),
        organizationId: isGlobal
          ? z.string().min(1, "Select an organization")
          : z.string().optional(),
        institution: z.string().optional(),
        contactName: z.string().optional(),
        contactEmail: z.string().email("Invalid email").optional().or(z.literal("")),
        notes: z.string().optional(),
      }),
    [isGlobal],
  );

  type ClientFormValues = z.infer<typeof clientSchema>;

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: "",
      organizationId: "",
      institution: "",
      contactName: "",
      contactEmail: "",
      notes: "",
    },
  });

  function onSubmit(data: ClientFormValues) {
    if (readOnly) return;
    const payload = {
      name: data.name,
      institution: data.institution || undefined,
      contactName: data.contactName || undefined,
      contactEmail: data.contactEmail || undefined,
      notes: data.notes || undefined,
      ...(isGlobal && data.organizationId
        ? { organizationId: Number(data.organizationId) }
        : {}),
    };

    createClient.mutate(
      { data: payload },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
          setOpen(false);
          form.reset();
          toast({ title: "Client created successfully" });
        },
        onError: (error) => {
          toast({
            title: "Failed to create client",
            description: serverErrorMessage(error, "Please try again."),
            variant: "destructive",
          });
        },
      },
    );
  }

  if (isLoading) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground mt-1">Manage institutional partners and contracts.</p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={readOnly}><Plus className="mr-2 h-4 w-4" /> New Client</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Client</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {isGlobal && (
                  <FormField
                    control={form.control}
                    name="organizationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organization</FormLabel>
                        <Select value={field.value ?? ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select an organization" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {organizations?.map((org) => (
                              <SelectItem key={org.id} value={String(org.id)}>
                                {org.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client Name</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="institution"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Institution</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="contactName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Name</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contactEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Email</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl><Textarea {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={createClient.isPending}>
                    {createClient.isPending ? "Creating..." : "Create Client"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {readOnly && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
          Your free trial has ended. You can view clients, but creating and editing are paused.
        </div>
      )}

      {clients && clients.length > 0 ? (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {clients.map((client) => (
          <Card key={client.id} className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-xl flex items-center justify-between">
                {client.name}
              </CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1 text-sm">
                <Building2 className="h-3 w-3" />
                {client.institution || "No institution specified"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-between space-y-4">
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {client.contactName || "No contact name"}
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  {client.contactEmail || "No contact email"}
                </div>
              </div>

              <div className="pt-4 border-t flex items-center justify-between mt-auto">
                <div className="text-sm font-medium">
                  {client.projectCount || 0} Project{(client.projectCount || 0) !== 1 ? 's' : ''}
                </div>
                <Link href={`/clients/${client.id}`} className="text-sm text-primary hover:underline flex items-center">
                  View Details <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
            <Users className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p>
              {readOnly
                ? "No clients yet. Creating is paused while your trial is read-only."
                : "No clients yet. Add your first client to start a project."}
            </p>
            {!readOnly && (
              <Button onClick={() => setOpen(true)}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> New Client
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
