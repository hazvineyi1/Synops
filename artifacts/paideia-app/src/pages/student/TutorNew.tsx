import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useStudentAuth } from "@/hooks/use-student-auth";
import { ArrowLeft, Loader2, BookOpen, MessageCircle } from "lucide-react";

interface ScopeOption {
  id: string;
  title: string;
  resourceKind: string;
}

export default function TutorNew() {
  const { student, loading: authLoading } = useStudentAuth();
  const [, setLoc] = useLocation();

  useEffect(() => {
    if (!authLoading && !student) { setLoc("/student/login"); }
  }, [authLoading, student, setLoc]);
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState<"all_material" | "specific_assignment">("all_material");
  const [scopeRefId, setScopeRefId] = useState<string | null>(null);
  const [options, setOptions] = useState<ScopeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!student) { setLoading(false); return; }
    void api.get<{ assignments: ScopeOption[] }>("/student/tutor/scope-options")
      .then((r) => {
        setOptions(r.assignments);
        if (r.assignments.length > 0) {
          setScopeRefId(r.assignments[0]!.id);
        }
      })
      .finally(() => setLoading(false));
  }, [authLoading, student]);

  const create = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const r = await api.post<{ conversation: { id: string } }>("/student/tutor/conversations", {
        title: title.trim(),
        scope,
        scopeRefId: scope === "specific_assignment" ? scopeRefId : undefined,
      });
      setLoc(`/student/tutor/${r.conversation.id}`);
    } finally {
      setCreating(false);
    }
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
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLoc("/student/tutor")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold">New Tutor Chat</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">Chat title</label>
          <Input
            placeholder="e.g. Help with fractions worksheet"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">What should the tutor know about?</label>
          <div className="grid gap-3">
            <button
              onClick={() => setScope("all_material")}
              className={`flex items-start gap-3 p-4 border rounded-lg text-left transition-colors ${
                scope === "all_material" ? "border-primary bg-primary/5" : "hover:bg-accent/50"
              }`}
            >
              <MessageCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">All my class material</p>
                <p className="text-sm text-muted-foreground">The tutor knows about everything from my class.</p>
              </div>
            </button>

            {options.length > 0 && (
              <button
                onClick={() => setScope("specific_assignment")}
                className={`flex items-start gap-3 p-4 border rounded-lg text-left transition-colors ${
                  scope === "specific_assignment" ? "border-primary bg-primary/5" : "hover:bg-accent/50"
                }`}
              >
                <BookOpen className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium">A specific assignment</p>
                  <p className="text-sm text-muted-foreground mb-2">Focus on one worksheet or quiz.</p>
                  {scope === "specific_assignment" && (
                    <select
                      className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                      value={scopeRefId ?? ""}
                      onChange={(e) => setScopeRefId(e.target.value)}
                    >
                      {options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.title} ({o.resourceKind})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </button>
            )}
          </div>
        </div>

        <Button onClick={create} disabled={!title.trim() || creating} className="w-full">
          {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Start Chat
        </Button>
      </main>
    </div>
  );
}
