import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { resolveVideo, VIDEO_PROVIDERS_HINT } from "@/lib/videoEmbed";
import { Layers, Boxes, Gamepad2, BookOpen, Send, Building2, GraduationCap, ShieldCheck, Video, Trash2 } from "lucide-react";

/**
 * Super-admin Content Catalog. One shared "Platform Templates & Games" catalog plus one catalog per
 * partner/organisation, strictly demarcated so no partner's content mixes with another's. Pick a
 * tenant on the left to see ONLY its content; deploy a platform game to a partner (an isolated copy),
 * or author directly into the selected catalog. Backed by /admin/catalog/*.
 */
interface OrgRef { id: string; name: string }
interface Tenant { id: string; name: string; slug?: string; type: "platform" | "partner" | "organisation"; orgs: OrgRef[] }
interface TemplateCard { key: string; name: string; blurb: string; bands: string[] }
interface ActivityCard { id: string; title: string; kind: string; organisationId: string | null; isLibrary: boolean; published: boolean; tags: string[] | null; difficulty: string | null }
interface CourseCard { id: string; title: string; tenantId: string | null; status: string; delivery?: string }
interface Catalog { tenant: { id: string; name: string; type: string }; templates: TemplateCard[]; activities: ActivityCard[]; courses: CourseCard[] }

const KIND_ICON: Record<string, typeof Gamepad2> = { game: Gamepad2, quiz: Boxes, "math-coach": GraduationCap };

