import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useStudentAuth } from "@/hooks/use-student-auth";
import type { TutorConversation } from "@/lib/types";
import { MessageSquare, Plus, Trash2, Pencil, Loader2 } from "lucide-react";

export default function TutorList() {
  const { student, loading: authLoading } = useStudentAuth();
  const [, setLoc] = useLocation();

  useEffect(() => {
    if (!authLoading && !student) { setLoc("/student/login"); }
  }, [authLoading, student, setLoc]);
  const [conversations, setConversations] = useState<TutorConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!student) { setLoading(false); return; }
    void api.get<{ conversations: TutorConversation[] }>("/student/tutor/conversations")
      .then((r) => setConversations(r.conversations))
      .finally(() => setLoading(false));
  }, [authLoading, student]);

  const remove = async (id: string) => {
    setDeleting(id);
    await api.del(`/student/tutor/conversations/${id}`);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setDeleting(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Synops Coach</h1>
            <p className="text-sm text-muted-foreground">Chat with your AI tutor about class material</p>
          </div>
          <Button onClick={() => setLoc("/student/tutor/new")} size="sm">
            <Plus className="h-4 w-4 mr-1" /> New Chat
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6">
        {conversations.length === 0 ? (
          <div className="text-center py-16 border rounded-lg bg-card">
            <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No conversations yet.</p>
            <Button className="mt-4" onClick={() => setLoc("/student/tutor/new")}>
              <Plus className="h-4 w-4 mr-1" /> Start a new chat
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {conversations.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors"
              >
                <Link href={`/student/tutor/${c.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{c.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.socraticMode ? "Socratic mode" : "Standard tutor"} · {new Date(c.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </Link>
                <div className="flex items-center gap-1 ml-3 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={() => setLoc(`/student/tutor/${c.id}`)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(c.id)}
                    disabled={deleting === c.id}
                  >
                    {deleting === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
