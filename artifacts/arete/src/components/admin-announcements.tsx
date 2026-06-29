import { useState } from "react";
import {
  useAdminAnnouncements,
  useCreateAnnouncement,
  useDeactivateAnnouncement,
} from "@/lib/admin-api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";

export function AdminAnnouncements({ enabled }: { enabled: boolean }) {
  const { data } = useAdminAnnouncements(enabled);
  const create = useCreateAnnouncement();
  const deactivate = useDeactivateAnnouncement();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("all");

  const items = data?.announcements ?? [];

  function publish() {
    if (!title.trim() || !body.trim()) return;
    create.mutate(
      { title: title.trim(), body: body.trim(), audience },
      {
        onSuccess: () => {
          setTitle("");
          setBody("");
          setAudience("all");
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Announcements</CardTitle>
        <CardDescription>Broadcast a message to learners — it shows as a banner in their app.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3 rounded-md border p-4">
          <div className="space-y-1.5">
            <Label htmlFor="an-title">Title</Label>
            <Input
              id="an-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Scheduled maintenance Saturday 9pm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="an-body">Message</Label>
            <Textarea
              id="an-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="What learners should know…"
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[180px]">
              <Label className="mb-1 block text-xs text-muted-foreground">Audience</Label>
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All learners</SelectItem>
                  <SelectItem value="free">Free tier</SelectItem>
                  <SelectItem value="pro">Pro tier</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={publish} disabled={!title.trim() || !body.trim() || create.isPending}>
              {create.isPending ? "Publishing…" : "Publish"}
            </Button>
          </div>
          {create.isError && <p className="text-xs text-destructive">{(create.error as Error)?.message}</p>}
        </div>

        <div className="space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No announcements yet.</p>
          ) : (
            items.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.title}</span>
                    <Badge variant="secondary" className="font-normal">
                      {a.audience}
                    </Badge>
                    {!a.active && (
                      <Badge variant="outline" className="font-normal">
                        inactive
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{a.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {a.created_by_email || "admin"} · {format(parseISO(a.created_at), "MMM d, HH:mm")}
                  </p>
                </div>
                {a.active && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deactivate.isPending}
                    onClick={() => deactivate.mutate({ id: a.id })}
                  >
                    Deactivate
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