export default function ContentCatalog() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [sel, setSel] = useState<string>("platform");
  const [cat, setCat] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [newVideo, setNewVideo] = useState(false);

  useEffect(() => {
    apiFetch<{ tenants: Tenant[] }>("/admin/catalog/tenants").then((d) => setTenants(d.tenants || [])).catch(() => setTenants([]));
  }, []);

  const loadCatalog = (id: string) => {
    setLoading(true); setCat(null);
    apiFetch<Catalog>(`/admin/catalog/${id}`).then((d) => setCat(d)).catch(() => setCat(null)).finally(() => setLoading(false));
  };
  useEffect(() => { loadCatalog(sel); /* eslint-disable-next-line */ }, [sel]);

  const partners = useMemo(() => tenants.filter((t) => t.type === "partner"), [tenants]);
  const selTenant = tenants.find((t) => t.id === sel);
  const isPlatform = sel === "platform";

  const deploy = async (activityId: string, targetTenantId: string, title: string) => {
    setBusy(activityId); setMsg(null);
    try {
      await apiFetch("/admin/catalog/deploy", { method: "POST", body: JSON.stringify({ activityId, targetTenantId }) });
      const to = tenants.find((t) => t.id === targetTenantId)?.name ?? "partner";
      setMsg(`Deployed “${title}” to ${to}. A private copy now lives in their catalog.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Deploy failed");
    } finally { setBusy(null); }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Layers className="h-5 w-5 text-indigo-600" />
        <h1 className="text-xl font-semibold">Content Catalog</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-5 flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
        Each catalog is isolated, you only ever see the selected tenant's content. Build in the platform library, then deploy to a partner.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-5">
        {/* Tenant switcher */}
        <aside className="space-y-1">
          <button
            onClick={() => setSel("platform")}
            className={`w-full text-left rounded-lg px-3 py-2.5 text-sm font-medium flex items-center gap-2 transition ${isPlatform ? "bg-indigo-600 text-white" : "hover:bg-muted"}`}
          >
            <Boxes className="h-4 w-4" /> Platform Templates & Games
          </button>
          <div className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1">Partners</div>
          {partners.map((p) => (
            <div key={p.id}>
              <button
                onClick={() => setSel(p.id)}
                className={`w-full text-left rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2 transition ${sel === p.id ? "bg-indigo-600 text-white" : "hover:bg-muted"}`}
              >
                <Building2 className="h-4 w-4" /> {p.name}
              </button>
              {p.orgs.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setSel(o.id)}
                  className={`w-full text-left rounded-lg pl-9 pr-3 py-1.5 text-[13px] flex items-center gap-2 transition ${sel === o.id ? "bg-indigo-100 text-indigo-800" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {o.name}
                </button>
              ))}
            </div>
          ))}
        </aside>

        {/* Catalog */}
        <main>
          {msg && <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-3 py-2">{msg}</div>}
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-lg font-semibold">{selTenant?.name ?? cat?.tenant.name ?? "…"}</h2>
            {selTenant && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">{selTenant.type}</span>}
          </div>

          {loading && <p className="text-sm text-muted-foreground">Loading catalog…</p>}

          {cat && (
            <div className="space-y-6">
              {/* Game templates, shared, usable everywhere */}
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <Gamepad2 className="h-4 w-4 text-indigo-600" />
                  <h3 className="font-semibold text-sm">Game templates <span className="font-normal text-muted-foreground">· available in every catalog</span></h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {cat.templates.map((t) => (
                    <div key={t.key} className="rounded-xl border bg-card p-3">
                      <div className="font-medium text-sm">{t.name}</div>
                      <div className="text-[12px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">{t.blurb}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1">{t.bands.map((b) => <span key={b} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{b}</span>)}</div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Games & activities */}
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <Boxes className="h-4 w-4 text-indigo-600" />
                  <h3 className="font-semibold text-sm">Games & activities <span className="font-normal text-muted-foreground">· {cat.activities.length}</span></h3>
                  <button onClick={() => setNewVideo((v) => !v)} className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium rounded-md px-2.5 py-1 bg-indigo-600 text-white">
                    <Video className="h-3 w-3" /> New video lesson
                  </button>
                </div>
                {newVideo && <VideoLessonCreator tenantId={sel} tenantName={selTenant?.name ?? cat.tenant.name} onDone={(m) => { setNewVideo(false); if (m) setMsg(m); loadCatalog(sel); }} onCancel={() => setNewVideo(false)} />}
                {cat.activities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No games or activities in this catalog yet.</p>
                ) : (
                  <div className="space-y-2">
                    {cat.activities.map((a) => {
                      const Icon = KIND_ICON[a.kind] ?? Boxes;
                      return (
                        <div key={a.id} className="rounded-xl border bg-card p-3 flex items-center gap-3">
                          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{a.title}</div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                              <span className="capitalize">{a.kind}</span>
                              {a.difficulty && <>· <span className="capitalize">{a.difficulty}</span></>}
                              {a.isLibrary && <>· <span className="text-indigo-600">shared library</span></>}
                              {!a.published && <>· <span className="text-amber-600">draft</span></>}
                            </div>
                          </div>
                          {/* Deploy to a partner (from any catalog; typically the platform library) */}
                          <DeployControl activityId={a.id} title={a.title} partners={partners} orgs={tenants.flatMap((t) => t.orgs)} busy={busy === a.id} onDeploy={deploy} currentTenant={sel} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Courses */}
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="h-4 w-4 text-indigo-600" />
                  <h3 className="font-semibold text-sm">Courses <span className="font-normal text-muted-foreground">· {cat.courses.length}</span></h3>
                </div>
                {cat.courses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No courses in this catalog.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {cat.courses.map((c) => (
                      <div key={c.id} className="rounded-xl border bg-card p-3">
                        <div className="text-sm font-medium truncate">{c.title}</div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                          <span className="capitalize">{c.status}</span>
                          {c.delivery && <>· <span className="capitalize">{c.delivery}</span></>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

interface Checkpoint { t: string; stem: string; opts: string[]; correct: number; fb: string }

/** Create a video lesson (link/upload + optional interactive checkpoints) into a tenant's catalog. */
function VideoLessonCreator({ tenantId, tenantName, onDone, onCancel }: {
  tenantId: string; tenantName: string; onDone: (msg?: string) => void; onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [cps, setCps] = useState<Checkpoint[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const v = resolveVideo(videoUrl);

  const addCp = () => setCps((p) => [...p, { t: "30", stem: "", opts: ["", "", "", ""], correct: 0, fb: "" }]);
  const setCp = (i: number, patch: Partial<Checkpoint>) => setCps((p) => p.map((c, j) => j === i ? { ...c, ...patch } : c));
  const delCp = (i: number) => setCps((p) => p.filter((_, j) => j !== i));

  const save = async () => {
    if (!title.trim() || v.kind === "none") { setErr("Add a title and a valid video link."); return; }
    setBusy(true); setErr(null);
    try {
      const questions = cps.filter((c) => c.stem.trim() && c.opts.filter((o) => o.trim()).length >= 2).map((c, qi) => {
        const options = c.opts.map((t, i) => ({ id: `o${i}`, text: t.trim() })).filter((o) => o.text);
        return { id: `q${qi}`, videoTimestamp: Number(c.t) || 0, questionType: "multiple_choice", stem: c.stem.trim(), options, correctOptionIds: [`o${c.correct}`], feedbackCorrect: c.fb || undefined, pauseOnReach: true, points: 1 };
      });
      await apiFetch("/admin/catalog/activity", { method: "POST", body: JSON.stringify({
        targetTenantId: tenantId, title: title.trim(), kind: "video", source: "html",
        html: JSON.stringify({ videoUrl, questions }), instructions: "Watch the clip; answer each checkpoint to continue.",
        tags: ["video", ...(questions.length ? ["interactive"] : [])], published: true,
      }) });
      onDone(`Video lesson “${title.trim()}” added to ${tenantName}${questions.length ? ` with ${questions.length} checkpoint(s)` : ""}.`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 mb-3 space-y-3">
      <div className="text-sm font-semibold flex items-center gap-1.5"><Video className="h-4 w-4 text-indigo-600" /> New video lesson · <span className="font-normal text-muted-foreground">saved to {tenantName}</span></div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lesson title" className="h-9 w-full rounded-md border px-3 text-sm bg-background" />
      <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="Paste a YouTube, Khan Academy, Vimeo, TikTok, Loom or Drive link (or a file URL)" className="h-9 w-full rounded-md border px-3 text-sm bg-background" />
      <p className="text-[11px] text-muted-foreground -mt-1">{videoUrl.trim() ? (v.kind === "none" ? "Couldn't recognise that link." : <>Plays inline as a <span className="capitalize font-medium">{v.provider}</span> clip.</>) : VIDEO_PROVIDERS_HINT}</p>

      <div className="space-y-2">
        <div className="text-[12px] font-medium">Interactive checkpoints <span className="font-normal text-muted-foreground">(optional, a question pops mid-clip; YouTube/Khan/file)</span></div>
        {cps.map((c, i) => (
          <div key={i} className="rounded-lg border bg-background p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-muted-foreground">At (s)<input value={c.t} onChange={(e) => setCp(i, { t: e.target.value.replace(/[^0-9]/g, "") })} className="ml-1 h-7 w-16 rounded border px-2 text-sm bg-background" /></label>
              <button onClick={() => delCp(i)} className="ml-auto text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            <input value={c.stem} onChange={(e) => setCp(i, { stem: e.target.value })} placeholder="Question…" className="h-8 w-full rounded border px-2 text-sm bg-background" />
            {c.opts.map((o, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <input type="radio" name={`c${i}`} checked={c.correct === oi} onChange={() => setCp(i, { correct: oi })} title="Correct" />
                <input value={o} onChange={(e) => setCp(i, { opts: c.opts.map((x, j) => j === oi ? e.target.value : x) })} placeholder={`Option ${oi + 1}${oi === c.correct ? " (correct)" : ""}`} className="h-8 flex-1 rounded border px-2 text-sm bg-background" />
              </div>
            ))}
            <input value={c.fb} onChange={(e) => setCp(i, { fb: e.target.value })} placeholder="Feedback when correct (optional)" className="h-8 w-full rounded border px-2 text-sm bg-background" />
          </div>
        ))}
        <button onClick={addCp} className="text-[12px] text-indigo-600 font-medium">+ Add checkpoint</button>
      </div>

      {err && <p className="text-[12px] text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button disabled={busy} onClick={save} className="text-[12px] font-medium rounded-md px-3 py-1.5 bg-indigo-600 text-white disabled:opacity-50">{busy ? "Saving…" : "Save video lesson"}</button>
        <button onClick={onCancel} className="text-[12px] rounded-md px-3 py-1.5 border">Cancel</button>
      </div>
    </div>
  );
}

function DeployControl({ activityId, title, partners, orgs, busy, onDeploy, currentTenant }: {
  activityId: string; title: string; partners: Tenant[]; orgs: OrgRef[]; busy: boolean; currentTenant: string;
  onDeploy: (activityId: string, targetTenantId: string, title: string) => void;
}) {
  const [target, setTarget] = useState<string>("");
  // Offer every partner (and org) except the one we're currently viewing.
  const options = [
    ...partners.filter((p) => p.id !== currentTenant).map((p) => ({ id: p.id, name: p.name })),
    ...orgs.filter((o) => o.id !== currentTenant).map((o) => ({ id: o.id, name: `  ${o.name}` })),
  ];
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <select
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="text-[12px] border rounded-md px-2 py-1 bg-background max-w-[160px]"
      >
        <option value="">Deploy to…</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <button
        disabled={!target || busy}
        onClick={() => onDeploy(activityId, target, title)}
        className="inline-flex items-center gap-1 text-[12px] font-medium rounded-md px-2 py-1 bg-indigo-600 text-white disabled:opacity-40"
      >
        <Send className="h-3 w-3" /> {busy ? "…" : "Go"}
      </button>
    </div>
  );
}
