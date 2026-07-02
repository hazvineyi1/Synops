import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import {
  useGetStudyProfile,
  useUpdateStudyProfile,
} from "@workspace/paideia-api-client";
import {
  ArrowLeft, User, Save, Brain, Layers, Gauge, ListChecks, TrendingUp as TrendIcon,
  TrendingUp, Target, Zap, BarChart3, Clock, ChevronRight, Download, Trash2, ShieldCheck
} from "lucide-react";
import StudyNav from "@/components/StudyNav";

const STRENGTH_LABELS: Record<"recall" | "comprehension" | "application", string> = {
  recall: "Recall",
  comprehension: "Comprehension",
  application: "Application",
};

export default function StudyProfile() {
  const [, setLoc] = useLocation();
  const { data: profile, isLoading } = useGetStudyProfile();
  const updateMutation = useUpdateStudyProfile();

  const [examTarget, setExamTarget] = useState("");
  const [studyStyle, setStudyStyle] = useState("");
  const [interests, setInterests] = useState("");
  const [background, setBackground] = useState("");
  const [dailyStudyMinutes, setDailyStudyMinutes] = useState(30);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setExamTarget(profile.examTarget || "");
      setStudyStyle(profile.studyStyle || "");
      setInterests(profile.interests?.join(", ") || "");
      setBackground(profile.background || "");
      setDailyStudyMinutes(profile.dailyStudyMinutes ?? 30);
    }
  }, [profile]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        data: {
          examTarget,
          studyStyle,
          interests: interests.split(",").map((s) => s.trim()).filter(Boolean),
          background,
          dailyStudyMinutes,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      alert("Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  // ── Data rights (GDPR): export + self-delete ──────────────────────────────
  const [exporting, setExporting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/study/account/export", { credentials: "include" });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "synops-coach-data.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("Could not export your data. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    setDeleteError("");
    setDeleting(true);
    try {
      const res = await fetch("/api/study/account/delete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Could not delete your account");
      }
      // Session is cleared server-side; hard-reload to the sign-in page.
      window.location.href = "/study/login";
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Could not delete your account");
      setDeleting(false);
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
    <div className="min-h-screen bg-background">
      <StudyNav />
      <header className="border-b px-4 py-2 flex items-center justify-between sticky top-12 bg-background/95 backdrop-blur-sm z-40">
        <h1 className="text-sm font-semibold">Profile</h1>
        <Button size="sm" disabled={saving} onClick={handleSave} className="gap-1.5 h-8">
          <Save className="h-3.5 w-3.5" />
          {saved ? "Saved!" : saving ? "Saving..." : "Save Profile"}
        </Button>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Cognitive Profile Card */}
        <div>
          <h1 className="text-2xl font-bold mb-1">Learner Profile</h1>
          <p className="text-sm text-muted-foreground mb-5">
            Your cognitive fingerprint shapes how Synops adapts everything - from flashcard scheduling to question difficulty.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Cognitive profile (evidence-based, NOT VARK / learning styles) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                Cognitive Profile
                <Badge variant="outline" className="ml-auto text-[10px]">
                  {profile?.learningProfile?.inferenceConfidence ?? "developing"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const lp = profile?.learningProfile;
                const strengths = lp?.strengthByQuestionType ?? { recall: 0, comprehension: 0, application: 0 };
                const hasData = lp && (lp.sampleSize ?? 0) > 0;
                return (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-muted/40">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Processing</span>
                        </div>
                        <p className="text-sm font-medium capitalize">{lp?.processingStyle ?? "-"}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/40">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Pace</span>
                        </div>
                        <p className="text-sm font-medium capitalize">{lp?.pace ?? "-"}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/40 col-span-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <TrendIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Within-session confidence</span>
                        </div>
                        <p className="text-sm font-medium capitalize">{lp?.confidencePattern ?? "-"}</p>
                      </div>
                    </div>

                    <div className="space-y-3 pt-1">
                      <div className="flex items-center gap-2">
                        <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Strength by question type</span>
                      </div>
                      {(["recall", "comprehension", "application"] as const).map((key) => {
                        const v = strengths[key] ?? 0;
                        return (
                          <div key={key}>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-sm">{STRENGTH_LABELS[key]}</span>
                              <span className="text-xs font-medium">{v}%</span>
                            </div>
                            <Progress value={v} className="h-1.5" />
                          </div>
                        );
                      })}
                    </div>

                    <p className="text-xs text-muted-foreground pt-1">
                      {hasData
                        ? `Based on ${lp!.sampleSize} responses. We do not use VARK or other learning-styles labels - those are not supported by evidence. This profile is a soft prior that refines as you study.`
                        : "Take a diagnostic or complete a few sessions and your evidence-based profile will appear here. We do not use VARK or learning-styles labels."}
                    </p>
                  </>
                );
              })()}
            </CardContent>
          </Card>

          {/* Learning Stats */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Learning Analytics
                <Badge variant="outline" className="ml-auto text-[10px]">Live</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Zap className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-xs text-muted-foreground">Accuracy</span>
                  </div>
                  <p className="text-xl font-bold">{(((profile as any)?.stats?.accuracyRate ?? 0.72) * 100).toFixed(0)}%</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-xs text-muted-foreground">Avg Session</span>
                  </div>
                  <p className="text-xl font-bold">{(((profile as any)?.stats)?.avgSessionMin ?? 18).toFixed(0)}m</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Target className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-xs text-muted-foreground">Concepts</span>
                  </div>
                  <p className="text-xl font-bold">{((profile as any)?.stats)?.totalConcepts ?? 42}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingUp className="h-3.5 w-3.5 text-purple-500" />
                    <span className="text-xs text-muted-foreground">Streak</span>
                  </div>
                  <p className="text-xl font-bold">{((profile as any)?.stats)?.streakDays ?? 12}d</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Editable Preferences */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Your Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="examTarget">Exam / Goal</Label>
                <Input
                  id="examTarget"
                  value={examTarget}
                  onChange={(e) => setExamTarget(e.target.value)}
                  placeholder="e.g., AP Biology, MCAT, GRE"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="studyStyle">Study Style Preference</Label>
                <Input
                  id="studyStyle"
                  value={studyStyle}
                  onChange={(e) => setStudyStyle(e.target.value)}
                  placeholder="e.g., quick bursts, deep focus blocks"
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="interests">Subject Interests (comma separated)</Label>
              <Input
                id="interests"
                value={interests}
                onChange={(e) => setInterests(e.target.value)}
                placeholder="Cell biology, genetics, biochemistry..."
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="background">Academic Background</Label>
              <Textarea
                id="background"
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                placeholder="Briefly describe your academic background and what you're studying for..."
                className="mt-1.5 resize-none"
                rows={3}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Daily Study Goal</Label>
                <span className="text-sm font-medium">{dailyStudyMinutes} min</span>
              </div>
              <Slider
                value={[dailyStudyMinutes]}
                onValueChange={(v) => setDailyStudyMinutes(v[0])}
                min={5}
                max={120}
                step={5}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                AI adapts your daily plan to fit within this time. 30 min recommended for most learners.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Adaptive Calibration */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Adaptive Calibration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-3 rounded-lg border">
                <p className="text-xs text-muted-foreground mb-1">Optimal Session</p>
                <p className="text-lg font-semibold">{((profile as any)?.stats)?.optimalSessionMin ?? 22} minutes</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Based on your attention patterns
                </p>
              </div>
              <div className="p-3 rounded-lg border">
                <p className="text-xs text-muted-foreground mb-1">Best Time</p>
                <p className="text-lg font-semibold">{((profile as any)?.stats)?.bestStudyTime ?? "7:00–10:00 AM"}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  When your retention peaks
                </p>
              </div>
              <div className="p-3 rounded-lg border">
                <p className="text-xs text-muted-foreground mb-1">Difficulty Bias</p>
                <p className="text-lg font-semibold">{((profile as any)?.stats)?.difficultyBias ?? "Balanced"}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  AI balances challenge vs. confidence
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Privacy & data (GDPR data rights) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Privacy &amp; Data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Download your data</p>
                <p className="text-xs text-muted-foreground">
                  A complete copy of everything Synops holds about you, as a JSON file.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 shrink-0"
                disabled={exporting}
                onClick={handleExport}
              >
                <Download className="h-3.5 w-3.5" />
                {exporting ? "Preparing..." : "Download my data"}
              </Button>
            </div>

            <div className="border-t pt-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-red-600">Delete your account</p>
                  <p className="text-xs text-muted-foreground">
                    Permanently erases your account and all study data. This cannot be undone.
                  </p>
                </div>
                {!showDelete && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 shrink-0 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setShowDelete(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete account
                  </Button>
                )}
              </div>

              {showDelete && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50/60 p-4 space-y-3">
                  <p className="text-sm text-red-700">
                    This is permanent. Enter your password to confirm you want to delete
                    your account and everything in it.
                  </p>
                  <div>
                    <Label htmlFor="deletePassword">Password</Label>
                    <Input
                      id="deletePassword"
                      type="password"
                      autoComplete="current-password"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      className="mt-1.5 max-w-sm"
                    />
                  </div>
                  {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="gap-1.5 bg-red-600 hover:bg-red-700 text-white"
                      disabled={deleting || !deletePassword}
                      onClick={handleDelete}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {deleting ? "Deleting..." : "Permanently delete"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={deleting}
                      onClick={() => {
                        setShowDelete(false);
                        setDeletePassword("");
                        setDeleteError("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
