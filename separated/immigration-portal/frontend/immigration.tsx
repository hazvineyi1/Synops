import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Compass,
  BookOpen,
  FileText,
  Save,
  Loader2,
  ArrowLeft,
  AlertTriangle,
  Trash2,
  ExternalLink,
  Users,
  HelpCircle,
  Newspaper,
} from "lucide-react";
import { useUser } from "@clerk/react";
import { useT, LanguageSwitcher, englishName } from "../lib/i18n";

type TabKey = "guidance" | "scenarios" | "forms" | "updates" | "cases";

type ImmigrationForm = {
  code: string;
  name: string;
  purpose: string;
  approxFee: string;
  category: string;
};

type Scenario = {
  id: string;
  title: string;
  category: string;
  situation: string;
  likelyForms: string[];
  approxCost: string;
  typicalTimeline: string;
  whatHelps: string[];
  whatToWatch: string[];
};

type Guidance = {
  summary?: string;
  forms?: { code: string; why: string; fee: string }[];
  steps?: string[];
  watchOut?: string[];
  relatableExamples?: { situation: string; takeaway: string }[];
  followUpQuestions?: string[];
  attorneyNote?: string;
};

type SavedCase = {
  id: number;
  title: string;
  situation: string;
  guidance: string;
  createdAt: string;
};

type UpdateItem = { title: string; link: string; date: string; summary: string };
type UpdateSource = { label: string; url: string; note: string };

