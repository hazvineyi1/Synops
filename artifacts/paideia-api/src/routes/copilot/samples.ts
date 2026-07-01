import { Router, type IRouter } from "express";
import { db, samplesTable, worksheetsTable, quizzesTable } from "@workspace/paideia-db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth, requireActiveTeacher } from "../../middlewares/auth.js";
import { requireQuota } from "../../middlewares/quota.js";
import { logEvent } from "../../lib/eventLog.js";

const router: IRouter = Router();

async function listSamples(region: string | null, kind: string | null) {
  const conditions = [] as ReturnType<typeof eq>[];
  if (region) conditions.push(eq(samplesTable.region, region));
  if (kind) conditions.push(eq(samplesTable.kind, kind));
  const where = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions);
  return db
    .select()
    .from(samplesTable)
    .where(where)
    .orderBy(desc(samplesTable.createdAt))
    .limit(100);
}

router.get("/public", async (req, res) => {
  const region = typeof req.query["region"] === "string" ? req.query["region"] : null;
  const kind = typeof req.query["kind"] === "string" ? req.query["kind"] : null;
  const rows = await listSamples(region, kind);
  res.json({ samples: rows });
});

router.get("/public/:id", async (req, res) => {
  const id = req.params["id"];
  if (!id) { res.status(400).json({ error: "Missing id" }); return; }
  const rows = await db.select().from(samplesTable).where(eq(samplesTable.id, id)).limit(1);
  if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ sample: rows[0] });
});

router.get("/", async (req, res) => {
  const region = typeof req.query["region"] === "string" ? req.query["region"] : null;
  const kind = typeof req.query["kind"] === "string" ? req.query["kind"] : null;
  const rows = await listSamples(region, kind);
  res.json({ samples: rows });
});

router.get("/:id", async (req, res) => {
  const id = req.params["id"];
  if (!id) {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  const rows = await db.select().from(samplesTable).where(eq(samplesTable.id, id)).limit(1);
  if (!rows[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ sample: rows[0] });
});

router.post(
  "/:id/copy",
  requireAuth,
  requireActiveTeacher,
  requireQuota,
  async (req, res) => {
    const id = req.params["id"];
    if (typeof id !== "string" || !id) {
      res.status(400).json({ error: "Missing id" });
      return;
    }
    const rows = await db.select().from(samplesTable).where(eq(samplesTable.id, id)).limit(1);
    const sample = rows[0];
    if (!sample) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (sample.kind !== "worksheet" && sample.kind !== "quiz") {
      res.status(400).json({ error: "Only worksheet and quiz samples can be copied." });
      return;
    }
    const content = sample.content as Record<string, unknown>;
    const title = (typeof content["title"] === "string" && content["title"]) || sample.title;
    const newTitle = `${title} (copy)`;

    if (sample.kind === "worksheet") {
      const questions = Array.isArray(content["questions"]) ? (content["questions"] as unknown[]) : [];
      const [worksheet] = await db
        .insert(worksheetsTable)
        .values({
          teacherId: req.teacher!.id,
          title: newTitle,
          region: sample.region,
          subject: sample.subject,
          yearGroup: sample.yearGroup,
          topic: typeof content["topic"] === "string" ? (content["topic"] as string) : sample.title,
          difficulty: typeof content["difficulty"] === "string" ? (content["difficulty"] as string) : "core",
          questionCount: questions.length || 0,
          content: { ...content, title: newTitle },
        })
        .returning();
      void logEvent(req, "sample_copied", { sampleId: sample.id, kind: "worksheet", resourceId: worksheet?.id }, { surface: "app" });
      res.json({ kind: "worksheet", id: worksheet!.id });
      return;
    }

    // quiz
    const items = Array.isArray(content["items"]) ? (content["items"] as unknown[]) : [];
    const [quiz] = await db
      .insert(quizzesTable)
      .values({
        teacherId: req.teacher!.id,
        title: newTitle,
        region: sample.region,
        subject: sample.subject,
        yearGroup: sample.yearGroup,
        topic: typeof content["topic"] === "string" ? (content["topic"] as string) : sample.title,
        format: typeof content["format"] === "string" ? (content["format"] as string) : "exit ticket",
        questionCount: items.length || 0,
        content: { ...content, title: newTitle },
      })
      .returning();
    void logEvent(req, "sample_copied", { sampleId: sample.id, kind: "quiz", resourceId: quiz?.id }, { surface: "app" });
    res.json({ kind: "quiz", id: quiz!.id });
  },
);

export default router;
