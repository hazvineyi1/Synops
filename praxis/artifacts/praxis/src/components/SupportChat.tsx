import { useState, useRef, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { MessageCircle, X, Send } from "lucide-react";

interface Msg { role: "user" | "assistant"; content: string }

/**
 * Learner-facing support chatbot widget: a floating button that opens an in-app chat. It helps with
 * using the platform (finding courses, credentials, language, passwords) and calls POST /support/chat.
 * It deliberately does not do coursework - that guardrail lives in the server prompt.
 */
export default function SupportChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const { reply } = await apiFetch<{ reply: string }>("/support/chat", {
        method: "POST",
        body: JSON.stringify({ messages: next }),
      });
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Sorry, I could not reach support just now. Please try again in a moment." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open support chat"
          className="fixed bottom-20 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg md:bottom-6"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-20 right-4 z-50 flex h-[28rem] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl md:bottom-6">
          <div className="flex items-center justify-between border-b border-border bg-primary px-4 py-3 text-primary-foreground">
            <div className="flex items-center gap-2"><MessageCircle className="h-4 w-4" /><span className="text-sm font-semibold">Support assistant</span></div>
            <button onClick={() => setOpen(false)} aria-label="Close support chat"><X className="h-4 w-4" /></button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Hi! I can help you use the platform - finding courses, credentials, switching language, or resetting a
                password. What do you need?
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {busy && <p className="text-xs text-muted-foreground">Assistant is typing...</p>}
            <div ref={endRef} />
          </div>

          <div className="flex items-center gap-2 border-t border-border p-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
              placeholder="Ask a question..."
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button onClick={() => void send()} disabled={busy || !input.trim()} aria-label="Send" className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
