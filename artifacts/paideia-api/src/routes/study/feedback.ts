import { Router, type IRouter } from "express";
import { db, studyActivityLogTable } from "@workspace/paideia-db";
import { requireStudyUser } from "../../middlewares/auth.js";
import { rateLimit } from "../../middlewares/rateLimit.js";

// In-app feedback. No dedicated table: each submission is stored as an activity-log
// row (activity_type='feedback') with the message, page, and submitter details in
// metadata. The admin console reads them back via GET /admin/feedback.
const router: IRouter = Router();
router.use(requireStudyUser);

router.post("/", rateLimit({ windowMs: 10 * 60 * 1000, max: 10 }), async (req, res) => {
  const user = req.studyUser!;
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const page = typeof req.body?.page === "string" ? req.body.page.slice(0, 200) : null;
  if (message.length < 3) {
    res.status(400).json({ error: "Please add a little more detail." });
    return;
  }
  await db.insert(studyActivityLogTable).values({
    userId: user.id,
    activityType: "feedback",
    metadata: {
      message: message.slice(0, 4000),
      page,
      email: user.email,
      name: user.name,
    },
  });
  res.status(201).json({ ok: true });
});

export default router;
