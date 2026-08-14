import React from "react";
import { motion } from "framer-motion";
import {
  useCoachProfile,
  useUpdateCoachProfile,
  useWhatsappStatus,
  PERSONALITY_META,
  VARK_OPTIONS,
  ACCOMMODATION_OPTIONS,
  type CoachPersonality,
} from "@/lib/coachApi";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Check, MessageCircle } from "lucide-react";

export function CoachSettings() {
  const { data: profile, isLoading, isError } = useCoachProfile();
  const { data: waStatus } = useWhatsappStatus();
  const update = useUpdateCoachProfile();
  const { toast } = useToast();

  // Local draft of the WhatsApp number so the learner can register/change the number the coach
  // messages them on. The inbound webhook matches on this exact number, so it must be theirs.
  const [phone, setPhone] = React.useState("");
  React.useEffect(() => { if (profile) setPhone(profile.phone ?? ""); }, [profile]);

  // When arrived from the "Coach on WhatsApp" hub card (?focus=whatsapp), jump straight to the
  // WhatsApp section instead of landing at the top of the settings page.
  React.useEffect(() => {
    if (!profile) return;
    try {
      if (new URLSearchParams(window.location.search).get("focus") === "whatsapp") {
        setTimeout(() => document.getElementById("coach-whatsapp")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
      }
    } catch { /* ignore */ }
  }, [profile]);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 w-64 bg-muted rounded" />
        <div className="h-48 bg-muted rounded-2xl" />
        <div className="h-48 bg-muted rounded-2xl" />
      </div>
    );
  }
  if (isError || !profile) {
    return <div className="text-center text-muted-foreground py-16">Could not load your coach settings. Please refresh.</div>;
  }

  const save = (patch: Parameters<typeof update.mutate>[0], label = "Saved") =>
    update.mutate(patch, {
      onSuccess: () => toast({ title: label }),
      onError: (e) => toast({ title: "Could not save", description: (e as Error).message, variant: "destructive" }),
    });

  const toggleAccommodation = (value: string) => {
    const set = new Set(profile.accommodations);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    save({ accommodations: [...set] });
  };

  return (
    <div className="space-y-8 max-w-3xl">
      <PageHeader title="Your coach" icon={MessageCircle} subtitle="Shape how your coach questions you. Changes apply to your next exchange, here and on WhatsApp." />

      {/* Personality */}
      <section className="space-y-3">
        <SectionHeading icon={MessageCircle} title="Coaching style" hint="How your coach pushes and encourages you." />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(Object.keys(PERSONALITY_META) as CoachPersonality[]).map((key) => {
            const m = PERSONALITY_META[key];
            const active = profile.coachPersonality === key;
            return (
              <motion.button
                key={key}
                whileTap={{ scale: 0.98 }}
                onClick={() => save({ coachPersonality: key }, `Coach set to ${m.label}`)}
                className={cn(
                  "text-left rounded-2xl border p-4 transition-all relative overflow-hidden bg-gradient-to-br",
                  active ? "border-primary ring-2 ring-primary/30 " + m.accent : "border-border hover:border-primary/40"
                )}
              >
                {active && (
                  <span className="absolute top-3 right-3 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                    <Check className="h-4 w-4" />
                  </span>
                )}
                <h3 className="font-semibold mb-1">{m.label}</h3>
                <p className="text-sm text-muted-foreground pr-6">{m.blurb}</p>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* Learning style */}
      <section className="space-y-3">
        <SectionHeading title="How you learn best" hint="Your coach adapts the way it frames questions." />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {VARK_OPTIONS.map((opt) => {
            const active = profile.learningStyle === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => save({ learningStyle: active ? null : opt.value })}
                className={cn(
                  "relative rounded-xl border p-3 text-center transition-colors",
                  active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                )}
              >
                {active && (
                  <span className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                    <Check className="h-3 w-3" />
                  </span>
                )}
                <p className="font-medium text-sm">{opt.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.hint}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Accommodations */}
      <section className="space-y-3">
        <SectionHeading title="Support preferences" hint="Applied quietly. Your coach never announces or labels these." />
        <div className="flex flex-wrap gap-2">
          {ACCOMMODATION_OPTIONS.map((opt) => {
            const active = profile.accommodations.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => toggleAccommodation(opt.value)}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted/40"
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* WhatsApp */}
      <section id="coach-whatsapp" className="space-y-3 scroll-mt-4">
        <SectionHeading icon={MessageCircle} title="WhatsApp coaching" hint="Opt in to answer your coach's questions from WhatsApp and get nudges before your credentials expire." />
        <div className="rounded-2xl border border-border bg-card p-5 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">Use WhatsApp coaching</p>
              <p className="text-sm text-muted-foreground">
                {profile.whatsappOptIn
                  ? waStatus?.configured
                    ? "You're opted in. Save your WhatsApp number below, then send START on WhatsApp to begin a session."
                    : "You're opted in. WhatsApp activates once it is connected for your organisation."
                  : "Chat with your coach on WhatsApp. Turn this on, then save the WhatsApp number you'll message from."}
              </p>
            </div>
            <Switch
              checked={profile.whatsappOptIn}
              onCheckedChange={(v) => save({ whatsappOptIn: v }, v ? "WhatsApp coaching on" : "WhatsApp coaching off")}
            />
          </div>

          {/* Number registration: the coach only recognises the exact number saved here. */}
          <div className="border-t border-border pt-4">
            <label htmlFor="wa-number" className="text-sm font-medium">Your WhatsApp number</label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-2">
              Use the full international format, including your country code, e.g. +27 82 123 4567.
            </p>
            <div className="flex gap-2">
              <input
                id="wa-number"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+27821234567"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <button
                onClick={() => save({ phone: phone.trim() }, phone.trim() ? "WhatsApp number saved" : "WhatsApp number cleared")}
                disabled={update.isPending || phone.trim() === (profile.phone ?? "").trim()}
                className={cn(
                  "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                  update.isPending || phone.trim() === (profile.phone ?? "").trim()
                    ? "bg-muted text-muted-foreground"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
              >
                Save
              </button>
            </div>
            {profile.phone && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <Check className="h-3 w-3 text-emerald-600" /> Coaching messages go to {profile.phone}.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  hint,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
}) {
  return (
    <div>
      <h2 className="text-lg font-serif font-semibold flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-primary" />}
        {title}
      </h2>
      {hint && <p className="text-sm text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}
