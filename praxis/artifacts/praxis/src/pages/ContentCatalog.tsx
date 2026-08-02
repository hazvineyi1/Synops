import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Layers, Boxes, Gamepad2, BookOpen, Send, Building2, GraduationCap, Sparkles, ShieldCheck } from "lucide-react";

/**
 * Super-admin Content Catalog. One shared "Platform Templates & Games" catalog plus one catalog per
 * partner/organisation — strictly demarcated so no partner's content mixes with another's. Pick a
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
        Each catalog is isolated — you only ever see the selected tenant's content. Build in the platform library, then deploy to a partner.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-5">
        {/* Tenant switcher */}
        <aside className="space-y-1">
          <button
            onClick={() => setSel("platform")}
            className={`w-full text-left rounded-lg px-3 py-2.5 text-sm font-medium flex items-center gap-2 transition ${isPlatform ? "bg-indigo-600 text-white" : "hover:bg-muted"}`}
          >
            <Sparkles className="h-4 w-4" /> Platform Templates & Games
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
              {/* Game templates — shared, usable everywhere */}
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
                </div>
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
