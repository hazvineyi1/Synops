import { useState, useRef, DragEvent } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { notifyError } from "@/lib/notify";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  useCreateStudyMaterial,
  getListStudyMaterialsQueryKey,
} from "@workspace/paideia-api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useStudyProfile, useUpdateStudyProfile } from "@/hooks/use-study-journey";
import { useEffect } from "react";
import {
  ArrowLeft, Sparkles, FileText, Link2, Upload, Image as ImageIcon,
  Brain, Loader2, CheckCircle2, X, Rocket, Search,
  BookOpen, Zap, Compass, ChevronRight, FileAudio, FileVideo, File as FileIcon, AlertCircle
} from "lucide-react";
import StudyNav from "@/components/StudyNav";

type TabId = "paste" | "url" | "topic" | "files";

function fileIconFor(file: File) {
  const t = file.type;
  if (t.startsWith("image/")) return ImageIcon;
  if (t.startsWith("audio/")) return FileAudio;
  if (t.startsWith("video/")) return FileVideo;
  if (t === "application/pdf" || /\.(pdf|docx?|txt|md)$/i.test(file.name)) return FileText;
  return FileIcon;
}

function prettySize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const MAX_FILES = 10;
const ACCEPT_ALL =
  ".pdf,.doc,.docx,.txt,.md,image/*,audio/*,video/*";

