# Paideia — Positioning & Integration Plan

Paideia (pronounced *pie-DAY-uh*) is the **K-12 pillar** of the Synops learning family.
This doc has two parts: (1) positioning + ready-to-use marketing copy for the Synops
site, and (2) the plan to bring `Paideia-Ren` into the monorepo and off its non-profit
branding — the same playbook used to turn "Compass" into Kanon.

---

## 1. Positioning

### The family (how Paideia fits)

> **Synops** builds learning tools for every stage. **Kanon** helps institutions design
> accredited curriculum. **Arete** coaches adults through professional and entrance exams.
> **Paideia** is for K-12 — an AI study tutor that meets younger learners where they are.

Three products, three clearly separate lanes — no overlap:

| Product | Audience | Job |
|---|---|---|
| Kanon | Colleges, schools, instructional designers | Build & accredit curriculum |
| Paideia | **K-12 students, teachers, parents** | **Tutor & support day-to-day learning** |
| Arete | Adults, exam candidates | Prep for high-stakes exams |

### Positioning paragraph (for an About / Platforms section)

> **Paideia** is the K-12 member of the Synops family — an AI study tutor built for how
> younger students actually learn. It adapts to each learner's level, keeps explanations
> age-appropriate and curriculum-aligned, and draws on a deliberately diverse, globally
> representative library so every child sees themselves in the material. Paideia gives
> students patient, on-demand help, gives teachers a tutor that extends their reach, and
> gives parents visibility into real progress — all under the same Synops standard of
> quality and care.

### Moving off the non-profit framing

Keep the *mission* (access, equity, representation) but reframe the *identity*: Paideia is
no longer "a non-profit study-help project" — it's "the K-12 product in the Synops learning
family." The equity story becomes a **feature and value** of a Synops product, not a
charitable disclaimer. Practically: remove 501(c)(3)/non-profit/donation language, "Study
Tutor" placeholder naming, and old standalone branding; adopt Synops/Paideia identity.

### Homepage card copy (drop-in, matches the Arete/Kanon cards)

```
PAIDEIA  ·  K-12 Learning
An AI study tutor for younger learners.

Adaptive, curriculum-aligned, and inclusive help that meets K-12 students
at their level — and gives teachers and parents a partner in their progress.

[ Explore Paideia ]   (or "Coming soon" until it's deployed)
```

Short nav/footer label: **Paideia — K-12**

---

## 2. Integration + Rebrand Plan (Compass→Kanon playbook)

`Paideia-Ren` is a Replit-based monorepo with the same shape as Synops:
`artifacts/` (api-server, paideia-app, paideia-ren, paideia-study, mockup-sandbox) + `lib/`.
That structural similarity means the same sequence we used for Kanon applies cleanly.

**Prerequisite (currently blocked):** get the code into the workspace. The repo-add tool is
returning backend 404s and the sandbox can't clone a private repo without credentials — retry
add_repo shortly, or grant access; everything below waits on that.

**M1 — Integrate into the monorepo.** Copy `Paideia-Ren/artifacts/*` into the Synops monorepo
as `artifacts/paideia*` (e.g. `artifacts/paideia`, `artifacts/paideia-api`) and `lib/*` as
`lib/paideia-*` scoped packages (`@workspace/paideia-*`). Reuse the shared `@workspace/identity`
and `@workspace/billing` libs rather than duplicating. Wire workspace package names + tsconfig
references like Kanon.

**M2 — Decouple from Replit.** Remove `@replit/*` runtime deps and the Replit connectors
(email/object-storage), the `.replit` config, and Replit-only Vite plugins from the production
build — exactly what we did for Arete and what's still pending for Kanon. Add a `Dockerfile.paideia`
+ `railway.paideia.json` (mirror `Dockerfile.kanon`).

**M3 — Rebrand off non-profit / "Study Tutor".** Audit and swap visible brand elements:
- Names: "Study Tutor" / old non-profit name → **Paideia**.
- Copy/legal: remove 501(c)(3)/non-profit/donation language; add Synops footer + metadata.
- Visuals: logo, colors, favicon, page `<title>`s, OG tags.
- Add the pronunciation touchpoint (*pie-DAY-uh*) where the other products surface theirs.
- Keep the diversity/representation content — reframe it as a Paideia feature.

**M4 — Deploy.** Stand it up like Kanon: its own Supabase project (note the **2-active-project
free cap per account** — you'd need to free a slot or go Pro for a 3rd live DB), push schema,
Railway service via `railway.paideia.json`, env vars, domain `paideia.synops-consulting.com`.

**M5 — Link from the site.** Add the Paideia card/nav entry (copy above) to the Synops
marketing site, pointing at the live Paideia (or "coming soon" until M4 is done).

---

### Immediately doable now (no code access needed)
- This positioning + card copy (above) — ready to drop on the Synops site.
- Adding the Paideia card to the marketing site as "coming soon" while integration waits.

### Gated on repo access
- M1–M4 (integration, rebrand, deploy) — all need `Paideia-Ren`'s code in the workspace.
