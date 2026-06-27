import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useRunAssessment, useCreateProfile } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2 } from "lucide-react";
import { cn, sanitizeCoachText } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type Message = { role: "user" | "coach"; content: string };
export default function Assessment() {
  const [, setLocation] = useLocation();
  const { t } = useT();
  const [messages, setMessages] = useState<Message[]>([
    { role: "coach", content: t("asmt.welcome") }
  ]);
  const [input, setInput] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);

  const runAssessment = useRunAssessment();
  const createProfile = useCreateProfile();
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);
  const handleSend = async () => {
    if (!input.trim() || runAssessment.isPending || createProfile.isPending) return;
    const userMessage = input.trim();
    setInput("");

    const newMessages: Message[] = [...messages, { role: "user", content: userMessage }];
    setMessages(newMessages);
    try {
      // API expects role as string, content as string
      const response = await runAssessment.mutateAsync({
        data: {
          messages: newMessages.map(m => ({ role: m.role, content: m.content }))
        }
      });
      if (response.isComplete && response.profileData) {
        // Complete! create profile
        await createProfile.mutateAsync({
          data: {
            goal: (response.profileData.goal as string) || "general",
            examName: (response.profileData.examName as string) || null,
            examDate: (response.profileData.examDate as string) || null,
            hoursPerWeek: (response.profileData.hoursPerWeek as number) || 10,
            baseline: (response.profileData.baseline as string) || "foundations",
            calibration: (response.profileData.calibration as string) || "mostly",
            coachPersonality: response.recommendedPersonality || "socratic",
            recommendedCoach: response.recommendedPersonality || "socratic",
            assessmentComplete: true
          }
        });

        setLocation("/coach");
      } else {
        setMessages([...newMessages, { role: "coach", content: response.message }]);
      }
    } catch (error) {
      console.error("Assessment error", error);
    }
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  return (
    <div className="flex flex-col h-[100dvh] bg-background max-w-3xl mx-auto w-full">
      <div className="p-6 text-center border-b border-border/50">
        <h1 className="font-serif text-2xl text-primary font-medium">{t("asmt.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("asmt.subtitle")}</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Arete &mdash; say &ldquo;AR-uh-tay,&rdquo; Greek for excellence.</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6" ref={scrollRef}>
        {messages.map((msg, i) => (
          <div key={i} className={cn(
            "flex w-full",
            msg.role === "user" ? "justify-end" : "justify-start"
          )}>
            <div className={cn(
              "max-w-[85%] rounded-2xl px-5 py-4",
              msg.role === "coach"
                ? "bg-card border-l-4 border-primary text-foreground font-serif text-lg leading-relaxed shadow-sm"
                : "bg-primary text-primary-foreground text-base rounded-br-none"
            )}>
              {msg.role === "coach" ? sanitizeCoachText(msg.content) : msg.content}
            </div>
          </div>
        ))}
        {runAssessment.isPending && (
          <div className="flex w-full justify-start">
             <div className="max-w-[85%] rounded-2xl px-5 py-4 bg-card border-l-4 border-primary shadow-sm flex items-center h-12">
               <div className="thinking-dots">
                 <div></div><div></div><div></div><div></div>
               </div>
             </div>
          </div>
        )}
      </div>
      <div className="p-4 border-t border-border bg-background">
        <div className="relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("asmt.inputPlaceholder")}
            className="min-h-[60px] pr-14 resize-none bg-card rounded-xl border-muted focus-visible:ring-primary"
            disabled={runAssessment.isPending || createProfile.isPending}
          />
          <Button
            size="icon"
            className="absolute bottom-2 right-2 rounded-lg"
            onClick={handleSend}
            disabled={!input.trim() || runAssessment.isPending || createProfile.isPending}
          >
            {(runAssessment.isPending || createProfile.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
