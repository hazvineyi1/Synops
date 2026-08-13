import { Router } from "express";
import { db } from "@workspace/db";
import { coursesTable, modulesTable, beatsTable, assignmentsTable, interactiveActivitiesTable, coursePartnerAssignmentsTable, moduleReadingsTable, discussionsTable, enrolmentsTable, beatProgressTable, caseScenariosTable } from "@workspace/db";
import { eq, ne, desc, and, inArray, sql, count, ilike } from "drizzle-orm";
import { requireAuth, requireRole, requireHub } from "../middlewares/requireAuth";
import { canParticipateInCourse, canStaffActOnCourse, canViewCourseCatalog } from "../lib/scope";
import { loadCourseCompleteness, type CourseCompleteness } from "../lib/courseCompleteness";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { uploadObject, storageEnabled } from "../lib/supabaseStorage";

// Courses belong to the super admin (tenantId "platform") and are assigned OUT to partners.
const HUB_ROLES = new Set(["super_admin", "instructional_designer"]);
const isHub = (role?: string | null) => !!role && HUB_ROLES.has(role);

// Roles that AUTHOR courses (and so may list still-incomplete ones via ?includeIncomplete=true, to
// build them). Learners and funders can never opt out of the catalogue completeness filter.
const AUTHOR_ROLES = new Set(["super_admin", "instructional_designer", "partner_admin", "org_admin", "coach"]);
const canSeeIncomplete = (role?: string | null) => !!role && AUTHOR_ROLES.has(role);

const router = Router();

// --- Reading-level (Flesch-Kincaid grade) for the accessibility checks ---
function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  const groups = w.match(/[aeiouy]+/g);
  let n = groups ? groups.length : 1;
  if (w.endsWith("e")) n = Math.max(1, n - 1);
  return Math.max(1, n);
}
function fleschKincaidGrade(text: string): number {
  const sentences = Math.max(1, (text.match(/[.!?]+/g) || []).length);
  const words = text.match(/[A-Za-z]+/g) || [];
  const wordCount = Math.max(1, words.length);
  const syllables = words.reduce((s, w) => s + countSyllables(w), 0);
  const grade = 0.39 * (wordCount / sentences) + 11.8 * (syllables / wordCount) - 15.59;
  return Math.max(0, Math.round(grade * 10) / 10);
}
const ACTION_VERB = /^\s*(describe|explain|apply|analyse|analyze|evaluate|create|identify|demonstrate|compare|design|calculate|use|write|build|assess|interpret|list|define|solve|plan|select|produce|develop|construct|classify|summarise|summarize|justify|recommend|perform)/i;

// Attaches the completeness verdict (complete + the per-module reasons it is not) when known. Callers
// that have not computed completeness pass nothing and the course reads as not-yet-evaluated.
function toCourseResponse(c: typeof coursesTable.$inferSelect, completeness?: CourseCompleteness) {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    catalogDescription: c.catalogDescription,
    tenantId: c.tenantId,
    status: c.status,
    moduleCount: c.moduleCount,
    enrolmentCount: c.enrolmentCount,
    competencyTags: c.competencyTags,
    objectives: c.objectives ?? [],
    nqfLevel: c.nqfLevel,
    thumbnailUrl: c.thumbnailUrl,
    overviewConfig: (c as { overviewConfig?: string | null }).overviewConfig ?? null,
    tocConfig: (c as { tocConfig?: string | null }).tocConfig ?? null,
    sectionPolicies: (c as { sectionPolicies?: string | null }).sectionPolicies ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    // Course completeness gate: complete == catalogue-eligible. incompleteReasons lists, per blocking
    // module, exactly what is missing so an author can finish it.
    complete: completeness?.complete ?? false,
    incompleteReasons: completeness?.incompleteReasons ?? [],
    courseIssues: completeness?.courseIssues ?? [],
  };
}

// GET /courses
//
// This is the CATALOGUE list. Course completeness gate: only fully-built, catalogue-eligible courses
// are returned - for EVERYONE (learners, partners AND hub roles) - so an incomplete course never
// surfaces in the catalogue. Authors reach incomplete courses through GET /courses/incomplete and open
// them via GET /courses/:id. Hub authoring tools that must list drafts pass ?includeIncomplete=true to
// opt out of the filter (honoured only for hub roles); the annotated `complete`/`incompleteReasons`
// come back either way.
router.get("/courses", requireAuth, async (req, res) => {
  const user = req.dbUser!;
  // Pagination + search + status filter so the catalogue scales. Default limit is
  // generous so existing (unpaged) callers keep working; the true count is in the
  // X-Total-Count header. Body stays a plain array.
  const rawLimit = Number(req.query.limit ?? 500);
  const limit = Math.min(Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 500), 500);
  const rawOffset = Number(req.query.offset ?? 0);
  const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);
  const search = String(req.query.search ?? "").trim();
  const statusFilter = String(req.query.status ?? "").trim();
  const isStatus = statusFilter === "draft" || statusFilter === "published" || statusFilter === "archived";
  const hub = isHub(user.role);
  // Author-only opt-out so authoring surfaces (course dev suite, activities admin, assignment picker)
  // can still list drafts to build/assign them. Learners and funders never see incomplete courses.
  const includeIncomplete = canSeeIncomplete(user.role) && String(req.query.includeIncomplete ?? "") === "true";

  // Build the full candidate set for this user (unpaginated), then apply the completeness gate and
  // paginate in-memory. The catalogue is small and the completeness pass is a fixed handful of batched
  // queries, so this stays cheap while keeping the page counts and X-Total-Count consistent post-filter.
  let candidates: (typeof coursesTable.$inferSelect)[];
  if (hub) {
    // Hub roles (super_admin, instructional_designer) author/oversee across every org, so they see the
    // whole catalogue; everyone else is scoped to their partner/org tenant.
    const conds = [
      search ? ilike(coursesTable.title, `%${search}%`) : undefined,
      isStatus ? eq(coursesTable.status, statusFilter as "draft" | "published" | "archived") : undefined,
    ].filter((c): c is NonNullable<typeof c> => !!c);
    const where = conds.length ? and(...conds) : undefined;
    candidates = await db.select().from(coursesTable).where(where).orderBy(desc(coursesTable.createdAt));
  } else {
    // Non-hub users see (a) courses their own tenant owns, plus (b) platform-owned courses ASSIGNED to
    // their partner from the console. Additive: assignment only grants visibility. Learner course access
    // is still gated by enrolment elsewhere; this list drives the catalogue an admin/coach can act on.
    const scope = user.partnerId ?? user.organisationId ?? user.id;
    const owned = await db.select().from(coursesTable).where(eq(coursesTable.tenantId, scope));
    let assigned: (typeof coursesTable.$inferSelect)[] = [];
    if (user.partnerId) {
      try {
        const rows = await db
          .select({ courseId: coursePartnerAssignmentsTable.courseId })
          .from(coursePartnerAssignmentsTable)
          .where(eq(coursePartnerAssignmentsTable.partnerId, user.partnerId));
        const ids = [...new Set(rows.map((r) => r.courseId))].filter((id) => !owned.some((o) => o.id === id));
        if (ids.length) assigned = await db.select().from(coursesTable).where(inArray(coursesTable.id, ids));
      } catch {
        // Assignment table not created yet (setup-platform not run) -> just the owned list.
      }
    }
    candidates = [...owned, ...assigned].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
    if (search) {
      const q = search.toLowerCase();
      candidates = candidates.filter((c) => c.title.toLowerCase().includes(q));
    }
    if (isStatus) candidates = candidates.filter((c) => c.status === statusFilter);
  }

  const completeness = await loadCourseCompleteness(candidates.map((c) => ({ id: c.id, status: c.status })));
  const visible = includeIncomplete ? candidates : candidates.filter((c) => completeness.get(c.id)?.complete);

  res.setHeader("X-Total-Count", String(visible.length));
  res.json(visible.slice(offset, offset + limit).map((c) => toCourseResponse(c, completeness.get(c.id))));
});

