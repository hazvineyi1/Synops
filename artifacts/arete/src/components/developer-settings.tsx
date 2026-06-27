import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, KeyRound, Plus, Trash2, Webhook as WebhookIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function DeveloperSettings() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<any[]>([]);
  const [hooks, setHooks] = useState<any[]>([]);
  const [keyName, setKeyName] = useState("");
  const [hookUrl, setHookUrl] = useState("");
  const [hookEvents, setHookEvents] = useState("*");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [k, h] = await Promise.all([
      fetch("/api/developer/keys", { credentials: "include" }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/developer/webhooks", { credentials: "include" }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);
    setKeys(Array.isArray(k) ? k : []);
    setHooks(Array.isArray(h) ? h : []);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const createKey = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/developer/keys", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: keyName.trim() || "API key" }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.key) {
        setNewKey(data.key);
        setKeyName("");
        refresh();
      } else {
        toast({ title: "Could not create key", variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  };
  const revokeKey = async (id: number) => {
    await fetch(`/api/developer/keys/${id}`, { method: "DELETE", credentials: "include" });
    refresh();
  };

  const createHook = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/developer/webhooks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: hookUrl.trim(), events: hookEvents.trim() || "*" }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.secret) {
        setNewSecret(data.secret);
        setHookUrl("");
        refresh();
      } else {
        toast({ title: "Could not add webhook", description: data?.error, variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  };
  const deleteHook = async (id: number) => {
    await fetch(`/api/developer/webhooks/${id}`, { method: "DELETE", credentials: "include" });
    refresh();
  };

  const activeKeys = keys.filter((k) => !k.revokedAt);

  return (
    <Card className="shadow-sm border-border bg-card mt-6">
      <CardHeader>
        <CardTitle className="font-serif flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-primary" /> Developer API
        </CardTitle>
        <CardDescription>
          Build on the Coach with API keys and webhooks. See the{" "}
          <Link href="/developers" className="text-primary underline">API docs</Link>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* API keys */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">API keys</h4>
          {newKey && (
            <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-xs">
              <p className="font-medium mb-1">Copy your key now — it will not be shown again:</p>
              <code className="break-all font-mono">{newKey}</code>
            </div>
          )}
          {activeKeys.length === 0 ? (
            <p className="text-xs text-muted-foreground">No active keys.</p>
          ) : (
            activeKeys.map((k) => (
              <div key={k.id} className="flex items-center justify-between gap-2 text-sm border-b border-border/50 pb-2">
                <div className="min-w-0">
                  <span className="font-medium">{k.name}</span>{" "}
                  <code className="text-xs text-muted-foreground font-mono">{k.prefix}…</code>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => revokeKey(k.id)}
                  aria-label="Revoke key"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Key name (e.g. LMS integration)"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              className="flex-1"
            />
            <Button onClick={createKey} disabled={busy} className="gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create key
            </Button>
          </div>
        </div>

        {/* Webhooks */}
        <div className="space-y-3 pt-2 border-t border-border">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <WebhookIcon className="w-4 h-4" /> Webhooks
          </h4>
          {newSecret && (
            <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-xs">
              <p className="font-medium mb-1">Signing secret (shown once):</p>
              <code className="break-all font-mono">{newSecret}</code>
            </div>
          )}
          {hooks.length === 0 ? (
            <p className="text-xs text-muted-foreground">No webhooks.</p>
          ) : (
            hooks.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-2 text-sm border-b border-border/50 pb-2">
                <div className="min-w-0">
                  <div className="truncate font-mono text-xs">{h.url}</div>
                  <div className="text-[11px] text-muted-foreground">{h.events}</div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteHook(h.id)}
                  aria-label="Delete webhook"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="https://your-app.com/webhook"
              value={hookUrl}
              onChange={(e) => setHookUrl(e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder="events (e.g. checkpoint.graded or *)"
              value={hookEvents}
              onChange={(e) => setHookEvents(e.target.value)}
              className="sm:w-64"
            />
            <Button onClick={createHook} disabled={busy || !hookUrl.trim()} className="gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
