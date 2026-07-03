import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import StudyNav from "@/components/StudyNav";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  useListStudyMaterials,
  useCreateStudyPractice,
} from "@workspace/paideia-api-client";
import { upgradeError } from "@/lib/upgrade";
import {
  ArrowLeft, Play, BrainCircuit, Target, Zap, BarChart3,
  BookOpen, ChevronRight, TrendingUp, Check, Loader2
} from "lucide-react";

type DifficultyLevel = "easy" | "medium" | "hard" | "mixed";

const DIFFICULTIES: {
  id: DifficultyLevel; label: string; dot: string; selectedBg: string; selectedBorder: string; selectedText: string; desc: string;
}[] = [
  { id: "easy",   label: "Easy",     dot: "bg-emerald-500", selectedBg: "bg-emerald-50", selectedBorder: "border-emerald-500", selectedText: "text-emerald-700", desc: "Warm-up, confidence building" },
  { id: "medium", label: "Medium",   dot: "bg-blue-500",    selectedBg: "bg-blue-50",    selectedBorder: "border-blue-500",    selectedText: "text-blue-700",    desc: "Balanced challenge" },
  { id: "hard",   label: "Hard",     dot: "bg-amber-500",   selectedBg: "bg-amber-50",   selectedBorder: "border-amber-500",   selectedText: "text-amber-700",   desc: "Push your limits" },
  { id: "mixed",  label: "Adaptive", dot: "bg-primary",     selectedBg: "bg-primary/10", selectedBorder: "border-primary",     selectedText: "text-primary",     desc: "AI adjusts per question" },
];

export default function StudyPractice() {
  const [, setLoc] = useLocation();
  const { data: materials, isLoading: matLoading } = useListStudyMaterials();
  const createMutation = useCreateStudyPractice();

  const [materialId, setMaterialId] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("material") || "";
    } catch { return ""; }
  });

  // Keep selection in sync if user arrives with a different ?material= later
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("material");
    if (fromUrl && fromUrl !== materialId) setMaterialId(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("mixed");
  const [focusMode, setFocusMode] = useState(false);
  const [creating, setCreating] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const handleCreate = async () => {
    if (!materialId) return;
    setError(null);
    setCreating(true);
    try {
      const res = await createMutation.mutateAsync({
        data: { materialId, questionCount, difficulty },
      });
      setLoc(`/practice/${res.id}`);
    } catch (err: unknown) {
      const up = upgradeError(err);
      if (up) {
        if (window.confirm(`${up.message}\n\nOpen the plans page?`)) setLoc("/upgrade");
        setCreating(false);
        return;
      }
      const msg =
        (err as { data?: { error?: string } })?.data?.error ||
        (err as { message?: string })?.message ||
        "Failed to start practice session. Please try again.";
      setError(msg);
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <StudyNav />

      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1">Adaptive Practice</h1>
          <p className="text-sm text-muted-foreground">
            AI generates questions from your materials and adapts difficulty based on your performance.
          </p>
        </div>

        {/* Source Material */}
        <Card className="mb-4">
          <CardContent className="py-5 space-y-5">
            <div>
              <Label className="flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                Source Material
              </Label>
              {matLoading ? (
                <p className="text-sm text-muted-foreground py-2">Loading...</p>
              ) : (
                <select
                  value={materialId}
                  onChange={(e) => setMaterialId(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm mt-1.5"
                >
                  <option value="">Select a material</option>
                  {materials?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title} ({m.flashcardCount} cards, {m.conceptCount} concepts)
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Question Count */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="flex items-center gap-2">
                  <Target className="h-3.5 w-3.5 text-muted-foreground" />
                  Questions
                </Label>
                <span className="text-sm font-medium">{questionCount}</span>
              </div>
              <Slider
                value={[questionCount]}
                onValueChange={(v) => setQuestionCount(v[0])}
                min={3}
                max={30}
                step={1}
              />
            </div>

            {/* Difficulty Selection */}
            <div>
              <Label className="flex items-center gap-2 mb-3">
                <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                Difficulty Mode
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DIFFICULTIES.map((d) => {
                  const selected = difficulty === d.id;
                  return (
                    <button
                      key={d.id}
                      onClick={() => setDifficulty(d.id)}
                      aria-pressed={selected}
                      className={`relative p-3 rounded-xl border-2 text-left transition-all ${
                        selected
                          ? `${d.selectedBorder} ${d.selectedBg} shadow-sm`
                          : "border-border bg-card hover:bg-muted/40"
                      }`}
                    >
                      {selected && (
                        <div className={`absolute top-1.5 right-1.5 h-4 w-4 rounded-full flex items-center justify-center ${d.selectedBorder.replace("border-", "bg-")}`}>
                          <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                        </div>
                      )}
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2 h-2 rounded-full ${d.dot}`} />
                        <span className={`text-sm font-medium ${selected ? d.selectedText : ""}`}>
                          {d.label}
                        </span>
                        {d.id === "mixed" && !selected && (
                          <Badge variant="outline" className="ml-auto text-[10px] h-5">AI</Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">{d.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Adaptive Features */}
            <div className="p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Confidence Calibration</span>
                </div>
                <Badge variant="secondary" className="text-[10px]">Enabled</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                After each answer, rate your confidence (1-5). AI tracks metacognition and adjusts difficulty.
              </p>
            </div>

            {(() => {
              const sel = materials?.find((m) => m.id === materialId);
              if (!sel || (sel.conceptCount ?? 0) > 0) return null;
              return (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-2">
                  This material has no analyzed concepts yet, so questions can&apos;t be
                  generated. Open it from Materials and use &quot;Re-analyze material&quot; first.
                </p>
              );
            })()}
            <Button
              className="w-full gap-2"
              size="lg"
              onClick={handleCreate}
              disabled={!materialId || creating || ((materials?.find((m) => m.id === materialId)?.conceptCount ?? 1) === 0)}
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating {questionCount} questions...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Start Practice Session
                </>
              )}
            </Button>
            {creating && (
              <p className="text-xs text-center text-muted-foreground -mt-2">
                This usually takes 10–20 seconds while AI tailors each question to your material.
              </p>
            )}
            {error && !creating && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                {error}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Stats Preview */}
        <Card className="border-dashed">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Your Practice Trends</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-2xl font-bold">14</p>
                <p className="text-xs text-muted-foreground">Sessions</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">78%</p>
                <p className="text-xs text-muted-foreground">Accuracy</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">4.2</p>
                <p className="text-xs text-muted-foreground">Avg Confidence</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