// GET /courses/incomplete -- the author-only "Incomplete courses" repository. Every course that is NOT
// catalogue-eligible (draft, or has a module missing components / not yet published), each with the
// exact per-module reasons. Guarded to the Hub tier (super_admin + instructional_designer). Archived
// courses are a deliberate end-state, not work-in-progress, so they are excluded.
// Registered BEFORE GET /courses/:courseId so the literal path is not captured as an id.
router.get("/courses/incomplete", requireAuth, requireHub, async (_req, res) => {
  const courses = await db
    .select()
    .from(coursesTable)
    .where(ne(coursesTable.status, "archived"))
    .orderBy(desc(coursesTable.createdAt));
  const completeness = await loadCourseCompleteness(courses.map((c) => ({ id: c.id, status: c.status })));
  const incomplete = courses.filter((c) => !completeness.get(c.id)?.complete);
  res.json(
    incomplete.map((c) => {
      const comp = completeness.get(c.id);
      return {
        ...toCourseResponse(c, comp),
        moduleCount: comp?.moduleCount ?? c.moduleCount,
        modules: comp?.modules ?? [],
      };
    }),
  );
});

// POST /courses -- author tiers only (was requireAuth-only, which let any signed-in user create).
router.post("/courses", requireAuth, requireRole("super_admin", "partner_admin", "org_admin", "coach", "instructional_designer"), async (req, res) => {
  const user = req.dbUser!;
  // Hub roles (super admin / ID) author the platform catalogue: their courses are owned by
  // "platform" and assigned to partners afterwards. A partner/org author's course stays their own.
  const tenantId = isHub(user.role) ? "platform" : (user.partnerId ?? user.organisationId ?? user.id);
  const { title, description, catalogDescription, competencyTags, objectives, nqfLevel, thumbnailUrl } = req.body;
  const [course] = await db
    .insert(coursesTable)
    .values({
      title, description, catalogDescription, tenantId,
      competencyTags: competencyTags ?? [],
      objectives: Array.isArray(objectives) ? objectives : [],
      nqfLevel, thumbnailUrl,
    })
    .returning();
  res.status(201).json(toCourseResponse(course));
});

// GET /courses/:courseId/alignment -- an alignment + accessibility (WCAG) report for a course.
// Alignment: which modules address and which assessments assess each course objective (AI-inferred,
// since module->objective mapping is not stored). Accessibility: deterministic WCAG checks.
router.get("/courses/:courseId/alignment", requireAuth, async (req, res) => {
  const courseId = req.params.courseId;
  if (!(await canStaffActOnCourse(req.dbUser!, courseId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, courseId)).limit(1);
  if (!course) { res.status(404).json({ error: "Not found" }); return; }

  const modules = await db.select({ id: modulesTable.id, title: modulesTable.title, objectives: modulesTable.objectives })
    .from(modulesTable).where(eq(modulesTable.courseId, courseId));
  const modIds = modules.map((m) => m.id);
  const assessments = await db.select({ title: assignmentsTable.title }).from(assignmentsTable).where(eq(assignmentsTable.courseId, courseId));
  let beats: Array<{ videoUrl: string | null; transcript: string | null; narration: string }> = [];
  if (modIds.length) {
    beats = await db.select({ videoUrl: beatsTable.videoUrl, transcript: beatsTable.transcript, narration: beatsTable.narration })
      .from(beatsTable).where(inArray(beatsTable.moduleId, modIds));
  }

  const courseObjectives = (course.objectives ?? []).filter(Boolean);

  // Alignment (AI-inferred).
  type Row = { objective: string; modules: string[]; assessments: string[]; covered: boolean; assessed: boolean; note: string };
  let alignment: Row[] = courseObjectives.map((o) => ({ objective: o, modules: [], assessments: [], covered: false, assessed: false, note: "" }));
  if (courseObjectives.length && (modules.length || assessments.length)) {
    try {
      const input = {
        courseObjectives,
        modules: modules.map((m) => ({ title: m.title, objectives: m.objectives ?? [] })),
        assessments: assessments.map((a) => a.title),
      };
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: `You are a curriculum alignment reviewer. For each course objective, decide which modules ADDRESS it (teach toward it) and which assessments ASSESS it, judging from the titles and module objectives. Be strict: include a module or assessment only if it clearly relates.

Data (JSON):
${JSON.stringify(input)}

Return ONLY JSON, no markdown: { "alignment": [ { "objective": "<verbatim course objective>", "modules": ["<module title>"], "assessments": ["<assessment title>"], "note": "<one short sentence on how well it is covered and assessed, or what is missing>" } ] }`,
        }],
      });
      const content = message.content[0];
      if (content && content.type === "text") {
        let parsed: { alignment?: Array<{ objective?: string; modules?: unknown; assessments?: unknown; note?: unknown }> } | null;
        try { parsed = JSON.parse(content.text); } catch { const m = content.text.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; }
        if (parsed?.alignment) {
          alignment = courseObjectives.map((o) => {
            const row = parsed!.alignment!.find((a) => a.objective === o) ?? {};
            const mods = Array.isArray(row.modules) ? row.modules.map(String) : [];
            const asmts = Array.isArray(row.assessments) ? row.assessments.map(String) : [];
            return { objective: o, modules: mods, assessments: asmts, covered: mods.length > 0, assessed: asmts.length > 0, note: String(row.note ?? "") };
          });
        }
      }
    } catch { /* keep the empty mapping on failure */ }
  }

  // Accessibility (WCAG) checks, computed deterministically.
  const wcag: Array<{ id: string; label: string; status: "pass" | "warn" | "fail"; detail: string }> = [];
  if (course.thumbnailUrl) {
    wcag.push({ id: "banner-alt", label: "Banner alternative text", status: "warn", detail: "Give the course banner descriptive alt text so screen-reader users get the same information (WCAG 1.1.1)." });
  }
  const videos = beats.filter((b) => b.videoUrl);
  const videosNoTranscript = videos.filter((b) => !b.transcript || !b.transcript.trim());
  if (videos.length) {
    wcag.push({ id: "video-captions", label: "Video captions and transcript", status: videosNoTranscript.length ? "fail" : "pass", detail: videosNoTranscript.length ? `${videosNoTranscript.length} of ${videos.length} videos have no transcript or captions (WCAG 1.2.2).` : "Every video has a transcript." });
  }
  const readingText = [course.description ?? "", ...beats.map((b) => b.narration)].join(" ");
  if (readingText.trim().length > 200) {
    const grade = fleschKincaidGrade(readingText);
    wcag.push({ id: "reading-level", label: "Reading level", status: grade > 12 ? "warn" : "pass", detail: `Approximate reading grade ${grade}. ${grade > 12 ? "Consider simpler wording so more learners can read it comfortably." : "Within a broadly accessible range."}` });
  }
  if (courseObjectives.length) {
    const weak = courseObjectives.filter((o) => !ACTION_VERB.test(o));
    wcag.push({ id: "objectives-measurable", label: "Measurable objectives", status: weak.length ? "warn" : "pass", detail: weak.length ? `${weak.length} objective(s) do not start with a measurable action verb.` : "All objectives start with a measurable action verb." });
  }

  res.json({
    objectiveCount: courseObjectives.length,
    covered: alignment.filter((a) => a.covered).length,
    assessed: alignment.filter((a) => a.assessed).length,
    moduleCount: modules.length,
    assessmentCount: assessments.length,
    alignment,
    wcag,
  });
});

