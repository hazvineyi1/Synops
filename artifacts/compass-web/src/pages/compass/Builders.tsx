import { useState } from "react";
import { Link } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListBuilders,
  getListBuildersQueryKey,
  useCreateBuilder,
  useUpdateBuilderStatus,
  useResetBuilderPassword,
  type Builder,
} from "@workspace/compass-api-client";
import { useAuth, authErrorMessage } from "@/lib/auth-context";
import { isGlobalAdmin } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { UserCog, Plus, Activity, KeyRound, RotateCcw, Ban } from "lucide-react";

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  email: z.string().email("Enter a valid email").max(255),
  password: z.string().min(8, "Use at least 8 characters").max(200),
  organizationId: z.string().optional(),
});

const resetSchema = z.object({
  password: z.string().min(8, "Use at least 8 characters").max(200),
});

export default function Builders() {
  const { user } = useAuth();
  const global = isGlobalAdmin(user?.role);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: builders, isLoading } = useListBuilders();
  const createBuilder = useCreateBuilder();
  const updateStatus = useUpdateBuilderStatus();
  const resetPassword = useResetBuilderPassword();

  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<Builder | null>(null);

  const createForm = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", email: "", password: "", organizationId: "" },
  });

  const resetForm = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "" },
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListBuildersQueryKey() });
  }

  function onCreate(values: z.infer<typeof createSchema>) {
    let organizationId: number | undefined;
    if (global) {
      const parsed = Number(values.organizationId);
      if (!values.organizationId || Number.isNaN(parsed)) {
        createForm.setError("organizationId", {
          message: "Organization ID is required for global administrators",
        });
        return;
      }
      organizationId = parsed;
    }
    createBuilder.mutate(
      {
        data: {
          name: values.name,
          email: values.email,
          password: values.password,
          ...(organizationId !== undefined ? { organizationId } : {}),
        },
      },
      {
        onSuccess: () => {
          invalidate();
          setCreateOpen(false);
          createForm.reset();
          toast({ title: "Builder created" });
        },
        onError: (err) =>
          toast({
            title: "Could not create builder",
            description: authErrorMessage(err),
            variant: "destructive",
          }),
      },
    );
  }

  function onReset(values: z.infer<typeof resetSchema>) {
    if (!resetTarget) return;
    resetPassword.mutate(
      { id: resetTarget.id, data: { password: values.password } },
      {
        onSuccess: () => {
          setResetTarget(null);
          resetForm.reset();
          toast({ title: "Password updated" });
        },
        onError: (err) =>
          toast({
            title: "Could not reset password",
            description: authErrorMessage(err),
            variant: "destructive",
          }),
      },
    );
  }

  function setStatus(b: Builder, status: "active" | "deactivated") {
    updateStatus.mutate(
      { id: b.id, data: { status } },
      {
        onSuccess: () => {
          invalidate();
          toast({
            title: status === "active" ? "Builder reactivated" : "Builder deactivated",
          });
        },
        onError: (err) =>
          toast({
            title: "Could not update status",
            description: authErrorMessage(err),
            variant: "destructive",
          }),
      },
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <UserCog className="h-7 w-7" aria-hidden="true" /> Builders
          </h1>
          <p className="mt-1 text-muted-foreground">
            Provision curriculum builders and control their access. Builders only
            see the scopes you allocate to them.
          </p>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> New builder
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a builder</DialogTitle>
              <DialogDescription>
                The builder signs in with this email and password. Allocate
                scopes afterward to grant access.
              </DialogDescription>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(onCreate)} className="space-y-4">
                <FormField
                  control={createForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full name</FormLabel>
                      <FormControl>
                        <Input {...field} autoComplete="off" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} autoComplete="off" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Temporary password</FormLabel>
                      <FormControl>
                        <Input type="text" {...field} autoComplete="off" />
                      </FormControl>
                      <FormDescription>
                        At least 8 characters. Share it securely; the builder can
                        keep it or you can reset it later.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {global && (
                  <FormField
                    control={createForm.control}
                    name="organizationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organization ID</FormLabel>
                        <FormControl>
                          <Input inputMode="numeric" {...field} />
                        </FormControl>
                        <FormDescription>
                          Required for global administrators. School
                          administrators provision into their own organization
                          automatically.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <DialogFooter>
                  <Button type="submit" disabled={createBuilder.isPending}>
                    {createBuilder.isPending ? "Creating..." : "Create builder"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading builders...</div>
      ) : !builders || builders.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          No builders yet. Create one to get started.
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Active scopes</TableHead>
                {global && <TableHead>Organization</TableHead>}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {builders.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell className="text-muted-foreground">{b.email}</TableCell>
                  <TableCell>
                    <Badge variant={b.status === "active" ? "secondary" : "destructive"}>
                      {b.status === "active" ? "Active" : "Deactivated"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">{b.activeAllocationCount}</TableCell>
                  {global && (
                    <TableCell className="text-muted-foreground">
                      {b.organizationName ?? (b.organizationId ? `Org ${b.organizationId}` : "None")}
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/builders/${b.id}`}>
                          <Activity className="mr-1 h-4 w-4" /> Activity
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          resetForm.reset();
                          setResetTarget(b);
                        }}
                      >
                        <KeyRound className="mr-1 h-4 w-4" /> Reset password
                      </Button>
                      {b.status === "active" ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive">
                              <Ban className="mr-1 h-4 w-4" /> Deactivate
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Deactivate {b.name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                They will be signed out and blocked from signing
                                in until reactivated. Their allocations are kept.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => setStatus(b, "deactivated")}>
                                Deactivate
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setStatus(b, "active")}
                        >
                          <RotateCcw className="mr-1 h-4 w-4" /> Reactivate
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={!!resetTarget}
        onOpenChange={(open) => {
          if (!open) {
            setResetTarget(null);
            resetForm.reset();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for {resetTarget?.name}. They will use it on
              their next sign in.
            </DialogDescription>
          </DialogHeader>
          <Form {...resetForm}>
            <form onSubmit={resetForm.handleSubmit(onReset)} className="space-y-4">
              <FormField
                control={resetForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New password</FormLabel>
                    <FormControl>
                      <Input type="text" {...field} autoComplete="off" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={resetPassword.isPending}>
                  {resetPassword.isPending ? "Saving..." : "Update password"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
