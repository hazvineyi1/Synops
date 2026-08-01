import { db } from "@workspace/db";
import { interactiveActivitiesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { GAME_TEMPLATES, DIGITAL_CATALOG, BAND_LABEL, type Band } from "./gameTemplates";

/**
 * Seeds the reusable "Game Library" — the repository of ready-to-use game activities that any teacher
 * can browse and add to their classes.
 *
 * Everything here is a PLATFORM library item: `isLibrary: true` + `organisationId: null`, which the
 * activities API surfaces to every tenant (see GET /activities scoping). Two kinds of rows:
 *   1. Built game-show templates (Jeopardy, Feud, Bingo, …) rendered with band-appropriate sample
 *      content, tagged `game-library`, `game:<key>`, `band:<band>` so the library is filterable.
 *   2. A curated CATALOG of commercial digital titles (Prodigy, Blooket, Minecraft Education, …) as
 *      `source:"embed"` link cards — these are recommended, not rebuilt, so they open externally.
 *
 * Idempotent: matched by title (+ isLibrary), so re-running refreshes content in place.
 */
export async function seedGameLibrary(createdByUserId: string): Promise<{
  games: number; catalog: number; created: number; updated: number;
}> {
  let created = 0;
  let updated = 0;

  // 1. Built game templates × their supported bands.
  for (const t of GAME_TEMPLATES) {
    for (const band of t.bands as Band[]) {
      const s = t.sample(band);
      const html = t.build(s.content);
      const tags = ["game-library", `game:${t.key}`, `band:${band}`, BAND_LABEL[band], t.name];
      const fields = {
        organisationId: null, courseId: null, moduleId: null,
        title: s.title, instructions: s.instructions, html,
        source: "html" as const, kind: "game",
        bloomsLevel: "Understand", difficulty: "foundational" as const,
        isLibrary: true, tags, published: true, createdByUserId,
      };
      const existing = await db.select().from(interactiveActivitiesTable)
        .where(and(eq(interactiveActivitiesTable.title, s.title), eq(interactiveActivitiesTable.isLibrary, true)));
      if (existing[0]) {
        await db.update(interactiveActivitiesTable).set({ ...fields, updatedAt: new Date() }).where(eq(interactiveActivitiesTable.id, existing[0].id));
        updated++;
      } else {
        await db.insert(interactiveActivitiesTable).values(fields);
        created++;
      }
    }
  }

  // 2. Curated catalog of commercial digital titles (linked, not rebuilt).
  for (const c of DIGITAL_CATALOG) {
    const tags = ["game-catalog", "external-tool", c.subjects, ...c.bands.map((b) => `band:${b}`), ...c.bands.map((b) => BAND_LABEL[b])];
    const fields = {
      organisationId: null, courseId: null, moduleId: null,
      title: c.name, instructions: `${c.subjects} — ${c.note}`, html: "",
      source: "embed" as const, embedUrl: c.url, kind: "external-tool",
      bloomsLevel: "Apply", difficulty: "intermediate" as const,
      isLibrary: true, tags, published: true, createdByUserId,
    };
    const existing = await db.select().from(interactiveActivitiesTable)
      .where(and(eq(interactiveActivitiesTable.title, c.name), eq(interactiveActivitiesTable.isLibrary, true), eq(interactiveActivitiesTable.source, "embed")));
    if (existing[0]) {
      await db.update(interactiveActivitiesTable).set({ ...fields, updatedAt: new Date() }).where(eq(interactiveActivitiesTable.id, existing[0].id));
      updated++;
    } else {
      await db.insert(interactiveActivitiesTable).values(fields);
      created++;
    }
  }

  const games = GAME_TEMPLATES.reduce((n, t) => n + t.bands.length, 0);
  return { games, catalog: DIGITAL_CATALOG.length, created, updated };
}