// POST /courses/generate-banner -- generate a photorealistic course banner from the description
// using OpenAI's image model. Stores it (Supabase if configured, else a data URL) and returns the
// url plus AI alt text (accessibility from the start). Requires OPENAI_API_KEY on the server.
router.post("/courses/generate-banner", requireAuth, requireRole("super_admin", "partner_admin", "org_admin", "coach", "instructional_designer"), async (req, res) => {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    res.status(503).json({ error: "Banner generation is not configured. Set OPENAI_API_KEY on the server." });
    return;
  }
  const title = String(req.body?.title ?? "").trim();
  const description = String(req.body?.description ?? "").trim();
  const courseId = String(req.body?.courseId ?? "").trim();
  if (!title && !description) {
    res.status(400).json({ error: "Provide a title or description to generate a banner." });
    return;
  }
  const prompt = `A photorealistic, professional cover banner image for an online course. Subject: ${title}. ${description}. Cinematic wide composition, natural lighting, high detail, editorial photography style, relevant real-world scene. Absolutely no text, no letters, no words, no logos, no watermarks in the image.`;
  try {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1536x1024", n: 1 }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      throw new Error(`Image API error (${r.status}) ${detail.slice(0, 200)}`);
    }
    const data = (await r.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw new Error("The image service returned no image.");
    const buf = Buffer.from(b64, "base64");
    let thumbnailUrl: string;
    if (storageEnabled()) {
      const path = `course-banners/${courseId || "draft"}-${Date.now()}.png`;
      const up = await uploadObject(path, buf, "image/png");
      thumbnailUrl = up.url;
    } else {
      // No object storage configured: return a data URL so the flow still works.
      thumbnailUrl = `data:image/png;base64,${b64}`;
    }
    const alt = `Course banner for ${title || "this course"}: ${description ? description.slice(0, 120) : "an illustrative photograph representing the course subject"}.`;
    res.json({ thumbnailUrl, alt });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Could not generate a banner." });
  }
});

