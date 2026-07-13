import { useState, useRef, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { notifyError } from "@/lib/notify";
import { Input } from "@/components/ui/input";
import {
  useGetStudyTutorConversation,
  useSendStudyTutorMessage,
} from "@workspace/paideia-api-client";
import { Send, BrainCircuit, Lightbulb } from "lucide-react";
import StudyNav from "@/components/StudyNav";
import { Markdown } from "@/components/Markdown";
import type { StudyTutorMessage } from "@workspace/paideia-api-client";

export default function StudyTutorChat() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const [, setLoc] = useLocation();
  const { data: detail, isLoading, refetch } = useGetStudyTutorConversation(conversationId);
  const sendMutation = useSendStudyTutorMessage();

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const conversation = detail?.conversation;
  const messages = detail?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    setSending(true);
    try {
      await sendMutation.mutateAsync({
        conversationId,
        data: { content: input.trim() },
      });
      setInput("");
      // The mutation persists the message + reply server-side but does not update the
      // conversation query cache, so re-fetch to render the new turn (and auto-scroll).
      await refetch();
    } catch {
      notifyError(undefined, "Could not send your message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <StudyNav />
      <header className="border-b px-4 py-2 flex items-center justify-between shrink-0 sticky top-12 bg-background/95 backdrop-blur-sm z-40">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="font-semibold text-sm truncate">
            {conversation?.title || "Synops Coach"}
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Lightbulb className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">Chat</span>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setLoc("/tutor")}>
            All sessions
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4 max-w-3xl mx-auto w-full">
        {!messages || messages.length === 0 ? (
          <div className="text-center py-12">
            <BrainCircuit className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold mb-1">Ask me anything</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              I know your materials, concepts, and learning profile. Ask about any topic you're studying.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((msg: StudyTutorMessage) => {
              const isUser = msg.role === "user";
              return (
                <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div
                    className={
                      isUser
                        ? "max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-none bg-primary text-primary-foreground text-sm whitespace-pre-wrap"
                        : "max-w-[92%] px-5 py-4 rounded-2xl rounded-bl-none bg-muted text-[15px] text-foreground"
                    }
                  >
                    {isUser ? msg.content : <Markdown content={msg.content} />}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="border-t px-6 py-4 shrink-0 max-w-3xl mx-auto w-full">
        <div className="flex gap-2">
          <Input
            placeholder="Ask about a concept, exam strategy, or anything else..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter (or Cmd/Ctrl+Enter) sends; Shift+Enter is reserved for newlines.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            disabled={sending}
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={sending || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
