import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useStudentAuth } from "@/hooks/use-student-auth";
import type { TutorConversation, TutorMessage } from "@/lib/types";
import { ArrowLeft, Loader2, Send, ToggleLeft, ToggleRight, MessageSquare, Sparkles } from "lucide-react";

export default function TutorChat() {
  const [match, params] = useRoute("/student/tutor/:id");
  const id = match ? params.id : "";
  const { student, loading: authLoading } = useStudentAuth();
  const [, setLoc] = useLocation();

  useEffect(() => {
    if (!authLoading && !student) { setLoc("/student/login"); }
  }, [authLoading, student, setLoc]);
  const [conversation, setConversation] = useState<TutorConversation | null>(null);
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [socraticHint, setSocraticHint] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!id || authLoading) return;
    if (!student) { setLoading(false); return; }
    setLoading(true);
    void api.get<{ conversation: TutorConversation; messages: TutorMessage[] }>(`/student/tutor/conversations/${id}`)
      .then((r) => {
        setConversation(r.conversation);
        setMessages(r.messages);
      })
      .finally(() => setLoading(false));
  }, [id, authLoading, student]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const send = async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);
    try {
      const r = await api.post<{ userMessage: TutorMessage; assistantMessage: TutorMessage }>(
        `/student/tutor/conversations/${id}/messages`,
        { content: text },
      );
      setMessages((prev) => [...prev, r.userMessage, r.assistantMessage]);
    } catch {
      // re-add user message locally on error so they can retry
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          conversationId: id,
          role: "user",
          content: text,
          citations: null,
          usedPersonalization: null,
          createdAt: new Date().toISOString(),
        } as TutorMessage,
        {
          id: Date.now() + 1,
          conversationId: id,
          role: "assistant",
          content: "Sorry, I'm having trouble right now. Please try again in a moment.",
          citations: null,
          usedPersonalization: null,
          createdAt: new Date().toISOString(),
        } as TutorMessage,
      ]);
    } finally {
      setSending(false);
    }
  };

  const toggleSocratic = async () => {
    if (!conversation) return;
    const next = !conversation.socraticMode;
    try {
      const r = await api.patch<{ conversation: TutorConversation }>(`/student/tutor/conversations/${id}`, {
        socraticMode: next,
      });
      setConversation(r.conversation);
      if (next) setSocraticHint(true);
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Conversation not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card shrink-0">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLoc("/student/tutor")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold truncate">{conversation.title}</h1>
            <p className="text-xs text-muted-foreground">
              {conversation.scope === "specific_assignment" ? "Focused on one assignment" : "All class material"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={toggleSocratic}
          >
            {conversation.socraticMode ? (
              <>
                <ToggleRight className="h-4 w-4 text-primary" /> Socratic
              </>
            ) : (
              <>
                <ToggleLeft className="h-4 w-4 text-muted-foreground" /> Socratic
              </>
            )}
          </Button>
        </div>
      </header>

      {socraticHint && conversation.socraticMode && (
        <div className="shrink-0 bg-amber-50 border-b border-amber-100">
          <div className="max-w-3xl mx-auto px-4 py-2 flex items-center justify-between">
            <p className="text-xs text-amber-800">
              <Sparkles className="h-3 w-3 inline mr-1" />
              Socratic mode: the tutor will lead with questions rather than answers.
            </p>
            <Button variant="ghost" size="sm" className="h-6 text-xs text-amber-700" onClick={() => setSocraticHint(false)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Ask your tutor anything about your class material.</p>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border"
                }`}
              >
                <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                {m.citations && m.citations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {m.citations.map((c, i) => (
                      <span
                        key={i}
                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                          c.type === "concept"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {c.type === "concept" ? "Concept" : "Source"}: {c.title}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-card border rounded-lg px-4 py-3 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      <footer className="border-t bg-card shrink-0">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
          <Input
            placeholder="Ask your tutor..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            className="flex-1"
            disabled={sending}
          />
          <Button size="icon" onClick={() => void send()} disabled={!input.trim() || sending}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