async function api(path: string, options?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", ...options });
  if (!res.ok) {
    let msg = "Something went wrong. Please try again.";
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

function DisclaimerBanner() {
  const { t } = useT();
  return (
    <div className="flex gap-3 items-start rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground">
      <AlertTriangle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
      <p>
        <span className="font-semibold">{t("imm.disc.strong")}</span>{" "}
        {t("imm.disc.rest")}{" "}
        <a href="https://www.uscis.gov" target="_blank" rel="noopener noreferrer" className="text-primary underline">
          uscis.gov
        </a>{" "}
        {t("imm.disc.rest2")}
      </p>
    </div>
  );
}

function GuidanceView({ g, onPickQuestion }: { g: Guidance; onPickQuestion?: (q: string) => void }) {
  const { t } = useT();
  return (
    <div className="space-y-4">
      {g.summary ? (
        <div className="bg-card border-l-4 border-primary rounded-xl p-5 shadow-sm text-sm leading-relaxed text-foreground/90">
          {g.summary}
        </div>
      ) : null}

      {g.forms && g.forms.length > 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <p className="px-5 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("imm.v.forms")}
          </p>
          <div className="divide-y divide-border/60 mt-2">
            {g.forms.map((f, i) => (
              <div key={i} className="flex gap-3 px-5 py-3">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary h-fit flex-shrink-0">
                  {f.code}
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{f.why}</p>
                  {f.fee ? <p className="text-xs text-muted-foreground mt-0.5">{t("imm.v.fee")} {f.fee}</p> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {g.steps && g.steps.length > 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-sm p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">{t("imm.v.steps")}</p>
          <ol className="space-y-2">
            {g.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm text-foreground/90">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {g.watchOut && g.watchOut.length > 0 ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-destructive mb-2">{t("imm.v.watch")}</p>
          <ul className="space-y-1.5 text-sm text-foreground/90">
            {g.watchOut.map((w, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-destructive flex-shrink-0 font-semibold">!</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {g.relatableExamples && g.relatableExamples.length > 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-primary" />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("imm.v.people")}
            </p>
          </div>
          <p className="text-xs text-muted-foreground mb-3 italic">
            {t("imm.v.peopleNote")}
          </p>
          <div className="space-y-3">
            {g.relatableExamples.map((e, i) => (
              <div key={i} className="border-l-2 border-primary/40 pl-3">
                <p className="text-sm text-foreground/90">{e.situation}</p>
                {e.takeaway ? (
                  <p className="text-sm text-primary/90 mt-1">
                    <span className="font-medium">{t("imm.v.takeaway")}</span> {e.takeaway}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {g.followUpQuestions && g.followUpQuestions.length > 0 ? (
        <div className="rounded-xl border border-border bg-muted/30 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <HelpCircle className="w-4 h-4 text-primary" />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("imm.v.questions")}
            </p>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {onPickQuestion ? t("imm.v.questionsTap") : t("imm.v.questionsNote")}
          </p>
          <ul className="space-y-2">
            {g.followUpQuestions.map((q, i) =>
              onPickQuestion ? (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => onPickQuestion(q)}
                    className="w-full text-left flex gap-2 items-start text-sm text-foreground/90 rounded-lg border border-border bg-card px-3 py-2 hover:border-primary hover:bg-primary/5 transition-colors"
                  >
                    <span className="text-primary flex-shrink-0 font-semibold">?</span>
                    <span>{q}</span>
                  </button>
                </li>
              ) : (
                <li key={i} className="flex gap-2 items-start text-sm text-foreground/90">
                  <span className="text-primary flex-shrink-0 font-semibold">?</span>
                  <span>{q}</span>
                </li>
              ),
            )}
          </ul>
        </div>
      ) : null}

      {g.attorneyNote ? <p className="text-sm text-muted-foreground italic">{g.attorneyNote}</p> : null}
    </div>
  );
}

function renderSavedGuidance(raw: string, onPickQuestion?: (q: string) => void) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && (parsed.summary || parsed.forms || parsed.steps)) {
      return <GuidanceView g={parsed} onPickQuestion={onPickQuestion} />;
    }
  } catch {
    /* not JSON — fall through to plain text */
  }
  return <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{raw}</div>;
}

export default function Immigration() {
  const { user } = useUser();
  const { t, lang } = useT();
  const [tab, setTab] = useState<TabKey>("guidance");

  // Guidance state
  const [situation, setSituation] = useState("");
  const [guidance, setGuidance] = useState<Guidance | null>(null);
  const [advising, setAdvising] = useState(false);
  const [adviseError, setAdviseError] = useState<string | null>(null);
  const [saveTitle, setSaveTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Data state
  const [forms, setForms] = useState<ImmigrationForm[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [cases, setCases] = useState<SavedCase[]>([]);
  const [feeCalcUrl, setFeeCalcUrl] = useState("https://www.uscis.gov/feecalculator");

  // Updates state
  const [updates, setUpdates] = useState<UpdateItem[]>([]);
  const [updateSources, setUpdateSources] = useState<UpdateSource[]>([]);
  const [updatesLoading, setUpdatesLoading] = useState(false);
  const [updatesLoaded, setUpdatesLoaded] = useState(false);

  useEffect(() => {
    api("/immigration/forms")
      .then((d) => {
        setForms(d.forms || []);
        if (d.feeCalculatorUrl) setFeeCalcUrl(d.feeCalculatorUrl);
      })
      .catch(() => {});
    api("/immigration/scenarios")
      .then((d) => setScenarios(d.scenarios || []))
      .catch(() => {});
    refreshCases();
  }, []);

  const refreshCases = () => {
    api("/immigration/cases")
      .then((d) => setCases(d || []))
      .catch(() => {});
  };

  // Lazy-load live USCIS updates the first time the Updates tab is opened.
  useEffect(() => {
    if (tab !== "updates" || updatesLoaded || updatesLoading) return;
    setUpdatesLoading(true);
    api("/immigration/updates")
      .then((d) => {
        setUpdates(d.items || []);
        setUpdateSources(d.sources || []);
      })
      .catch(() => {})
      .finally(() => {
        setUpdatesLoading(false);
        setUpdatesLoaded(true);
      });
  }, [tab, updatesLoaded, updatesLoading]);

  const reloadCaseQuestion = (caseSituation: string, q: string) => {
    setSituation(`${caseSituation.trim()}\n\n${q}\n`);
    setGuidance(null);
    setSaved(false);
    setTab("guidance");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleAdvise = async () => {
    if (situation.trim().length < 10) return;
    setAdvising(true);
    setAdviseError(null);
    setGuidance(null);
    setSaved(false);
    try {
      const d = await api("/immigration/advise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situation, name: user?.firstName || "", language: englishName(lang) }),
      });
      setGuidance(d.guidance || null);
    } catch (e: any) {
      setAdviseError(e?.message || "Something went wrong.");
    } finally {
      setAdvising(false);
    }
  };

  const handlePickQuestion = (q: string) => {
    setSituation((prev) => `${prev.trim()}\n\n${q}\n`);
    window.scrollTo({ top: 0, behavior: "smooth" });
    const el = document.getElementById("situation-input");
    if (el) {
      el.focus();
      // place cursor at end
      const ta = el as HTMLTextAreaElement;
      const len = ta.value.length;
      try {
        ta.setSelectionRange(len, len);
      } catch {
        /* ignore */
      }
    }
  };

  const handleSaveCase = async () => {
    if (!guidance) return;
    setSaving(true);
    try {
      await api("/immigration/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: saveTitle || situation.slice(0, 60),
          situation,
          guidance: JSON.stringify(guidance),
        }),
      });
      setSaved(true);
      setSaveTitle("");
      refreshCases();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCase = async (id: number) => {
    if (!confirm(t("imm.delete"))) return;
    try {
      await api(`/immigration/cases/${id}`, { method: "DELETE" });
      setCases((prev) => prev.filter((c) => c.id !== id));
    } catch {
      /* ignore */
    }
  };

  const tabs: { key: TabKey; labelKey: string; icon: any }[] = [
    { key: "guidance", labelKey: "imm.tab.guidance", icon: Compass },
    { key: "scenarios", labelKey: "imm.tab.scenarios", icon: BookOpen },
    { key: "forms", labelKey: "imm.tab.forms", icon: FileText },
    { key: "updates", labelKey: "imm.tab.updates", icon: Newspaper },
    { key: "cases", labelKey: "imm.tab.cases", icon: Save },
  ];

  return (
    <div className="flex flex-col h-[100dvh] bg-background overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 px-4 md:px-8 h-14 border-b border-border bg-background/95 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <img src="/logo.svg" alt="logo" className="w-7 h-7 rounded flex-shrink-0" />
          <span className="font-serif font-semibold text-lg text-primary truncate">{t("imm.title")}</span>
        </div>
        <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
          <LanguageSwitcher />
          <Link
            href="/coach"
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">{t("imm.studyCoach")}</span>
          </Link>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 px-2 md:px-6 border-b border-border bg-background overflow-x-auto flex-shrink-0">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={
              "flex items-center gap-2 px-3 md:px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap " +
              (tab === tb.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            <tb.icon className="w-4 h-4" /> {t(tb.labelKey)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <DisclaimerBanner />

          {/* GET GUIDANCE */}
          {tab === "guidance" && (
            <div className="space-y-4">
              <div>
                <h1 className="font-serif text-2xl text-primary font-medium">{t("imm.g.heading")}</h1>
                <p className="text-sm text-muted-foreground mt-1">{t("imm.g.sub")}</p>
              </div>
              <Textarea
                id="situation-input"
                value={situation}
                onChange={(e) => setSituation(e.target.value)}
                placeholder={t("imm.g.placeholder")}
                className="min-h-[140px]"
              />
              <Button onClick={handleAdvise} disabled={advising || situation.trim().length < 10}>
                {advising ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t("imm.g.thinking")}
                  </>
                ) : (
                  t("imm.g.btn")
                )}
              </Button>

              {adviseError && <p className="text-sm text-destructive">{adviseError}</p>}

              {guidance && (
                <div className="space-y-4">
                  <GuidanceView g={guidance} onPickQuestion={handlePickQuestion} />
                  <div className="bg-muted/40 rounded-lg p-4 space-y-3">
                    <p className="text-sm font-medium">{t("imm.g.save")}</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        placeholder={t("imm.g.titlePh")}
                        value={saveTitle}
                        onChange={(e) => setSaveTitle(e.target.value)}
                      />
                      <Button
                        variant="outline"
                        onClick={handleSaveCase}
                        disabled={saving}
                        className="gap-2 flex-shrink-0"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {saved ? t("imm.g.savedBtn") : t("imm.g.saveBtn")}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SCENARIOS */}
          {tab === "scenarios" && (
            <div className="space-y-4">
              <div>
                <h1 className="font-serif text-2xl text-primary font-medium">{t("imm.s.heading")}</h1>
                <p className="text-sm text-muted-foreground mt-1">{t("imm.s.sub")}</p>
              </div>
              <div className="space-y-5">
                {scenarios.map((s) => (
                  <div key={s.id} className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 p-5 pb-4">
                      <div className="min-w-0">
                        <h3 className="font-serif font-medium text-lg text-foreground leading-tight">{s.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1.5">{s.situation}</p>
                      </div>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium flex-shrink-0">
                        {s.category}
                      </span>
                    </div>

                    {/* Key facts */}
                    <dl className="mx-5 mb-5 rounded-lg bg-muted/40 border border-border/60 divide-y divide-border/60 text-sm">
                      <div className="flex gap-3 px-4 py-3">
                        <dt className="w-24 flex-shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-1">
                          {t("imm.s.forms")}
                        </dt>
                        <dd className="flex flex-wrap gap-1.5">
                          {s.likelyForms.map((f) => (
                            <span
                              key={f}
                              className="text-xs font-medium px-2 py-0.5 rounded-md bg-primary/10 text-primary"
                            >
                              {f}
                            </span>
                          ))}
                        </dd>
                      </div>
                      <div className="flex gap-3 px-4 py-3">
                        <dt className="w-24 flex-shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("imm.s.cost")}
                        </dt>
                        <dd className="text-foreground/90">{s.approxCost}</dd>
                      </div>
                      <div className="flex gap-3 px-4 py-3">
                        <dt className="w-24 flex-shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("imm.s.timeline")}
                        </dt>
                        <dd className="text-foreground/90">{s.typicalTimeline}</dd>
                      </div>
                    </dl>

                    {/* Helps / Watch */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 border-t border-border/60 divide-y sm:divide-y-0 sm:divide-x divide-border/60">
                      <div className="p-5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-2">
                          {t("imm.s.helps")}
                        </p>
                        <ul className="text-sm text-muted-foreground space-y-2">
                          {s.whatHelps.map((w, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-primary flex-shrink-0 font-semibold">+</span>
                              <span>{w}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="p-5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-destructive mb-2">
                          {t("imm.s.watch")}
                        </p>
                        <ul className="text-sm text-muted-foreground space-y-2">
                          {s.whatToWatch.map((w, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-destructive flex-shrink-0 font-semibold">!</span>
                              <span>{w}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FORMS & FEES */}
          {tab === "forms" && (
            <div className="space-y-4">
              <div>
                <h1 className="font-serif text-2xl text-primary font-medium">{t("imm.f.heading")}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("imm.f.sub")}{" "}
                  <a
                    href={feeCalcUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline inline-flex items-center gap-1"
                  >
                    {t("imm.f.verify")} <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </div>
              <div className="space-y-3">
                {forms.map((f) => (
                  <div key={f.code} className="bg-card border border-border rounded-xl p-4 shadow-sm">
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <h3 className="font-medium text-foreground">
                        <span className="font-serif text-primary mr-2">{f.code}</span>
                        {f.name}
                      </h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {f.category}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1.5">{f.purpose}</p>
                    <p className="text-sm mt-2">
                      <span className="font-medium">{t("imm.f.fee")}</span> {f.approxFee}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* UPDATES */}
          {tab === "updates" && (
            <div className="space-y-5">
              <div>
                <h1 className="font-serif text-2xl text-primary font-medium">{t("imm.u.heading")}</h1>
                <p className="text-sm text-muted-foreground mt-1">{t("imm.u.sub")}</p>
              </div>

              {/* Live USCIS headlines */}
              <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-5 pt-4 pb-1">
                  <Newspaper className="w-4 h-4 text-primary" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("imm.u.latest")}
                  </p>
                </div>
                {updatesLoading ? (
                  <div className="flex items-center gap-2 px-5 py-8 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" /> {t("imm.u.fetching")}
                  </div>
                ) : updates.length > 0 ? (
                  <div className="divide-y divide-border/60 mt-1">
                    {updates.map((u, i) => (
                      <a
                        key={i}
                        href={u.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block px-5 py-3 hover:bg-muted/40 transition-colors group"
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                            {u.title}
                          </span>
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                        </div>
                        {u.date ? <p className="text-xs text-muted-foreground mt-0.5">{u.date}</p> : null}
                        {u.summary ? <p className="text-sm text-muted-foreground mt-1">{u.summary}</p> : null}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="px-5 py-6 text-sm text-muted-foreground">{t("imm.u.couldnt")}</p>
                )}
              </div>

              {/* Curated authoritative sources */}
              {updateSources.length > 0 ? (
                <div className="rounded-xl border border-border bg-card shadow-sm p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                    {t("imm.u.where")}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {updateSources.map((s) => (
                      <a
                        key={s.url}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-lg border border-border bg-background px-4 py-3 hover:border-primary hover:bg-primary/5 transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-foreground">{s.label}</span>
                          <ExternalLink className="w-3 h-3 text-muted-foreground" />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.note}</p>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              <p className="text-xs text-muted-foreground">{t("imm.u.footer")}</p>
            </div>
          )}

          {/* MY CASES */}
          {tab === "cases" && (
            <div className="space-y-4">
              <div>
                <h1 className="font-serif text-2xl text-primary font-medium">{t("imm.c.heading")}</h1>
                <p className="text-sm text-muted-foreground mt-1">{t("imm.c.sub")}</p>
              </div>
              {cases.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">{t("imm.c.empty")}</p>
              ) : (
                <div className="space-y-4">
                  {cases.map((c) => (
                    <div key={c.id} className="bg-card border border-border rounded-xl p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-medium text-foreground">{c.title}</h3>
                        <button
                          onClick={() => handleDeleteCase(c.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                          aria-label="Delete case"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 mb-3 italic">{c.situation}</p>
                      <div className="border-t border-border pt-3">
                        {renderSavedGuidance(c.guidance, (q) => reloadCaseQuestion(c.situation, q))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center pt-4 border-t border-border">{t("imm.footer")}</p>
        </div>
      </div>
    </div>
  );
}
