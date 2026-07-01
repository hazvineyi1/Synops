import { Router, type IRouter } from "express";
import {
  db,
  studyWeeklyBriefsTable,
} from "@workspace/paideia-db";
import { eq, desc } from "drizzle-orm";
import { requireStudyUser } from "../../middlewares/auth.js";

const router: IRouter = Router();
router.use(requireStudyUser);

router.get("/", async (req, res) => {
  const userId = req.studyUser!.id;
  const rows = await db
    .select()
    .from(studyWeeklyBriefsTable)
    .where(eq(studyWeeklyBriefsTable.userId, userId))
    .orderBy(desc(studyWeeklyBriefsTable.weekStart))
    .limit(12);
  res.json(rows);
});

router.get("/latest", async (req, res) => {
  const userId = req.studyUser!.id;
  const rows = await db
    .select()
    .from(studyWeeklyBriefsTable)
    .where(eq(studyWeeklyBriefsTable.userId, userId))
    .orderBy(desc(studyWeeklyBriefsTable.weekStart))
    .limit(1);

  if (rows.length === 0) {
    // Return a default empty brief
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    res.json({
      id: "placeholder",
      userId,
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      flashcardsReviewed: 0,
      practiceSessionsCompleted: 0,
      mockExamsTaken: 0,
      averageAccuracy: 0,
      tutorConversations: 0,
      newConceptsMastered: 0,
      weakAreas: [],
      recommendations: ["Start by adding your first study material!"],
      aiSummary: "Welcome to Paideia Study! This is your weekly progress brief. As you study, I'll track your progress and provide personalized insights.",
      generatedAt: now.toISOString(),
    });
    return;
  }

  res.json(rows[0]);
});

export default router;
