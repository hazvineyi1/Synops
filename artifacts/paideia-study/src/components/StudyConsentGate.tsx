import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ShieldCheck } from "lucide-react";

/**
 * POPIA consent gate for the Coach learner. Rendered in place of protected
 * content when the signed-in learner has not accepted the current privacy-policy
 * version. On accept it records consent and refetches /me (which clears
 * consentRequired). Re-prompts automatically when the server's
 * PRIVACY_POLICY_VERSION changes.
 */
export function StudyConsentGate() {
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    if (!checked || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/consent", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(String(res.status));
      // Refetch /me so consentRequired clears and the app renders.
      await queryClient.invalidateQueries();
    } catch {
      setError("Could not record your consent. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-8 shadow-lg">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <h1 className="text-2xl font-bold text-foreground">Before you continue</h1>
        </div>
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          We have updated how we describe the handling and protection of your personal information.
          Please review our privacy policy and confirm that you accept it. Your study data is used to
          run your coaching and is kept in line with that policy.
        </p>

        <label className="mb-6 flex cursor-pointer items-start gap-3 text-sm text-foreground">
          <Checkbox
            checked={checked}
            onCheckedChange={(v) => setChecked(v === true)}
            className="mt-0.5"
            aria-label="I have read and accept the privacy policy"
          />
          <span>
            I have read and accept the{" "}
            <Link href="/privacy" className="font-medium text-primary underline">
              Privacy Policy
            </Link>
            .
          </span>
        </label>

        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

        <Button onClick={accept} disabled={!checked || saving} className="w-full">
          {saving ? "Saving..." : "Accept and continue"}
        </Button>
      </div>
    </div>
  );
}

export default StudyConsentGate;
