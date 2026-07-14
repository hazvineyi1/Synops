import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Loader2, Lock, LifeBuoy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "@/context/SessionContext";
import {
  supportApi, type Ticket, type TicketStatus, type TicketPriority,
} from "@/lib/supportApi";

const STAFF_ROLES = ["coach", "org_admin", "partner_admin", "super_admin"];
const STATUSES: TicketStatus[] = ["open", "pending", "resolved", "closed"];
const PRIORITIES: TicketPriority[] = ["low", "normal", "high", "urgent"];

const statusStyle: Record<TicketStatus, string> = {
  open: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  pending: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  resolved: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  closed: "bg-slate-500/15 text-slate-600 border-slate-500/30",
};
const priorityStyle: Record<TicketPriority, string> = {
  low: "text-slate-500",
  normal: "text-slate-600",
  high: "text-orange-600",
  urgent: "text-red-600 font-semibold",
};

function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`text-xs px-2 py-0.5 rounded-full border ${statusStyle[status]}`}>{status}</span>;
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/* ── New ticket dialog ── */
function NewTicket({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (t: Ticket) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("normal");

  const create = useMutation({
    mutationFn: () => supportApi.create({ subject, body, priority }),
    onSuccess: (t) => {
      toast({ title: "Ticket opened" });
      qc.invalidateQueries({ queryKey: ["tickets"] });
      setSubject(""); setBody(""); setPriority("normal");
      onCreated(t); onClose();
    },
    onError: (e) => toast({ title: "Could not open ticket", description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New support ticket</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-sm">Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary" />
          </div>
          <div>
            <Label className="text-sm">Describe the issue</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="h-32" placeholder="What's going on?" />
          </div>
          <div>
            <Label className="text-sm">Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
              <SelectTrigger className="w-40 capitalize"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!subject.trim() || create.isPending}>
            {create.isPending ? "Opening…" : "Open ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Thread ── */
function Thread({ ticketId, staff, meId }: { ticketId: string; staff: boolean; meId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["ticket", ticketId],
    queryFn: () => supportApi.get(ticketId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ticket", ticketId] });
    qc.invalidateQueries({ queryKey: ["tickets"] });
    qc.invalidateQueries({ queryKey: ["support-overview"] });
  };

  const send = useMutation({
    mutationFn: () => supportApi.reply(ticketId, reply, internal),
    onSuccess: () => { setReply(""); setInternal(false); invalidate(); },
    onError: (e) => toast({ title: "Could not send", description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });

  const patch = useMutation({
    mutationFn: (p: { status?: TicketStatus; priority?: TicketPriority }) => supportApi.update(ticketId, p),
    onSuccess: () => { toast({ title: "Ticket updated" }); invalidate(); },
    onError: (e) => toast({ title: "Update failed", description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });

  if (isLoading || !data) {
    return <div className="flex items-center gap-2 text-muted-foreground py-16 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }

  const { ticket, messages } = data;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border pb-3 mb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{ticket.subject}</h2>
            <div className="text-xs text-muted-foreground mt-0.5">
              {ticket.requesterName ?? "You"} · opened {timeAgo(ticket.createdAt)} · <span className={priorityStyle[ticket.priority]}>{ticket.priority}</span>
            </div>
          </div>
          {staff ? (
            <div className="flex items-center gap-2">
              <Select value={ticket.priority} onValueChange={(v) => patch.mutate({ priority: v as TicketPriority })}>
                <SelectTrigger className="w-28 h-8 text-xs capitalize"><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={ticket.status} onValueChange={(v) => patch.mutate({ status: v as TicketStatus })}>
                <SelectTrigger className="w-28 h-8 text-xs capitalize"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          ) : (
            <StatusBadge status={ticket.status} />
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {/* Opening message */}
        <Bubble name={ticket.requesterName ?? "You"} mine={ticket.requesterId === meId} body={ticket.body} when={ticket.createdAt} />
        {messages.map((m) => (
          <Bubble
            key={m.id}
            name={m.authorName}
            mine={m.authorId === meId}
            staff={m.isStaffReply}
            internal={m.isInternalNote}
            body={m.body}
            when={m.createdAt}
          />
        ))}
        {messages.length === 0 && ticket.status === "open" && (
          <p className="text-center text-xs text-muted-foreground py-4">Waiting on a first response.</p>
        )}
      </div>

      {/* Reply box */}
      <div className="border-t border-border pt-3 mt-3 space-y-2">
        <Textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder={internal ? "Internal note (staff only)…" : "Write a reply…"}
          className="h-20"
        />
        <div className="flex items-center justify-between">
          {staff ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Switch checked={internal} onCheckedChange={setInternal} />
              <Lock className="h-3 w-3" /> Internal note
            </label>
          ) : <span />}
          <Button size="sm" onClick={() => send.mutate()} disabled={!reply.trim() || send.isPending}>
            {send.isPending ? "Sending…" : internal ? "Add note" : "Send reply"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Bubble({ name, mine, staff, internal, body, when }: {
  name: string; mine?: boolean; staff?: boolean; internal?: boolean; body: string; when: string;
}) {
  return (
    <div className={`rounded-lg p-3 text-sm border ${
      internal ? "bg-amber-500/5 border-amber-500/30"
        : mine ? "bg-primary/5 border-primary/20"
        : "bg-muted/40 border-border"
    }`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="font-medium text-xs">{name}</span>
        {staff && <span className="text-[10px] text-indigo-600 border border-indigo-500/30 rounded-full px-1.5">staff</span>}
        {internal && <span className="text-[10px] text-amber-600 border border-amber-500/30 rounded-full px-1.5">internal note</span>}
        <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(when)}</span>
      </div>
      <p className="whitespace-pre-wrap">{body}</p>
    </div>
  );
}

/* ── Page ── */
export function Support({ params }: { params?: { ticketId?: string } }) {
  const { user } = useSession();
  const staff = !!user && STAFF_ROLES.includes(user.role);
  const [filter, setFilter] = useState<TicketStatus | "all">("all");
  // Honour a deep link (e.g. from a notification: /support/:ticketId).
  const [selectedId, setSelectedId] = useState<string | null>(params?.ticketId ?? null);
  const [newOpen, setNewOpen] = useState(false);

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["tickets", filter],
    queryFn: () => supportApi.list(filter === "all" ? undefined : filter),
  });

  const { data: overview } = useQuery({
    queryKey: ["support-overview"],
    queryFn: () => supportApi.overview(),
    enabled: staff,
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300 h-[calc(100dvh-8rem)] flex flex-col">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold tracking-tight flex items-center gap-2">
            <LifeBuoy className="h-7 w-7 text-primary" /> {staff ? "Support Desk" : "Help & Support"}
          </h1>
          <p className="text-muted-foreground">
            {staff ? "Work the ticket queue for your learners and teams." : "Open a ticket and our team will help you out."}
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)}><Plus className="h-4 w-4 mr-1" /> New ticket</Button>
      </div>

      {staff && overview && (
        <div className="flex gap-2 flex-wrap">
          {(["all", ...STATUSES] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`text-xs px-3 py-1 rounded-full border capitalize transition-colors ${
                filter === s ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
              }`}
            >
              {s}{s !== "all" && ` · ${overview[s as TicketStatus]}`}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 flex-1 min-h-0">
        {/* List */}
        <Card className="p-2 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : !tickets || tickets.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              {staff ? "No tickets in this view." : "You have no tickets yet. Open one to get help."}
            </div>
          ) : (
            <div className="space-y-1">
              {tickets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                    selectedId === t.id ? "bg-primary/10" : "hover:bg-muted/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-medium text-sm truncate">{t.subject}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    {staff && <span className="truncate">{t.requesterName} ·</span>}
                    <span className={priorityStyle[t.priority]}>{t.priority}</span>
                    <span>· {timeAgo(t.lastMessageAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Thread */}
        <Card className="p-5 min-h-0">
          {selectedId && user ? (
            <Thread ticketId={selectedId} staff={staff} meId={user.id} />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              Select a ticket to view the conversation.
            </div>
          )}
        </Card>
      </div>

      <NewTicket open={newOpen} onClose={() => setNewOpen(false)} onCreated={(t) => setSelectedId(t.id)} />
    </div>
  );
}