// POST /courses/resolve-image -- turn a page URL (an Unsplash/Pexels/Wikipedia photo page, an
// article, etc.) into a DIRECT image URL the browser can display as a banner. If the URL is already
// a direct image it is returned unchanged; otherwise the page's og:image / twitter:image is used.
// This runs server-side because the browser cannot read another origin's HTML (CORS). Staff-only,
// same authoring roles as banner generation.
router.post("/courses/resolve-image", requireAuth, requireRole("super_admin", "partner_admin", "org_admin", "coach", "instructional_designer"), async (req, res) => {
  const raw = String(req.body?.url ?? "").trim();
  if (!raw) { res.status(400).json({ error: "Provide a URL." }); return; }

  let parsed: URL;
  try { parsed = new URL(raw); } catch { res.status(400).json({ error: "That is not a valid URL." }); return; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    res.status(400).json({ error: "Only http(s) URLs are supported." });
    return;
  }
  // Basic SSRF guard: never let this fetch internal/loopback/link-local/private hosts.
  const host = parsed.hostname.toLowerCase();
  const isBlockedHost =
    host === "localhost" ||
    host.endsWith(".local") ||
    /^(127\.|10\.|169\.254\.|192\.168\.|::1$|fe80:|fc00:|fd00:)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (isBlockedHost) { res.status(400).json({ error: "That host is not allowed." }); return; }

  const abs = (u: string): string | null => {
    try { return new URL(u, parsed).toString(); } catch { return null; }
  };

  try {
    const r = await fetch(raw, {
      redirect: "follow",
      headers: {
        // Present as a real browser: sites like Unsplash return 401/403 to obvious bot
        // user-agents, so a generic "SynopsBanner" UA gets blocked. This does not defeat a
        // hard IP block, which is why the 401/403 branch below tells the user what to do.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!r.ok) {
      // A blocked fetch (site rejects our server) is common for stock/photo sites. Give the
      // universal workaround instead of a bare status code: copying the direct image address
      // always works because the browser loads it directly (no server fetch involved).
      if (r.status === 401 || r.status === 403) {
        res.status(502).json({
          error:
            "That site blocked the fetch. On the photo, right-click the image and choose \"Copy image address\", then paste that link here.",
        });
        return;
      }
      res.status(502).json({ error: `Could not fetch that URL (${r.status}).` });
      return;
    }

    const contentType = (r.headers.get("content-type") || "").toLowerCase();

    // Already a direct image: use the final (post-redirect) URL as-is.
    if (contentType.startsWith("image/")) {
      res.json({ imageUrl: r.url || raw, source: "direct" });
      return;
    }

    // Otherwise parse the HTML for a share/preview image.
    if (!contentType.includes("html")) {
      res.status(422).json({ error: "That link is not an image and has no preview image." });
      return;
    }
    const html = (await r.text()).slice(0, 500_000); // cap: preview meta lives in <head>

    // og:image URLs in HTML come entity-encoded (e.g. Unsplash returns "...&amp;w=1200").
    // Left as-is, the browser reads "&amp;" literally in <img src> and the image 404s, so
    // decode the common HTML entities back to real characters.
    const decodeEntities = (s: string): string =>
      s
        .replace(/&amp;/g, "&")
        .replace(/&#0*38;/g, "&")
        .replace(/&#x0*26;/gi, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#0*39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
    const metaContent = (re: RegExp): string | null => {
      const m = html.match(re);
      return m && m[1] ? decodeEntities(m[1].trim()) : null;
    };
    const candidate =
      metaContent(/<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i) ||
      metaContent(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      metaContent(/<meta[^>]+name=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      metaContent(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i) ||
      metaContent(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i) ||
      metaContent(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i);

    if (!candidate) {
      res.status(422).json({ error: "No preview image found on that page. Use a direct image link instead." });
      return;
    }
    const resolved = abs(candidate);
    if (!resolved) { res.status(422).json({ error: "Found a preview image but could not read its address." }); return; }
    res.json({ imageUrl: resolved, source: "og" });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Could not resolve that URL." });
  }
});

// POST /courses/generate-objectives -- draft course-level learning objectives (and a short catalogue
// blurb) from the title/description and any uploaded material. The author reviews/edits before saving.
router.post("/courses/generate-objectives", requireAuth, requireRole("super_admin", "partner_admin", "org_admin", "coach", "instructional_designer"), async (req, res) => {
  const title = String(req.body?.title ?? "").trim();
  const description = String(req.body?.description ?? "").trim();
  const materialText = String(req.body?.materialText ?? "").slice(0, 12000);
  if (!title && !description && !materialText) {
    res.status(400).json({ error: "Provide a title, description, or material to generate from." });
    return;
  }
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{
        role: "user",
        content: `You are an expert instructional designer. From the course details below, produce:
1. "catalogDescription": one short catalogue-facing sentence (max 160 characters) that clearly sells the course to a learner.
2. "objectives": 4 to 6 course-level learning objectives. Each must be measurable, start with a Bloom's action verb, describe what a learner can DO on completion, be specific to this course, and avoid jargon. No numbering, no em dashes.

Course title: ${title || "(none provided)"}
Description: ${description || "(none provided)"}
${materialText ? `Source material:\n${materialText}\n` : ""}
Return ONLY valid JSON, no markdown: { "catalogDescription": "...", "objectives": ["...", "..."] }`,
      }],
    });
    const content = message.content[0];
    if (!content || content.type !== "text") throw new Error("Unexpected response");
    let parsed: { catalogDescription?: string; objectives?: string[] };
    try {
      parsed = JSON.parse(content.text);
    } catch {
      const m = content.text.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { objectives: [] };
    }
    res.json({
      catalogDescription: String(parsed.catalogDescription ?? "").slice(0, 200),
      objectives: Array.isArray(parsed.objectives) ? parsed.objectives.map((o) => String(o)).filter(Boolean).slice(0, 8) : [],
    });
  } catch {
    res.status(502).json({ error: "Could not generate objectives. Please try again." });
  }
});

// ── AI course architect ─────────────────────────────────────────────────────────────────────
// The architect designs a full course blueprint from source content. Very large uploads (whole
// textbooks, long transcripts) cannot go through one model call inside a request without hitting a
// gateway timeout AND would be truncated. So the work runs as a BACKGROUND JOB: the whole document
// is read in chunks (map step -> compact notes per chunk), the notes are combined, and the architect
// designs from the combined notes (reduce step). The client starts the job and polls for progress.
// Job state lives in memory (single Railway instance, like the rate limiter); a restart loses
// in-flight jobs, which the client surfaces as a normal error to retry.

type ArchitectBlueprint = {
  courseDescription: string;
  catalogDescription: string;
  courseObjectives: string[];
  modules: Array<{
    title: string; overview: string; objectives: string[];
    sections: { reading: string | null; lecture: string | null; activity: string | null; caseStudy: string | null; assessment: string | null };
    sourceMapping: string; suggestedVideo: string; summary: string;
  }>;
  gaps: Array<{ gap: string; suggestion: string }>;
  flowNote: string;
};
type ArchitectJob = {
  id: string; courseId: string;
  status: "processing" | "done" | "error";
  phase: string; step: number; totalSteps: number;
  result?: ArchitectBlueprint; error?: string;
  createdAt: number; updatedAt: number;
};
const architectJobs = new Map<string, ArchitectJob>();
// Opportunistic cleanup so the map does not grow unbounded.
function pruneArchitectJobs() {
  const cutoff = Date.now() - 45 * 60 * 1000;
  for (const [id, j] of architectJobs) if (j.updatedAt < cutoff) architectJobs.delete(id);
}

function normalizeBlueprint(parsed: any): ArchitectBlueprint {
  const modules = Array.isArray(parsed?.modules) ? parsed.modules.slice(0, 12).map((m: any) => ({
    title: String(m?.title ?? "").slice(0, 200),
    overview: String(m?.overview ?? "").slice(0, 600),
    objectives: Array.isArray(m?.objectives) ? m.objectives.map((o: any) => String(o)).filter(Boolean).slice(0, 6) : [],
    sections: {
      reading: m?.sections?.reading ? String(m.sections.reading).slice(0, 400) : null,
      lecture: m?.sections?.lecture ? String(m.sections.lecture).slice(0, 400) : null,
      activity: m?.sections?.activity ? String(m.sections.activity).slice(0, 400) : null,
      caseStudy: m?.sections?.caseStudy ? String(m.sections.caseStudy).slice(0, 400) : null,
      assessment: m?.sections?.assessment ? String(m.sections.assessment).slice(0, 400) : null,
    },
    sourceMapping: String(m?.sourceMapping ?? "").slice(0, 300),
    suggestedVideo: String(m?.suggestedVideo ?? "").slice(0, 160),
    summary: String(m?.summary ?? "").slice(0, 400),
  })) : [];
  return {
    courseDescription: String(parsed?.courseDescription ?? "").slice(0, 1500),
    catalogDescription: String(parsed?.catalogDescription ?? "").slice(0, 200),
    courseObjectives: Array.isArray(parsed?.courseObjectives) ? parsed.courseObjectives.map((o: any) => String(o)).filter(Boolean).slice(0, 8) : [],
    modules,
    gaps: Array.isArray(parsed?.gaps) ? parsed.gaps.slice(0, 6).map((g: any) => ({ gap: String(g?.gap ?? "").slice(0, 300), suggestion: String(g?.suggestion ?? "").slice(0, 400) })) : [],
    flowNote: String(parsed?.flowNote ?? "").slice(0, 500),
  };
}

// Split text into chunks of ~maxChars, breaking on paragraph/line boundaries so notes stay coherent.
function chunkText(text: string, maxChars: number, maxChunks: number): string[] {
  const paras = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur.length + p.length + 2 > maxChars && cur) { chunks.push(cur); cur = ""; }
    // A single paragraph longer than maxChars is hard-split.
    if (p.length > maxChars) {
      if (cur) { chunks.push(cur); cur = ""; }
      for (let i = 0; i < p.length; i += maxChars) chunks.push(p.slice(i, i + maxChars));
    } else {
      cur += (cur ? "\n\n" : "") + p;
    }
    if (chunks.length >= maxChunks) break;
  }
  if (cur && chunks.length < maxChunks) chunks.push(cur);
  return chunks.slice(0, maxChunks);
}

// Parse model JSON that may have trailing prose or be truncated at max_tokens. Tries a strict parse,
// then the outermost {...}, then closes any still-open strings/objects/arrays as a best effort.
function parseLooseJson(raw: string): any {
  const tryParse = (s: string) => { try { return JSON.parse(s); } catch { return undefined; } };
  let v = tryParse(raw);
  if (v !== undefined) return v;
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) { v = tryParse(m[0]); if (v !== undefined) return v; }
  // Best-effort close of a truncated object.
  let inStr = false, esc = false; const stack: string[] = [];
  for (const c of raw) {
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if (c === "}" || c === "]") stack.pop();
  }
  let t = raw;
  if (inStr) t += '"';
  t = t.replace(/,\s*$/, "");
  while (stack.length) t += stack.pop();
  v = tryParse(t);
  return v !== undefined ? v : {};
}

