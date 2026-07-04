import { useGetClient, useListProjects, getGetClientQueryKey } from "@workspace/compass-api-client";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Mail, User, Calendar, ArrowRight, Plus } from "lucide-react";
import { format } from "date-fns";

export default function ClientDetail() {
  const params = useParams();
  const clientId = parseInt(params.id || "0", 10);

  const { data: client, isLoading: isClientLoading } = useGetClient(clientId, {
    query: { enabled: !!clientId, queryKey: getGetClientQueryKey(clientId) }
  });

  const { data: projects, isLoading: isProjectsLoading } = useListProjects();
  
  if (isClientLoading || isProjectsLoading) return <div className="p-8">Loading...</div>;
  if (!client) return <div className="p-8">Client not found.</div>;

  const clientProjects = projects?.filter(p => p.clientId === clientId) || [];

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Link href="/clients" className="hover:underline">Clients</Link>
            <span>/</span>
            <span>{client.name}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{client.name}</h1>
          {client.institution && (
            <p className="text-lg text-muted-foreground mt-1 flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {client.institution}
            </p>
          )}
        </div>
        <Button asChild>
          <Link href={`/projects/new?clientId=${client.id}`}>
            <Plus className="mr-2 h-4 w-4" /> New Project
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {client.contactName && (
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{client.contactName}</span>
              </div>
            )}
            {client.contactEmail && (
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${client.contactEmail}`} className="text-primary hover:underline">
                  {client.contactEmail}
                </a>
              </div>
            )}
            {client.notes && (
              <div className="pt-4 border-t mt-4">
                <h4 className="font-medium mb-1 text-xs uppercase tracking-wider text-muted-foreground">Notes</h4>
                <p className="text-muted-foreground whitespace-pre-wrap">{client.notes}</p>
              </div>
            )}
            <div className="pt-4 border-t mt-4 text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Created {format(new Date(client.createdAt), 'MMM d, yyyy')}
            </div>
          </CardContent>
        </Card>

        <div className="md:col-span-2 space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">Projects ({clientProjects.length})</h2>
          
          <div className="grid gap-4">
            {clientProjects.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  No projects found for this client.
                </CardContent>
              </Card>
            ) : (
              clientProjects.map(project => (
                <Card key={project.id}>
                  <CardContent className="p-6 flex items-center justify-between">
                    <div className="space-y-1">
                      <Link href={`/projects/${project.id}`} className="font-semibold text-lg hover:underline text-foreground">
                        {project.title}
                      </Link>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <Badge variant="outline">Stage {project.stage}</Badge>
                        <span className="capitalize">{project.status.replace('_', ' ')}</span>
                        {project.targetDeliveryDate && (
                          <span>&middot; Due {format(new Date(project.targetDeliveryDate), 'MMM yyyy')}</span>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={`/projects/${project.id}`}>
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
