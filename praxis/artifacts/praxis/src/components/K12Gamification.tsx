import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/context/SessionContext";
import { personaByEmail } from "@/lib/k12Personas";
import { Card } from "@/components/ui/card";
import { Star, Trophy, Zap, CheckCircle2, Circle, Lock, ListChecks } from "lucide-react";

/**
 * Gamification suite for K-12 demo learners (persona.gamified). Turns real progress into game feel:
 *   - an XP + level bar (engagement),
 *   - a "quest path" of the lessons in their course,
 *   - a badge/sticker board (earned + next-to-earn),
 * and, for the autistic learner (persona.autismMode), an autism-friendly VISUAL SCHEDULE (predictable
 * "what happens today") plus a STAR / TOKEN BOARD that fills as the plan is completed. All derived from
 * the learner's own progress + credentials, so nothing new is stored. Renders nothing for others.
 */
interface CourseProg { courseId: string; title: string; percent: number; viewedBeats: number; totalBeats: number; status: string }
interface ProgressMe { courses: CourseProg[]; streak?: number }
interface Credential { moduleTitle: string; masteryScore: string }

export function K12Gamification({ compact = false }: { compact?: boolean } = {}) {
  const { user } = useSession();
  const persona = personaByEmail(user?.email);
  const { data: prog } = useQuery({ queryKey: ["progress", "me"], queryFn: () => apiFetch<ProgressMe>("/progress/me") });
  const { data: creds } = useQuery({ queryKey: ["credentials"], queryFn: () => apiFetch<Credential[]>("/credentials") });

  if (!persona || !persona.gamified) return null;

  const course = prog?.courses?.[0];
  const viewed = prog?.courses?.reduce((n, c) => n + (c.viewedBeats ?? 0), 0) ?? 0;
  const badges = creds?.length ?? 0;
  const streak = prog?.streak ?? 0;
  const xp = viewed * 12 + badges * 60 + Math.round((course?.percent ?? 0) / 2);
  const level = Math.floor(xp / 100) + 1;
  const intoLevel = xp % 100;
  const accent = persona.accent;
  const es = persona.defaultLang === "es";
  const L = (en: string, esT: string) => (es ? esT : en);

  // Quest path: one dot per lesson (module), filled by overall percent.
  const pct = course?.percent ?? 0;
  const lessons = Math.max(2, Math.round((course?.totalBeats ?? 6) / 3));
  const doneLessons = Math.round((pct / 100) * lessons);

  // Autism visual schedule + star board (predictable steps for today).
  const schedule = [
    { label: "Warm-up", icon: Zap },
    { label: "Watch & read", icon: ListChecks },
    { label: "Practice quiz", icon: CheckCircle2 },
    { label: "Tutor check", icon: Trophy },
    { label: "All done!", icon: Star },
  ];
  const stepsDone = Math.min(schedule.length, Math.max(0, Math.round((pct / 100) * schedule.length)));

  // Compact: a single slim status bar for the dashboard — level, XP, streak, badges + a thin
  // progress bar. No quest dots or schedule (those live in the full view), so it never dwarfs the lessons.
  if (compact) {
    return (
      <div className="py-1">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-sm" style={{ color: accent }}>{L("Level", "Nivel")} {level} · {xp.toLocaleString()} XP</span>
          <span className="text-[11px] text-muted-foreground">{L(`${doneLessons} of ${lessons} lessons done`, `${doneLessons} de ${lessons} lecciones`)}</span>
        </div>
        <div className="mt-2 h-2 w-full bg-black/5 overflow-hidden" style={{ borderRadius: 3 }}>
          <div className="h-full" style={{ width: `${intoLevel}%`, background: accent, borderRadius: 3 }} />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {L(`${100 - intoLevel} XP to Level ${level + 1}`, `${100 - intoLevel} XP para el Nivel ${level + 1}`)}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* XP + level */}
      <Card className="p-4 sm:p-5" style={{ borderColor: `${accent}44`, background: `${accent}0A` }}>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="h-11 w-11 rounded-xl flex items-center justify-center text-white font-bold shadow-sm" style={{ background: accent }}>
            <Trophy className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold leading-tight">{L("Level", "Nivel")} {level} · {xp.toLocaleString()} XP</p>
            <p className="text-xs text-muted-foreground">{L(`Keep going — ${100 - intoLevel} XP to Level ${level + 1}.`, `¡Sigue así! — ${100 - intoLevel} XP para el Nivel ${level + 1}.`)}</p>
          </div>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: accent }}><Star className="h-4 w-4" /> {badges} {es ? (badges === 1 ? "insignia" : "insignias") : `badge${badges === 1 ? "" : "s"}`}</span>
            <span className="inline-flex items-center gap-1.5 font-medium text-amber-600"><Zap className="h-4 w-4" /> {L(`${streak} day streak`, `racha de ${streak} día${streak === 1 ? "" : "s"}`)}</span>
          </div>
        </div>
        <div className="mt-3 h-3 w-full rounded-full bg-black/5 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${intoLevel}%`, background: accent }} />
        </div>

        {/* Quest path */}
        <div className="mt-4 flex items-center gap-1.5">
          {Array.from({ length: lessons }).map((_, i) => {
            const done = i < doneLessons;
            const current = i === doneLessons;
            return (
              <div key={i} className="flex items-center gap-1.5 flex-1 last:flex-none">
                <div className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ background: done ? accent : current ? "#fff" : "#e7e3ee", color: current ? accent : done ? "#fff" : "#a8a2b4", border: current ? `2px solid ${accent}` : "none" }}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : current ? <Circle className="h-3.5 w-3.5" /> : <Lock className="h-3 w-3" />}
                </div>
                {i < lessons - 1 && <div className="h-1 flex-1 rounded-full" style={{ background: i < doneLessons ? accent : "#e7e3ee" }} />}
              </div>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">{L(`Your quest: ${doneLessons} of ${lessons} lessons complete`, `Tu misión: ${doneLessons} de ${lessons} lecciones completadas`)}</p>
      </Card>

      {/* Autism-friendly: visual schedule + star/token board */}
      {persona.autismMode && (
        <Card className="p-4 sm:p-5" style={{ borderColor: `${accent}44`, background: `${accent}0A` }}>
          <p className="font-semibold leading-tight flex items-center gap-2"><ListChecks className="h-4 w-4" style={{ color: accent }} /> Today&rsquo;s plan</p>
          <p className="text-xs text-muted-foreground mb-3">Same steps, every time. You always know what comes next.</p>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            {schedule.map((s, i) => {
              const done = i < stepsDone;
              const now = i === stepsDone;
              const Icon = s.icon;
              return (
                <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: done ? `${accent}18` : now ? "#fff" : "#f4f2f8", border: now ? `2px solid ${accent}` : "1px solid #ece7f2" }}>
                  <Icon className="h-5 w-5 mx-auto mb-1" style={{ color: done || now ? accent : "#b6b0c2" }} />
                  <div className="text-[12px] font-medium" style={{ color: done || now ? "#2b2833" : "#9a94a6" }}>{i + 1}. {s.label}</div>
                  {done && <div className="text-[10px] mt-0.5" style={{ color: accent }}>✓ done</div>}
                  {now && <div className="text-[10px] mt-0.5" style={{ color: accent }}>you are here</div>}
                </div>
              );
            })}
          </div>

          {/* Star / token board */}
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium mr-1">Star board:</span>
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-7 w-7" style={{ color: i < stepsDone ? "#F59E0B" : "#e2ddea", fill: i < stepsDone ? "#F59E0B" : "transparent" }} />
            ))}
            <span className="text-xs text-muted-foreground ml-1">{stepsDone === 5 ? "Amazing — all 5 stars! 🎉" : `${5 - stepsDone} more to a full board`}</span>
          </div>
        </Card>
      )}
    </div>
  );
}
