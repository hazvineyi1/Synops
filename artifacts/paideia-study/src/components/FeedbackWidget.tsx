import { useState } from "react";
import { useLocation } from "wouter";
import { useStudyAuth } from "@/hooks/use-study-auth";
import { studySubmitFeedback } from "@/hooks/use-study-api";
import { MessageSquarePlus, X } from "lucide-react";

// A small floating "Send feedback" affordance for signed-in learners. Bottom-left
// so it never collides with the admin FAB (bottom-right). Submissions are stored
// server-side and read back in the admin console's Feedback section.
export function FeedbackWidget() {
  const { user } = useStudyAuth();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (!user) return null;
  // Not on the admin console (admins read feedback there) or the full-screen exam.
  if (location.startsWith("/admin") || /\/exams\/.+\/take/.test(location)) return null;

  const submit = async () => {
    if (message.trim().length < 3) return;
    setSending(true);
    try {
      await studySubmitFeedback(message.trim(), location);
      setSent(true);
      setMessage("");
      setTimeout(() => {
        setSent(false);
        setOpen(false);
      }, 1800);
    } catch {
      alert("Could not send your feedback. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed bottom-4 left-4 z-50">
      {open ? (
        <div className="w-72 rounded-lg border bg-card shadow-lg p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Send feedback</span>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {sent ? (
            <p className="py-4 text-center text-sm text-primary">Thanks! We read every note.</p>
          ) : (
            <>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What's working, what's not, or an idea..."
                rows={3}
                className="w-full resize-none rounded-md border bg-background p-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button onClick={() => setOpen(false)} className="px-2 py-1 text-xs text-muted-foreground">
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={sending || message.trim().length < 3}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
                >
                  {sending ? "Sending..." : "Send"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full border bg-card text-primary shadow-lg hover:bg-muted"
          title="Send feedback"
          aria-label="Send feedback"
        >
          <MessageSquarePlus className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
