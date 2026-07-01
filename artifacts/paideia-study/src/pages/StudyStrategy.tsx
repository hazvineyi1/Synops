import { useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, ArrowRight, BookOpen, Headphones, Eye, Brain,
  CheckCircle2, Clock, Sparkles, Lightbulb, Play,
} from "lucide-react";
import { useGenerateStrategy, useMaterialStrategy } from "@/hooks/use-study-journey";

type Modality = "read" | "listen" | "watch" | "practice" | "reflect";

const MODALITY_ICONS: Record<Modality, typeof BookOpen> = {
  read: BookOpen,
  listen: Headphones,
  watch: Eye,
  practice: Brain,
  reflect: Sparkles,
};

const MODALITY_LABEL: Record<Modality, string> = {
  read: "Read",
  listen: "Listen",
  watch: "Visual",
  practice: "Practice",
  reflect: "Reflect",
};

type Activity = {
  order: number;
  title: string;
  description: string;
  modality: Modality;
  estimatedMinutes: number;
};

export default function StudyStrategy() {
  const [, params] = useRoute("/strategy/:materialId");
  const materialId = params?.materialId;
  const [, setLoc] = useLocation();
  const { data, isLoading } = useMaterialStrategy(materialId);
  const generate = useGenerateStrategy();

  // Auto-generate if missing
  useEffect(() => {
    if (!isLoading && materialId && data && data.strategy === null && !generate.isPending && !generate.isError) {
      generate.mutate({ materialId });
    }
  }, [isLoading, materialId, data, generate]);

  if (!materialId) {
    return <div className="p-8 text-center text-muted-foreground">Missing material id.</div>;
  }

  const strategy = generate.data ?? data?.strategy ?? null;
  const title = data?.title ?? "Your Material";

  if (isLoading || (!strategy && (generate.isPending || generate.isIdle))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center max-w-sm">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin" />
            <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-primary" />
          </div>
          <h2 className="font-semibold mb-1">Building your personalized strategy</h2>
          <p className="text-sm text-muted-foreground">
            Matching your learning profile to "{title}"...
          </p>
        </div>
      </div>
    );
  }

  if (generate.isError && !strategy) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-8 text-center">
            <h2 className="font-bold mb-2">Strategy generation failed</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {(generate.error as Error)?.message || "Please try again."}
            </p>
            <Button onClick={() => generate.mutate({ materialId })}>Try again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!strategy) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        <div>
          <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">
            Your Personalized Strategy
          </p>
          <h1 className="text-2xl font-bold mb-2 leading-tight">{title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{strategy.summary}</p>
        </div>

        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-4 px-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">{strategy.sessionMinutes}-minute session</p>
              </div>
              <Badge variant="outline" className="text-[10px]">{strategy.activities.length} activities</Badge>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {(["text", "audio", "visual", "practice"] as const).map((k) => {
                const v = strategy.modalityMix?.[k] ?? 0;
                return (
                  <div key={k} className="text-center">
                    <div className="text-xs font-semibold mb-1 capitalize">{Math.round(v * 100)}%</div>
                    <Progress value={v * 100} className="h-1.5" />
                    <div className="text-[10px] text-muted-foreground mt-1 capitalize">{k}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Your session, step by step</h3>
          {(strategy.activities as Activity[]).map((act: Activity, i: number) => {
            const Icon = MODALITY_ICONS[act.modality] ?? Brain;
            return (
              <Card key={i}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="text-sm font-semibold truncate">{i + 1}. {act.title}</p>
                        <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {act.estimatedMinutes}m
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{act.description}</p>
                      <Badge variant="outline" className="text-[10px] mt-1.5">
                        {MODALITY_LABEL[act.modality] ?? act.modality}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {strategy.tips?.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/40">
            <CardContent className="py-4 px-5">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="h-4 w-4 text-amber-600" />
                <p className="text-sm font-semibold">Personalized tips</p>
              </div>
              <ul className="text-xs space-y-1.5 text-muted-foreground">
                {(strategy.tips as string[]).map((t: string, i: number) => (
                  <li key={i} className="flex gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-2 pt-2">
          <Button className="flex-1 gap-1.5" size="lg" onClick={() => setLoc(`/materials/${materialId}`)}>
            <Play className="h-4 w-4" /> Begin First Activity
          </Button>
          <Button variant="outline" size="lg" onClick={() => setLoc("/dashboard")}>
            Dashboard <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs"
          onClick={() => generate.mutate({ materialId })}
          disabled={generate.isPending}
        >
          {generate.isPending ? "Regenerating..." : "Regenerate strategy"}
        </Button>
      </main>
    </div>
  );
}