export default function StudyMaterialNew() {
  const [, setLoc] = useLocation();
  const createMutation = useCreateStudyMaterial();
  const updateProfile = useUpdateStudyProfile();
  const { data: profile } = useStudyProfile();
  const queryClient = useQueryClient();

  // Single onboarding gate: incomplete intake → /intake (The Coach spec dropped the learning-style gate).
  useEffect(() => {
    if (profile && !profile.diagnosticComplete) {
      setLoc("/intake");
    }
  }, [profile, setLoc]);

  const [learningGoal, setLearningGoal] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [topic, setTopic] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("paste");
  const [submitting, setSubmitting] = useState(false);
  const [stage, setStage] = useState<"input" | "processing" | "done">("input");
  const [createdMaterials, setCreatedMaterials] = useState<any[]>([]);
  const [processedReport, setProcessedReport] = useState<Array<{label: string; kind: string; chars: number; error: string | null}>>([]);
  const [dragOver, setDragOver] = useState(false);
  const [pickedFiles, setPickedFiles] = useState<File[]>([]);
  const [combine, setCombine] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    const merged = [...pickedFiles, ...arr].slice(0, MAX_FILES);
    setPickedFiles(merged);
  };

  const removeFile = (idx: number) => {
    setPickedFiles((files) => files.filter((_, i) => i !== idx));
  };

  const saveLearningGoal = async () => {
    const goal = learningGoal.trim();
    if (goal && goal !== (profile?.examTarget ?? "")) {
      try {
        await updateProfile.mutateAsync({ examTarget: goal });
      } catch { /* non-fatal */ }
    }
  };

  const triggerKnowledgeGen = async (materialId: string) => {
    try {
      await fetch("/api/study/knowledge/generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialId }),
      });
    } catch { /* non-fatal */ }
  };

  const handleSubmitText = async () => {
    if (!title || !content) return;
    setSubmitting(true);
    setStage("processing");
    try {
      await saveLearningGoal();
      const material = await createMutation.mutateAsync({
        data: { title, sourceType: "paste", sourceUrl: null, contentText: content },
      });
      queryClient.invalidateQueries({ queryKey: getListStudyMaterialsQueryKey() });
      setCreatedMaterials([material]);
      await triggerKnowledgeGen(material.id);
      setStage("done");
    } catch (err: any) {
      notifyError(err?.data?.error, "Could not add that material. Please try again.");
      setSubmitting(false);
      setStage("input");
    }
  };

  const handleSubmitUrl = async () => {
    if (!sourceUrl) return;
    setSubmitting(true);
    setStage("processing");
    try {
      await saveLearningGoal();
      const fd = new FormData();
      // Title is derived server-side from the fetched page title.
      fd.append("combine", "true");
      fd.append("urls", sourceUrl);
      const res = await fetch("/api/study/materials/upload", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to fetch URL");
      }
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: getListStudyMaterialsQueryKey() });
      setCreatedMaterials(data.materials ?? []);
      setProcessedReport(data.processed ?? []);
      for (const m of data.materials ?? []) await triggerKnowledgeGen(m.id);
      setStage("done");
    } catch (err: any) {
      notifyError(err?.message, "Could not add that material. Please try again.");
      setSubmitting(false);
      setStage("input");
    }
  };

  const handleSubmitTopic = async () => {
    const t = topic.trim();
    if (!t) return;
    setSubmitting(true);
    setStage("processing");
    try {
      await saveLearningGoal();
      const fd = new FormData();
      // Title is derived server-side from the researched topic.
      fd.append("combine", "true");
      fd.append("topics", t);
      const res = await fetch("/api/study/materials/upload", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to research topic");
      }
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: getListStudyMaterialsQueryKey() });
      setCreatedMaterials(data.materials ?? []);
      setProcessedReport(data.processed ?? []);
      for (const m of data.materials ?? []) await triggerKnowledgeGen(m.id);
      setStage("done");
    } catch (err: any) {
      notifyError(err?.message, "Could not research that topic. Please try again.");
      setSubmitting(false);
      setStage("input");
    }
  };

  const handleSubmitFiles = async () => {
    if (pickedFiles.length === 0) return;
    setSubmitting(true);
    setStage("processing");
    try {
      await saveLearningGoal();
      const fd = new FormData();
      // Titles are derived server-side from each file name (or "Study Pack (N)").
      fd.append("combine", combine ? "true" : "false");
      for (const f of pickedFiles) fd.append("files", f, f.name);
      const res = await fetch("/api/study/materials/upload", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Upload failed (${res.status})`);
      }
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: getListStudyMaterialsQueryKey() });
      setCreatedMaterials(data.materials ?? []);
      setProcessedReport(data.processed ?? []);
      for (const m of data.materials ?? []) await triggerKnowledgeGen(m.id);
      setStage("done");
    } catch (err: any) {
      notifyError(err?.message, "Could not add those materials. Please try again.");
      setSubmitting(false);
      setStage("input");
    }
  };

  const handleGenerateStrategy = () => {
    const first = createdMaterials[0];
    if (!first) return;
    setLoc(`/strategy/${first.id}`);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  // ---- Done stage ----
  if (stage === "done" && createdMaterials.length > 0) {
    const single = createdMaterials.length === 1;
    const failed = processedReport.filter((p) => p.error);
    return (
      <div className="min-h-screen bg-background">
        <main className="max-w-lg mx-auto px-4 py-12 text-center">
          <div className="w-20 h-20 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold mb-2">
            {single ? "Material Added!" : `${createdMaterials.length} Materials Added!`}
          </h1>
          {single ? (
            <p className="text-muted-foreground mb-2">{createdMaterials[0].title}</p>
          ) : (
            <div className="text-sm text-muted-foreground mb-3 space-y-1">
              {createdMaterials.map((m) => (
                <div key={m.id}>· {m.title}</div>
              ))}
            </div>
          )}
          <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
            AI is extracting concepts and building your knowledge graph. Now we'll combine that with your learning profile to build a personalized study strategy.
          </p>

          {failed.length > 0 && (
            <div className="text-left bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-xs">
              <div className="flex items-center gap-1.5 font-medium text-amber-800 mb-1">
                <AlertCircle className="h-3.5 w-3.5" /> {failed.length} item(s) could not be processed:
              </div>
              <ul className="text-amber-700 space-y-0.5">
                {failed.map((f, i) => (
                  <li key={i}>· {f.label}: {f.error}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-center gap-4 mb-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><BookOpen className="h-3 w-3 text-primary" /> Concepts Extracted</span>
            <span className="flex items-center gap-1"><Zap className="h-3 w-3 text-primary" /> Flashcards Ready</span>
            <span className="flex items-center gap-1"><Compass className="h-3 w-3 text-primary" /> Path Waiting</span>
          </div>

          <Button
            size="lg"
            className="gap-2 w-full max-w-xs"
            onClick={handleGenerateStrategy}
          >
            <Sparkles className="h-4 w-4" /> Generate My Study Strategy <ChevronRight className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="mt-3 text-xs"
            onClick={() => setLoc(single ? "/dashboard" : "/materials")}
          >
            {single ? "Skip for Now → Dashboard" : "View All Materials →"}
          </Button>
        </main>
      </div>
    );
  }

  // ---- Processing stage ----
  if (stage === "processing") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-sm px-4">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin" />
            <Brain className="absolute inset-0 m-auto h-6 w-6 text-primary" />
          </div>
          <h2 className="font-semibold mb-1">AI is Analyzing Your Material</h2>
          <p className="text-sm text-muted-foreground">
            Reading files, transcribing audio, extracting concepts...
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            This can take 10-60 seconds depending on size.
          </p>
        </div>
      </div>
    );
  }

  // ---- Input stage ----
  const fileSubmitDisabled = pickedFiles.length === 0 || submitting;

  return (
    <div className="min-h-screen bg-background">
      <StudyNav />
      <header className="border-b px-4 py-2 flex items-center justify-between sticky top-12 bg-background/95 backdrop-blur-sm z-40">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setLoc("/materials")}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Start Your Learning Journey</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">Set Up Your Learning Journey</h1>
          <p className="text-sm text-muted-foreground">
            Share any materials - PDFs, Word docs, photos of notes, lectures, podcasts, web pages. AI handles the rest.
          </p>
        </div>

        {/* Learning Goal */}
        <Card className="mb-5 border-primary/20 bg-primary/5">
          <CardContent className="py-5 px-5">
            <div className="flex items-center gap-2 mb-2">
              <Rocket className="h-4 w-4 text-primary" />
              <Label htmlFor="goal" className="text-sm font-semibold m-0">What are you preparing for?</Label>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              The AI uses this to focus every step on your goal - exam, certification, project, or topic mastery.
            </p>
            <Input
              id="goal"
              placeholder="e.g., Scrum Master Certification, AWS Solutions Architect, USMLE Step 1"
              value={learningGoal}
              onChange={(e) => setLearningGoal(e.target.value)}
              className="bg-background"
            />
            {profile?.examTarget && !learningGoal && (
              <p className="text-[11px] text-muted-foreground mt-2">
                Current goal: <span className="font-medium">{profile.examTarget}</span> · type above to change
              </p>
            )}
          </CardContent>
        </Card>

        {/* Source Type Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
          {([
            { id: "paste", label: "Paste Text", icon: FileText, desc: "Notes, articles, content" },
            { id: "url", label: "Web URL", icon: Link2, desc: "Articles, Wikipedia, docs" },
            { id: "topic", label: "Research a Topic", icon: Search, desc: "We fetch real sources for you" },
            { id: "files", label: "Upload Files", icon: Upload, desc: "PDFs, docs, images, audio, video" },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              onClick={() => setActiveTab(opt.id)}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all text-left ${
                activeTab === opt.id
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border bg-card hover:border-primary/30 hover:bg-accent/50"
              }`}
            >
              <opt.icon className={`h-5 w-5 ${activeTab === opt.id ? "text-primary" : "text-muted-foreground"}`} />
              <div className="text-center">
                <p className={`text-xs font-medium ${activeTab === opt.id ? "text-primary" : ""}`}>{opt.label}</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 hidden sm:block">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Content Area */}
        <Card className="mb-6">
          <CardContent className="py-5 px-5">
            {activeTab === "paste" && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm">Paste Your Study Notes</h3>
                  <Badge variant="outline" className="text-[10px] h-5 ml-auto">Fastest</Badge>
                </div>
                <div className="mb-3">
                  <Label htmlFor="paste-title" className="text-sm font-medium">Material title</Label>
                  <Input
                    id="paste-title"
                    placeholder="e.g., Cell Biology Lecture Notes"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
                <Textarea
                  placeholder="Paste lecture notes, textbook chapters, study guides, or any text content here..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={14}
                  className="resize-none text-sm leading-relaxed"
                />
                <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                  <span>{content.length.toLocaleString()} characters</span>
                  <span>AI extracts ~1 concept per 200 words</span>
                </div>
              </div>
            )}

            {activeTab === "url" && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Link2 className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm">Link to Web Content</h3>
                </div>
                <Input
                  placeholder="https://en.wikipedia.org/wiki/Cell_biology"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  We fetch the page and extract its real content. If the page is thin or JavaScript-heavy, we automatically fall back to a grounded web search on that URL, never made-up content.
                </p>
              </div>
            )}

            {activeTab === "topic" && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Search className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm">Research a Topic or Course</h3>
                  <Badge variant="outline" className="text-[10px] h-5 ml-auto">Cited sources</Badge>
                </div>
                <Textarea
                  placeholder={`Examples:\n• "PMP exam, process groups and knowledge areas"\n• "CCNA, OSI model fundamentals"\n• "AP Biology Unit 4: cell communication and the cell cycle"`}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  rows={5}
                  className="resize-none text-sm leading-relaxed"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  We use a live web search to gather real, authoritative material, official docs, recognized standards, peer-reviewed sources, and assemble it into a study reference with citations. Nothing is invented. This usually takes 15–30 seconds.
                </p>
              </div>
            )}

            {activeTab === "files" && (
              <div>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                    dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-muted-foreground/40"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPT_ALL}
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                    <Upload className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium mb-1">
                    Drop files here or pick up to {MAX_FILES} from your device
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    PDF · Word · TXT · Images · Audio · Video (max 50 MB each)
                  </p>
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    Browse Files
                  </Button>
                </div>

                {pickedFiles.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{pickedFiles.length} file{pickedFiles.length === 1 ? "" : "s"} selected</span>
                      <button
                        type="button"
                        onClick={() => setPickedFiles([])}
                        className="text-muted-foreground hover:text-foreground underline"
                      >
                        Clear all
                      </button>
                    </div>
                    <ul className="space-y-1.5">
                      {pickedFiles.map((f, i) => {
                        const Icon = fileIconFor(f);
                        return (
                          <li key={i} className="flex items-center gap-2 p-2 rounded-lg border bg-card">
                            <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{f.name}</p>
                              <p className="text-[10px] text-muted-foreground">{prettySize(f.size)}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFile(i)}
                              className="text-muted-foreground hover:text-foreground p-1"
                              aria-label="Remove file"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>

                    {pickedFiles.length > 1 && (
                      <div className="mt-3 p-3 rounded-lg border bg-muted/30">
                        <p className="text-xs font-medium mb-2">How should these be organized?</p>
                        <div className="space-y-1.5">
                          <label className="flex items-start gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="combine"
                              checked={!combine}
                              onChange={() => setCombine(false)}
                              className="mt-0.5"
                            />
                            <div>
                              <p className="text-xs font-medium">Keep as separate materials</p>
                              <p className="text-[10px] text-muted-foreground">Each file gets its own concepts, flashcards, and assessment.</p>
                            </div>
                          </label>
                          <label className="flex items-start gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="combine"
                              checked={combine}
                              onChange={() => setCombine(true)}
                              className="mt-0.5"
                            />
                            <div>
                              <p className="text-xs font-medium">Combine into one material</p>
                              <p className="text-[10px] text-muted-foreground">All files merged into a single knowledge graph and assessment.</p>
                            </div>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Submit */}
        <Button
          className="w-full gap-2"
          size="lg"
          disabled={
            submitting ||
            (activeTab === "paste" && (!title || !content)) ||
            (activeTab === "url" && !sourceUrl) ||
            (activeTab === "topic" && !topic.trim()) ||
            (activeTab === "files" && fileSubmitDisabled)
          }
          onClick={() => {
            if (activeTab === "paste") handleSubmitText();
            else if (activeTab === "url") handleSubmitUrl();
            else if (activeTab === "topic") handleSubmitTopic();
            else handleSubmitFiles();
          }}
        >
          {submitting ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> AI is analyzing your material...</>
          ) : (
            <><Sparkles className="h-4 w-4" /> Start Learning - Generate Concepts & Path</>
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center mt-3">
          AI reads PDFs and docs, transcribes audio/video, and reads images using vision models. Then it extracts concepts, generates flashcards, and creates your personalized learning path.
        </p>
      </main>
    </div>
  );
}
