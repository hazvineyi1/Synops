import { useListClients, useCreateProject, getListProjectsQueryKey } from "@workspace/kanon-api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Lock } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth-context";

const LMS_OPTIONS = [
  { value: "canvas", label: "Canvas (Instructure)" },
  { value: "blackboard", label: "Blackboard Learn" },
  { value: "moodle", label: "Moodle" },
  { value: "d2l", label: "D2L Brightspace" },
  { value: "schoology", label: "Schoology" },
  { value: "sakai", label: "Sakai" },
  { value: "google_classroom", label: "Google Classroom" },
  { value: "microsoft_teams", label: "Microsoft Teams (Education)" },
  { value: "other", label: "Other / Not yet determined" },
];

const projectSchema = z.object({
  clientId: z.number().min(1, "Client is required"),
  title: z.string().min(1, "Title is required"),
  courseCode: z.string().optional(),
  courseType: z.string().optional(),
  revampNotes: z.string().optional(),
  description: z.string().optional(),
  tier: z.string().optional(),
  modality: z.string().optional(),
  lms: z.string().optional(),
  targetDeliveryDate: z.string().optional(),
});

export default function NewProject() {
  const { user } = useAuth();
  const readOnly = !!user?.readOnly;
  const { data: clients, isLoading: isClientsLoading } = useListClients();
  const createProject = useCreateProject();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const defaultClientId = params.get("clientId") ? parseInt(params.get("clientId")!, 10) : undefined;

  const form = useForm<z.infer<typeof projectSchema>>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      clientId: defaultClientId || 0,
      title: "",
      courseCode: "",
      courseType: "new_build",
      revampNotes: "",
      description: "",
      tier: "1",
      modality: "online",
      lms: "",
      targetDeliveryDate: "",
    },
  });

  function onSubmit(data: z.infer<typeof projectSchema>) {
    if (readOnly) return;
    createProject.mutate({ data }, {
      onSuccess: (project) => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        toast({ title: "Project created successfully" });
        setLocation(`/projects/${project.id}`);
      },
      onError: () => {
        toast({ title: "Failed to create project", variant: "destructive" });
      }
    });
  }

  if (isClientsLoading) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/projects"><ChevronLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Project</h1>
          <p className="text-muted-foreground mt-1">Start a new course design project in the pipeline.</p>
        </div>
      </div>

      {readOnly && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
          Your free trial has ended. Contact us to continue creating projects.
        </div>
      )}

      <Card>
        <CardContent className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution / Client</FormLabel>
                    <Select
                      onValueChange={(val) => field.onChange(parseInt(val, 10))}
                      value={field.value ? field.value.toString() : ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an institution or client" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {clients?.map(client => (
                          <SelectItem key={client.id} value={client.id.toString()}>
                            {client.name}{client.institution ? ` - ${client.institution}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Title</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g. BIOL 101: Intro to Biology - Full Redesign" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="courseType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Course type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select course type" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="new_build">New build (from scratch)</SelectItem>
                          <SelectItem value="revamp">Revamp (redesign existing)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        A revamp adds a content-audit capture to the workflow.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="courseCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Course code</FormLabel>
                      <FormControl><Input {...field} placeholder="e.g. SBS210" /></FormControl>
                      <FormDescription>The institution's course identifier, for search and reporting.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {form.watch("courseType") === "revamp" && (
                <FormField
                  control={form.control}
                  name="revampNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Revamp details</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          className="h-24"
                          placeholder="Link to the existing course shell, what's changing and why, and what to preserve vs. replace."
                        />
                      </FormControl>
                      <FormDescription>Captured for the content audit during Intake.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl><Textarea {...field} className="h-24" placeholder="Brief overview of scope, goals, and context" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="lms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target LMS</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select LMS" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {LMS_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="modality"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Modality</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="online">Online Asynchronous</SelectItem>
                          <SelectItem value="online_sync">Online Synchronous</SelectItem>
                          <SelectItem value="hybrid">Hybrid</SelectItem>
                          <SelectItem value="in_person">In Person</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="tier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service Tier</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1">Tier 1 - Full Custom</SelectItem>
                          <SelectItem value="2">Tier 2 - Template-Based</SelectItem>
                          <SelectItem value="3">Tier 3 - Light Touch</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        How much build support this course needs. Tier 1 is a full custom build,
                        Tier 2 adapts existing templates, and Tier 3 is a light review and polish.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="targetDeliveryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Delivery Date</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex justify-end pt-4">
                <Button type="button" variant="outline" className="mr-2" asChild>
                  <Link href="/projects">Cancel</Link>
                </Button>
                <Button type="submit" disabled={createProject.isPending || readOnly}>
                  {createProject.isPending ? "Creating..." : "Create Project"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
