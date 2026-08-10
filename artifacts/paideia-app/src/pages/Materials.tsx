import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { FileText, Link as LinkIcon, ClipboardPaste, Trash2, Lock, Loader2 } from "lucide-react";

type SourceType = "paste" | "file" | "url";

interface Material {
  id: string;
  title: string;
  sourceType: SourceType;
  sourceMeta?: unknown;
  status: string;
  charCount: number;
  preview: string;
  createdAt: string;
}

const SOURCE_LABELS: Record<SourceType, string> = {
  paste: "Pasted text",
  file: "File",
  url: "Link",
};

const SOURCE_VARIANTS: Record<SourceType, "default" | "secondary" | "outline"> = {
  paste: "secondary",
  file: "default",
  url: "outline",
};

const ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,image/*,audio/*,video/*";

type Mode = "paste" | "file" | "url";

export default function Materials() {
  const { teacher } = useAuth();
  const isDemo = !!teacher?.isDemo;

  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get<{ materials: Material[] }>("/materials");
      setMaterials(r.materials);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="font-serif text-4xl text-primary mb-2">Materials</h1>
        <p className="text-muted-foreground">
          Upload what you teach from. Base lesson plans, worksheets and quizzes on your own material so they align to your content.
        </p>
      </header>

      <UploadCard isDemo={isDemo} onUploaded={load} />

      <MaterialsList
        materials={materials}
        loading={loading}
        isDemo={isDemo}
        onDeleted={load}
      />
    </AppShell>
  );
}

function UploadCard({ isDemo, onUploaded }: { isDemo: boolean; onUploaded: () => Promise<void> }) {
  const [mode, setMode] = useState<Mode>("paste");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const disabled = isDemo || submitting;

  function reset() {
    setTitle("");
    setText("");
    setUrl("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const canSubmit =
    !disabled &&
    ((mode === "paste" && text.trim().length > 0) ||
      (mode === "file" && !!file) ||
      (mode === "url" && url.trim().length > 0));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const fd = new FormData();
      if (title.trim()) fd.append("title", title.trim());
      if (mode === "paste") fd.append("text", text);
      if (mode === "file" && file) fd.append("file", file);
      if (mode === "url") fd.append("url", url.trim());

      const res = await fetch("/api/copilot/materials", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = (await res.json().catch(() => null)) as
        | { material?: Material; error?: string; code?: string }
        | null;
      if (!res.ok) {
        if (res.status === 403 && data?.code === "demo_locked") {
          setError("Uploading your own materials is available when you create a free account.");
        } else {
          setError(data?.error ?? `Upload failed (${res.status})`);
        }
        return;
      }
      reset();
      await onUploaded();
    } catch {
      setError("Something went wrong while uploading. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative border rounded-lg bg-card p-6 mb-8">
      {isDemo ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-card/80 backdrop-blur-[1px]">
          <div className="text-center px-6 max-w-sm">
            <Lock className="h-6 w-6 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-foreground mb-3">
              Uploading your own materials is available when you create a free account.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition"
            >
              Create a free account
            </Link>
          </div>
        </div>
      ) : null}

      <div className={isDemo ? "pointer-events-none select-none opacity-50" : ""} aria-hidden={isDemo}>
        <div className="inline-flex rounded-lg border bg-background p-1 mb-5">
          <ModeButton active={mode === "paste"} onClick={() => setMode("paste")} disabled={disabled} icon={ClipboardPaste} label="Paste text" />
          <ModeButton active={mode === "file"} onClick={() => setMode("file")} disabled={disabled} icon={FileText} label="Upload a file" />
          <ModeButton active={mode === "url"} onClick={() => setMode("url")} disabled={disabled} icon={LinkIcon} label="Link" />
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="material-title">Title (optional)</Label>
            <Input
              id="material-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Chapter 4 notes"
              disabled={disabled}
              className="mt-1.5"
            />
          </div>

          {mode === "paste" ? (
            <div>
              <Label htmlFor="material-text">Paste your material</Label>
              <Textarea
                id="material-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste notes, a passage, an outline or anything you teach from..."
                rows={8}
                disabled={disabled}
                className="mt-1.5"
              />
            </div>
          ) : null}

          {mode === "file" ? (
            <div>
              <Label htmlFor="material-file">Choose a file</Label>
              <Input
                ref={fileInputRef}
                id="material-file"
                type="file"
                accept={ACCEPT}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={disabled}
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                PDF, Word, PowerPoint, text, images, audio or video. Audio and video can take a few seconds to process.
              </p>
            </div>
          ) : null}

          {mode === "url" ? (
            <div>
              <Label htmlFor="material-url">Link to a page</Label>
              <Input
                id="material-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                disabled={disabled}
                className="mt-1.5"
              />
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                "Add material"
              )}
            </Button>
            {submitting ? (
              <span className="text-xs text-muted-foreground">Extracting text. This can take a few seconds.</span>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  disabled,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  disabled: boolean;
  icon: typeof FileText;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition disabled:opacity-60 ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function MaterialsList({
  materials,
  loading,
  isDemo,
  onDeleted,
}: {
  materials: Material[];
  loading: boolean;
  isDemo: boolean;
  onDeleted: () => Promise<void>;
}) {
  const [viewing, setViewing] = useState<Material | null>(null);
  const [viewText, setViewText] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function view(m: Material) {
    setViewing(m);
    setViewText(null);
    setViewLoading(true);
    try {
      const r = await api.get<{ material: Material & { contentText: string } }>(`/materials/${m.id}`);
      setViewText(r.material.contentText ?? "");
    } catch {
      setViewText("Could not load this material.");
    } finally {
      setViewLoading(false);
    }
  }

  async function remove(m: Material) {
    if (!window.confirm(`Delete "${m.title}"? This cannot be undone.`)) return;
    setDeletingId(m.id);
    try {
      await api.del(`/materials/${m.id}`);
      await onDeleted();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not delete this material.";
      window.alert(msg);
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return <div className="text-muted-foreground text-sm">Loading...</div>;
  }

  if (materials.length === 0) {
    return (
      <div className="border rounded-lg bg-card p-8 text-center text-muted-foreground">
        No materials yet. Add your first above to ground your generated resources in your own content.
      </div>
    );
  }

  return (
    <>
      <div className="border rounded-lg bg-card divide-y">
        {materials.map((m) => (
          <div key={m.id} className="flex items-start gap-4 p-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant={SOURCE_VARIANTS[m.sourceType]}>{SOURCE_LABELS[m.sourceType] ?? m.sourceType}</Badge>
                <span className="text-[11px] text-muted-foreground">{m.charCount.toLocaleString()} chars</span>
                <span className="text-[11px] text-muted-foreground">·</span>
                <span className="text-[11px] text-muted-foreground">{new Date(m.createdAt).toLocaleDateString()}</span>
                {m.status && m.status !== "ready" ? (
                  <span className="text-[11px] text-muted-foreground capitalize">· {m.status}</span>
                ) : null}
              </div>
              <div className="font-medium truncate">{m.title}</div>
              {m.preview ? (
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.preview}</div>
              ) : null}
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="sm" variant="ghost" onClick={() => view(m)}>View</Button>
              {!isDemo ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(m)}
                  disabled={deletingId === m.id}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  {deletingId === m.id ? "Deleting..." : "Delete"}
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!viewing} onOpenChange={(v) => { if (!v) { setViewing(null); setViewText(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{viewing?.title}</DialogTitle>
            <DialogDescription>
              {viewing ? `${SOURCE_LABELS[viewing.sourceType] ?? viewing.sourceType} · ${viewing.charCount.toLocaleString()} chars` : ""}
            </DialogDescription>
          </DialogHeader>
          {viewLoading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm text-foreground">
              {viewText}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