// Reduce: design the blueprint from (already condensed) material. Uses an assistant prefill of "{"
// so the model must return a JSON object (no preamble/markdown), and retries once if it comes back
// empty. Robust parsing handles a reply truncated at max_tokens.
async function architectDesign(course: any, material: string, guidance: string): Promise<ArchitectBlueprint> {
  const prompt = `You are a world-class instructional designer, instructional technologist, accessibility (WCAG) expert, pedagogy and adult-learning-theory expert, experienced teacher, and project manager. You design courses that are coherent, measurable, accessible, and genuinely engaging.

Analyse the SOURCE MATERIAL below (it may be condensed notes covering a long document) and design a course blueprint. Think about scope and sequence: what a learner must know first, how ideas build, and where understanding could break down.

Course title: ${course.title || "(untitled)"}
Course description: ${course.description || "(none)"}
Existing course objectives: ${(course.objectives ?? []).join(" | ") || "(none yet)"}
${guidance ? `Author guidance: ${guidance}\n` : ""}
Produce a JSON object with exactly these keys:
- "courseDescription": a 2 to 3 sentence course description for the course page, describing what the course covers, who it is for, and what learners can do by the end.
- "catalogDescription": one short catalogue-facing sentence (max 160 characters) that sells the course.
- "courseObjectives": 4-6 measurable course-level objectives, each starting with a Bloom's action verb, describing what a learner can DO on completion. If good objectives already exist, refine them.
- "modules": an ordered array of 5 to 8 modules. Each module object has:
    - "title": a clear, specific module title
    - "overview": ONE sentence framing what this module is about and why it matters
    - "objectives": 2-3 measurable module objectives that ladder up to the course objectives
    - "sections": for each of "reading","lecture","activity","caseStudy","assessment", a ONE-sentence plan drawn from the source where possible. If unsupported, set its value to null.
    - "sourceMapping": one short phrase naming which part of the source this module draws from
    - "suggestedVideo": a short search phrase for a suitable YouTube or Khan Academy video (no URL)
    - "summary": one sentence a learner reads at the end to consolidate the module
- "gaps": an array of 2-4 objects { "gap": "...", "suggestion": "..." } naming what the source is MISSING for a complete course, and how to fill each gap.
- "flowNote": one sentence on the overall learning arc.

Rules: keep every string short, measurable, jargon-free, no numbering inside strings, no em dashes. Return ONLY the JSON object.

SOURCE MATERIAL:
${material}`;

  const callOnce = async (usePrefill: boolean): Promise<ArchitectBlueprint> => {
    const messages = usePrefill
      ? [{ role: "user" as const, content: prompt }, { role: "assistant" as const, content: "{" }]
      : [{ role: "user" as const, content: prompt + "\n\nReturn ONLY the JSON object, starting with {." }];
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 5000,
      messages,
    }, { timeout: 150000, maxRetries: 2 });
    const content = message.content[0];
    const body = content && content.type === "text" ? content.text : "";
    return normalizeBlueprint(parseLooseJson(usePrefill ? "{" + body : body));
  };

  // Prefer the JSON-prefill call; if it errors or comes back empty, fall back to a plain call.
  try {
    const bp = await callOnce(true);
    if (bp.modules.length) return bp;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("architect design (prefill) failed:", e instanceof Error ? e.message : e);
  }
  return await callOnce(false);
}

// Map: condense one chunk of a large document into compact teachable notes.
async function condenseChunk(chunk: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    messages: [{
      role: "user",
      content: `Condense this excerpt of course source material into compact teachable notes. Capture, in order: the main topics and subtopics, key terms with brief definitions, important processes or steps, and notable examples. Keep it factual and dense. No preamble, no commentary.

EXCERPT:
${chunk}`,
    }],
  }, { timeout: 70000, maxRetries: 1 });
  const content = message.content[0];
  return content && content.type === "text" ? content.text.trim() : "";
}

async function runArchitectJob(job: ArchitectJob, course: any, fullText: string, guidance: string): Promise<void> {
  try {
    let material = fullText;
    // Only map-reduce when the document is genuinely large; small ones go straight to design.
    if (fullText.length > 30000) {
      const chunks = chunkText(fullText, 20000, 12); // up to ~240k chars of source
      job.totalSteps = chunks.length + 1;
      const notes: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        job.phase = `Reading your material (part ${i + 1} of ${chunks.length})`;
        job.step = i; job.updatedAt = Date.now();
        notes.push(`--- Section ${i + 1} ---\n` + await condenseChunk(chunks[i]));
      }
      material = notes.join("\n\n").slice(0, 18000);
      job.phase = "Designing the course"; job.step = chunks.length; job.updatedAt = Date.now();
    } else {
      job.totalSteps = 1; job.step = 0; job.phase = "Designing the course"; job.updatedAt = Date.now();
    }
    const blueprint = await architectDesign(course, material, guidance);
    // An empty design usually means the model reply was truncated or not valid JSON. Surface it as
    // an error so the author can retry, rather than showing a blank blueprint.
    if (!blueprint.modules.length && !blueprint.courseObjectives.length) {
      throw new Error("Empty blueprint");
    }
    job.result = blueprint; job.status = "done"; job.step = job.totalSteps; job.phase = "Done"; job.updatedAt = Date.now();
    // Persist the blueprint AND populate the real course-level fields that are still empty, so the
    // generated design lands in the proper places (description, catalogue blurb, objectives) rather
    // than only living in a review panel. Never overwrite something the author already wrote.
    try {
      const fill: Record<string, unknown> = { architectBlueprint: JSON.stringify(blueprint) };
      if (!(course.description ?? "").trim() && blueprint.courseDescription) fill.description = blueprint.courseDescription;
      if (!(course.catalogDescription ?? "").trim() && blueprint.catalogDescription) fill.catalogDescription = blueprint.catalogDescription;
      if ((!course.objectives || course.objectives.length === 0) && blueprint.courseObjectives.length) fill.objectives = blueprint.courseObjectives;
      fill.updatedAt = new Date();
      await db.update(coursesTable).set(fill).where(eq(coursesTable.id, job.courseId));
    } catch { /* non-fatal */ }
  } catch (err) {
    // Log the real cause server-side (visible in Railway logs) and include a short detail in the
    // user-facing message (super-admin only surface) so failures can be diagnosed without log access.
    const detail = (() => {
      const anyErr = err as { status?: number; error?: { error?: { message?: string } }; message?: string };
      const status = anyErr?.status ? `HTTP ${anyErr.status}: ` : "";
      const msg = anyErr?.error?.error?.message || anyErr?.message || String(err);
      return (status + msg).slice(0, 300);
    })();
    // eslint-disable-next-line no-console
    console.error("architect job failed:", detail);
    job.status = "error";
    job.error = `The architect could not finish designing from that content. Details: ${detail}`;
    job.updatedAt = Date.now();
  }
}

// POST /courses/:courseId/architect -- start an architect job. Returns a jobId immediately; poll the
// status route below. NOTHING is written; the author reviews and then calls /architect/apply.
router.post("/courses/:courseId/architect", requireAuth, requireRole("super_admin", "partner_admin", "org_admin", "coach", "instructional_designer"), async (req, res) => {
  if (!(await canStaffActOnCourse(req.dbUser!, req.params.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const course = await db.query.coursesTable.findFirst({ where: eq(coursesTable.id, req.params.courseId) });
  if (!course) { res.status(404).json({ error: "Course not found" }); return; }
  // Accept the WHOLE document (bounded generously). The job reads all of it in chunks.
  const materialText = String(req.body?.materialText ?? "").slice(0, 300000);
  const extraGuidance = String(req.body?.guidance ?? "").slice(0, 1000);
  if (materialText.trim().length < 80) {
    res.status(400).json({ error: "Paste or upload more source content so the architect has something to work from." });
    return;
  }
  pruneArchitectJobs();
  const job: ArchitectJob = {
    id: crypto.randomUUID(), courseId: req.params.courseId,
    status: "processing", phase: "Starting", step: 0, totalSteps: 1,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  architectJobs.set(job.id, job);
  // Keep the source material on the course so module readings can be generated from the real
  // content later (best-effort; never blocks the job).
  try { await db.update(coursesTable).set({ sourceMaterial: materialText } as any).where(eq(coursesTable.id, req.params.courseId)); } catch { /* non-fatal */ }
  // Fire and forget: the request returns now, processing continues in the background.
  void runArchitectJob(job, course, materialText, extraGuidance);
  res.status(202).json({ jobId: job.id });
});

// GET /courses/:courseId/architect/jobs/:jobId -- poll job status/result.
router.get("/courses/:courseId/architect/jobs/:jobId", requireAuth, requireRole("super_admin", "partner_admin", "org_admin", "coach", "instructional_designer"), async (req, res) => {
  if (!(await canStaffActOnCourse(req.dbUser!, req.params.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const job = architectJobs.get(req.params.jobId);
  if (!job || job.courseId !== req.params.courseId) { res.status(404).json({ error: "Job not found. It may have expired; please run the architect again." }); return; }
  res.json({
    status: job.status, phase: job.phase, step: job.step, totalSteps: job.totalSteps,
    ...(job.status === "done" ? { result: job.result } : {}),
    ...(job.status === "error" ? { error: job.error } : {}),
  });
});

// GET /courses/:courseId/architect/blueprint -- the last saved blueprint (survives navigation).
router.get("/courses/:courseId/architect/blueprint", requireAuth, requireRole("super_admin", "partner_admin", "org_admin", "coach", "instructional_designer"), async (req, res) => {
  if (!(await canStaffActOnCourse(req.dbUser!, req.params.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const course = await db.query.coursesTable.findFirst({ where: eq(coursesTable.id, req.params.courseId) });
  if (!course) { res.status(404).json({ error: "Course not found" }); return; }
  let blueprint: ArchitectBlueprint | null = null;
  if (course.architectBlueprint) { try { blueprint = JSON.parse(course.architectBlueprint); } catch { blueprint = null; } }
  res.json({ blueprint });
});

// DELETE /courses/:courseId/architect/blueprint -- discard the saved blueprint.
router.delete("/courses/:courseId/architect/blueprint", requireAuth, requireRole("super_admin", "partner_admin", "org_admin", "coach", "instructional_designer"), async (req, res) => {
  if (!(await canStaffActOnCourse(req.dbUser!, req.params.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.update(coursesTable).set({ architectBlueprint: null }).where(eq(coursesTable.id, req.params.courseId));
  res.status(204).send();
});

// POST /courses/:courseId/architect/apply -- scaffold the approved blueprint into real modules.
// Creates one module per entry (title, overview as description, objectives) in order, appended after
// any existing modules. The rich per-section content is stored in the module description as a plan
// the author then fills in from the module tabs. Optionally saves the derived course objectives.
router.post("/courses/:courseId/architect/apply", requireAuth, requireRole("super_admin", "partner_admin", "org_admin", "coach", "instructional_designer"), async (req, res) => {
  const courseId = req.params.courseId;
  if (!(await canStaffActOnCourse(req.dbUser!, courseId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const incoming = Array.isArray(req.body?.modules) ? req.body.modules : [];
  const courseObjectives = Array.isArray(req.body?.courseObjectives) ? req.body.courseObjectives.map((o: any) => String(o)).filter(Boolean).slice(0, 12) : null;
  const courseDescription = String(req.body?.courseDescription ?? "").slice(0, 1500);
  const catalogDescription = String(req.body?.catalogDescription ?? "").slice(0, 200);
  if (incoming.length === 0) { res.status(400).json({ error: "No modules to create." }); return; }

  const courseRow = await db.query.coursesTable.findFirst({ where: eq(coursesTable.id, courseId) });
  // Append after existing modules so re-running does not renumber the current ones.
  const existing = await db.select({ order: modulesTable.order, title: modulesTable.title }).from(modulesTable).where(eq(modulesTable.courseId, courseId));
  let nextOrder = existing.reduce((mx, r) => Math.max(mx, r.order ?? 0), -1) + 1;

  // Re-running the architect must FILL GAPS, not duplicate. Skip any incoming module whose title
  // already exists on the course (and any repeats within this batch). Titles are matched loosely
  // (case/space/punctuation-insensitive) so "Goals, Vision & Mission" won't be re-created as a twin.
  const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const seenTitles = new Set(existing.map((r) => normTitle(r.title ?? "")));

  const createdBy = req.dbUser!.id;
  const created: string[] = [];
  let skipped = 0;
  for (const m of incoming) {
    const title = String(m?.title ?? "").trim();
    if (!title) continue;
    const key = normTitle(title);
    if (key && seenTitles.has(key)) { skipped++; continue; }
    if (key) seenTitles.add(key);
    const s = m?.sections ?? {};
    const overview = m?.overview ? String(m.overview).trim() : "";
    const summary = m?.summary ? String(m.summary).trim() : "";
    const readingPlan = s?.reading ? String(s.reading).trim() : "";
    const lecturePlan = s?.lecture ? String(s.lecture).trim() : "";
    const activityPlan = s?.activity ? String(s.activity).trim() : "";
    const casePlan = s?.caseStudy ? String(s.caseStudy).trim() : "";
    const assessmentPlan = s?.assessment ? String(s.assessment).trim() : "";
    const video = m?.suggestedVideo ? String(m.suggestedVideo).trim() : "";

    // Keep the module description clean: just the overview (and a short summary line). The section
    // intents (lecture/activity/case/video) become real content or on-demand generators, so they no
    // longer get dumped into the description as a wall of text.
    const description = [overview, summary].filter(Boolean).join("\n\n").slice(0, 2000);
    void lecturePlan; void activityPlan; void casePlan; void video; // retained for future per-section generation

    const objectives = Array.isArray(m?.objectives) ? m.objectives.map((o: any) => String(o)).filter(Boolean).slice(0, 8) : [];
    const [mod] = await db.insert(modulesTable).values({
      courseId, title, description, objectives, order: nextOrder++, status: "draft",
    }).returning();
    created.push(mod.id);

    // Populate the module's sections with real starter content the author expands. Each is
    // best-effort so one failure never aborts the whole scaffold.
    if (readingPlan) {
      const content = [overview, readingPlan, "This is a starter reading generated from your material. Expand it with the full text."]
        .filter(Boolean).join("\n\n");
      try {
        await db.insert(moduleReadingsTable).values({
          moduleId: mod.id, courseId, title: "Reading", kind: "document",
          content, chars: content.length, createdBy,
        } as any);
      } catch { /* non-fatal */ }
    }
    if (assessmentPlan) {
      try {
        await db.insert(assignmentsTable).values({
          courseId, moduleId: mod.id, title: "Assessment",
          description: assessmentPlan, instructions: assessmentPlan, published: false,
        } as any);
      } catch { /* non-fatal */ }
    }
  }

  // Refresh the course module count, save the derived course-level fields (only filling ones the
  // author has not already written), and clear the saved blueprint now that it has been applied.
  await db.update(coursesTable).set({
    moduleCount: existing.length + created.length,
    architectBlueprint: null,
    ...(courseObjectives && (!courseRow?.objectives || courseRow.objectives.length === 0) ? { objectives: courseObjectives } : {}),
    ...(courseDescription && !(courseRow?.description ?? "").trim() ? { description: courseDescription } : {}),
    ...(catalogDescription && !(courseRow?.catalogDescription ?? "").trim() ? { catalogDescription } : {}),
    updatedAt: new Date(),
  }).where(eq(coursesTable.id, courseId));

  res.status(201).json({ created: created.length, moduleIds: created, skipped });
});

// POST /courses/:courseId/modules/dedupe -- remove duplicate modules created by re-running the
// architect. Keeps the EARLIEST module of each title (the one the author has been building) and
// deletes the later twins. Staff-only. Returns how many were removed.
router.post("/courses/:courseId/modules/dedupe", requireAuth, requireRole("super_admin", "partner_admin", "org_admin", "coach", "instructional_designer"), async (req, res) => {
  const courseId = req.params.courseId;
  if (!(await canStaffActOnCourse(req.dbUser!, courseId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const mods = await db.select({ id: modulesTable.id, title: modulesTable.title, order: modulesTable.order })
    .from(modulesTable).where(eq(modulesTable.courseId, courseId));
  const norm = (t: string) => (t ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const byTitle = new Map<string, { id: string; order: number }[]>();
  for (const m of mods) { const k = norm(m.title); if (!k) continue; const a = byTitle.get(k) ?? []; a.push({ id: m.id, order: m.order ?? 0 }); byTitle.set(k, a); }
  const toRemove: string[] = [];
  for (const group of byTitle.values()) {
    if (group.length <= 1) continue;
    group.sort((a, b) => a.order - b.order); // keep the earliest
    for (const g of group.slice(1)) toRemove.push(g.id);
  }
  for (const id of toRemove) {
    await db.delete(moduleReadingsTable).where(eq(moduleReadingsTable.moduleId, id)).catch(() => {});
    await db.delete(assignmentsTable).where(eq(assignmentsTable.moduleId, id)).catch(() => {});
    await db.delete(modulesTable).where(eq(modulesTable.id, id)).catch(() => {});
  }
  const remaining = mods.length - toRemove.length;
  await db.update(coursesTable).set({ moduleCount: remaining, updatedAt: new Date() }).where(eq(coursesTable.id, courseId)).catch(() => {});
  res.json({ removed: toRemove.length, remaining });
});

/**
 * POST /courses/setup-platform (super admin), one-time: make the assignment table exist and
 * bring EVERY existing course under super-admin ownership (tenantId "platform") so the whole
 * catalogue is owned centrally and delivered to partners by assignment. Idempotent. Needed
 * because the server has no psql access to run the migration by hand.
 */
router.post("/courses/setup-platform", requireAuth, requireRole("super_admin"), async (_req, res) => {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS course_partner_assignments (
      id text PRIMARY KEY,
      course_id text NOT NULL,
      partner_id text NOT NULL,
      assigned_by text,
      assigned_at timestamptz NOT NULL DEFAULT now()
    )`);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS course_partner_assignments_course_partner_uidx
      ON course_partner_assignments (course_id, partner_id)`);
  const updated = await db.update(coursesTable).set({ tenantId: "platform" }).returning({ id: coursesTable.id });
  res.json({ ok: true, coursesAdopted: updated.length });
});

// GET /courses/:courseId/partners (super admin), which partners this course is assigned to.
router.get("/courses/:courseId/partners", requireAuth, requireRole("super_admin"), async (req, res) => {
  try {
    const rows = await db
      .select({ partnerId: coursePartnerAssignmentsTable.partnerId })
      .from(coursePartnerAssignmentsTable)
      .where(eq(coursePartnerAssignmentsTable.courseId, req.params.courseId));
    res.json({ partnerIds: [...new Set(rows.map((r) => r.partnerId))] });
  } catch {
    // Table not created yet (setup-platform not run) -> no assignments.
    res.json({ partnerIds: [] });
  }
});

// PUT /courses/:courseId/partners (super admin), replace the set of partners a course is
// assigned to. Body: { partnerIds: string[] }.
router.put("/courses/:courseId/partners", requireAuth, requireRole("super_admin"), async (req, res) => {
  const courseId = req.params.courseId;
  const partnerIds = Array.isArray(req.body?.partnerIds)
    ? [...new Set((req.body.partnerIds as unknown[]).filter((p): p is string => typeof p === "string" && p.length > 0))]
    : [];
  await db.delete(coursePartnerAssignmentsTable).where(eq(coursePartnerAssignmentsTable.courseId, courseId));
  if (partnerIds.length) {
    await db.insert(coursePartnerAssignmentsTable).values(
      partnerIds.map((partnerId) => ({ courseId, partnerId, assignedBy: req.dbUser!.id })),
    );
  }
  res.json({ partnerIds });
});

// GET /partners/:partnerId/courses (super admin), course ids assigned to a partner.
router.get("/partners/:partnerId/courses", requireAuth, requireRole("super_admin"), async (req, res) => {
  try {
    const rows = await db
      .select({ courseId: coursePartnerAssignmentsTable.courseId })
      .from(coursePartnerAssignmentsTable)
      .where(eq(coursePartnerAssignmentsTable.partnerId, req.params.partnerId));
    res.json({ courseIds: [...new Set(rows.map((r) => r.courseId))] });
  } catch {
    res.json({ courseIds: [] });
  }
});

// PUT /partners/:partnerId/courses (super admin), replace the set of courses assigned to a
// partner. Self-creates the assignment table so the create-partner flow works before the
// one-time setup-platform has ever run.
router.put("/partners/:partnerId/courses", requireAuth, requireRole("super_admin"), async (req, res) => {
  const partnerId = req.params.partnerId;
  const courseIds = Array.isArray(req.body?.courseIds)
    ? [...new Set((req.body.courseIds as unknown[]).filter((c): c is string => typeof c === "string" && c.length > 0))]
    : [];
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS course_partner_assignments (
      id text PRIMARY KEY,
      course_id text NOT NULL,
      partner_id text NOT NULL,
      assigned_by text,
      assigned_at timestamptz NOT NULL DEFAULT now()
    )`);
  await db.delete(coursePartnerAssignmentsTable).where(eq(coursePartnerAssignmentsTable.partnerId, partnerId));
  if (courseIds.length) {
    await db.insert(coursePartnerAssignmentsTable).values(
      courseIds.map((courseId) => ({ courseId, partnerId, assignedBy: req.dbUser!.id })),
    );
  }
  res.json({ courseIds });
});

// GET /courses/:courseId
router.get("/courses/:courseId", requireAuth, async (req, res) => {
  const course = await db.query.coursesTable.findFirst({
    where: eq(coursesTable.id, req.params.courseId),
  });
  if (!course) { res.status(404).json({ error: "Not found" }); return; }
  // A learner may VIEW any course in their catalogue (their tenant owns it, or it is assigned to
  // their partner), even before enrolling, the detail page is the enrol/overview surface. Gating
  // this on enrolment 403'd every non-enrolled catalogue course, and the client rendered that 403
  // as "Course not found", so 13 of 14 catalogue links looked broken. Enrolment still gates the
  // actual coursework routes; visibility here only needs catalogue scope.
  if (!(await canViewCourseCatalog(req.dbUser!, course.id))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const modules = await db
    .select()
    .from(modulesTable)
    .where(eq(modulesTable.courseId, course.id))
    .orderBy(modulesTable.order);
  // Attach the completeness verdict so an author who opens an incomplete course sees what is missing.
  // Detail stays reachable whether or not the course is catalogue-eligible (this is the edit surface).
  const completeness = (await loadCourseCompleteness([{ id: course.id, status: course.status }])).get(course.id);
  res.json({
    ...toCourseResponse(course, completeness),
    modules: modules.map(m => ({
      id: m.id,
      courseId: m.courseId,
      title: m.title,
      description: m.description,
      status: m.status,
      order: m.order,
      beatCount: m.beatCount,
      estimatedMinutes: m.estimatedMinutes,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

// PATCH /courses/:courseId
router.patch("/courses/:courseId", requireAuth, requireRole("super_admin", "partner_admin", "org_admin", "coach", "instructional_designer"), async (req, res) => {
  // requireRole proves staff SOMEWHERE, not staff on THIS course, so a coach/admin of one
  // org could edit another org's course metadata. Add the course-scoped check.
  if (!(await canStaffActOnCourse(req.dbUser!, req.params.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const { title, description, catalogDescription, status, competencyTags, nqfLevel, thumbnailUrl, objectives, overviewConfig, tocConfig, sectionPolicies } = req.body;
  const [updated] = await db
    .update(coursesTable)
    .set({
      title, description, status, competencyTags, nqfLevel, thumbnailUrl,
      ...(catalogDescription !== undefined ? { catalogDescription } : {}),
      ...(objectives !== undefined ? { objectives } : {}),
      ...(overviewConfig !== undefined ? { overviewConfig } as Record<string, unknown> : {}),
      ...(tocConfig !== undefined ? { tocConfig } as Record<string, unknown> : {}),
      ...(sectionPolicies !== undefined ? { sectionPolicies } as Record<string, unknown> : {}),
      updatedAt: new Date(),
    } as any)
    .where(eq(coursesTable.id, req.params.courseId))
    .returning();
  res.json(toCourseResponse(updated));
});

// DELETE /courses/:courseId
router.delete("/courses/:courseId", requireAuth, async (req, res) => {
  const courseId = req.params.courseId;
  // Deleting an entire course had no authorization check whatsoever.
  if (!(await canStaffActOnCourse(req.dbUser!, courseId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  // This schema has no FK cascades, so a bare course delete would orphan its modules, beats,
  // progress, enrolments, etc. Clean the course's children explicitly (best-effort; order-safe
  // since there are no constraints) so deleting a half-built course leaves nothing behind.
  try {
    const mods = await db.select({ id: modulesTable.id }).from(modulesTable).where(eq(modulesTable.courseId, courseId));
    const modIds = mods.map((m) => m.id);
    if (modIds.length) {
      await db.delete(beatsTable).where(inArray(beatsTable.moduleId, modIds)).catch(() => {});
      await db.delete(caseScenariosTable).where(inArray(caseScenariosTable.moduleId, modIds)).catch(() => {});
    }
    await db.delete(beatProgressTable).where(eq(beatProgressTable.courseId, courseId)).catch(() => {});
    await db.delete(moduleReadingsTable).where(eq(moduleReadingsTable.courseId, courseId)).catch(() => {});
    await db.delete(interactiveActivitiesTable).where(eq(interactiveActivitiesTable.courseId, courseId)).catch(() => {});
    await db.delete(discussionsTable).where(eq(discussionsTable.courseId, courseId)).catch(() => {});
    await db.delete(assignmentsTable).where(eq(assignmentsTable.courseId, courseId)).catch(() => {});
    await db.delete(enrolmentsTable).where(eq(enrolmentsTable.courseId, courseId)).catch(() => {});
    await db.delete(coursePartnerAssignmentsTable).where(eq(coursePartnerAssignmentsTable.courseId, courseId)).catch(() => {});
    await db.delete(modulesTable).where(eq(modulesTable.courseId, courseId)).catch(() => {});
  } catch { /* best-effort cleanup */ }
  await db.delete(coursesTable).where(eq(coursesTable.id, courseId));
  res.status(204).send();
});

// POST /courses/:courseId/clone -- deep-copy a course with its modules, beats, assignments and
// course-linked interactive activities. The copy starts as a draft owned by the caller's tenant.
router.post("/courses/:courseId/clone", requireAuth, requireRole("super_admin", "partner_admin", "org_admin", "coach", "instructional_designer"), async (req, res) => {
  const user = req.dbUser!;
  const src = await db.query.coursesTable.findFirst({ where: eq(coursesTable.id, req.params.courseId) });
  if (!src) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canStaffActOnCourse(user, src.id))) { res.status(403).json({ error: "Forbidden" }); return; }
  const tenantId = user.partnerId ?? user.organisationId ?? user.id;

  // 1) the course row (drop identity/counters, force draft, retitle)
  const { id: _cid, createdAt: _cc, updatedAt: _cu, moduleCount: _cmc, enrolmentCount: _cec, ...courseRest } = src as any;
  const [course] = await db.insert(coursesTable)
    .values({ ...courseRest, title: `Copy of ${src.title}`, status: "draft", tenantId })
    .returning();

  // 2) modules (+ their beats), keeping an old->new module id map for downstream links
  const mods = await db.select().from(modulesTable).where(eq(modulesTable.courseId, src.id)).orderBy(modulesTable.order);
  const moduleIdMap: Record<string, string> = {};
  for (const m of mods) {
    const { id: oldMid, createdAt: _mc, updatedAt: _mu, ...modRest } = m as any;
    const [nm] = await db.insert(modulesTable).values({ ...modRest, courseId: course.id }).returning();
    moduleIdMap[oldMid] = nm.id;
    const beats = await db.select().from(beatsTable).where(eq(beatsTable.moduleId, oldMid));
    for (const b of beats) {
      const { id: _bid, createdAt: _bc, updatedAt: _bu, ...beatRest } = b as any;
      await db.insert(beatsTable).values({ ...beatRest, moduleId: nm.id });
    }
  }

  // 3) assignments (remap moduleId if the assignment was module-scoped)
  const asgs = await db.select().from(assignmentsTable).where(eq(assignmentsTable.courseId, src.id));
  for (const a of asgs) {
    const { id: _aid, createdAt: _ac, updatedAt: _au, ...asgRest } = a as any;
    await db.insert(assignmentsTable).values({ ...asgRest, courseId: course.id, moduleId: a.moduleId ? (moduleIdMap[a.moduleId] ?? null) : null });
  }

  // 4) interactive activities linked to the course (remap moduleId)
  const acts = await db.select().from(interactiveActivitiesTable).where(eq(interactiveActivitiesTable.courseId, src.id));
  for (const act of acts) {
    const { id: _iid, createdAt: _ic, updatedAt: _iu, ...actRest } = act as any;
    await db.insert(interactiveActivitiesTable).values({ ...actRest, courseId: course.id, moduleId: act.moduleId ? (moduleIdMap[act.moduleId] ?? null) : null });
  }

  await db.update(coursesTable).set({ moduleCount: mods.length }).where(eq(coursesTable.id, course.id));
  res.status(201).json(toCourseResponse({ ...course, moduleCount: mods.length }));
});

export default router;
