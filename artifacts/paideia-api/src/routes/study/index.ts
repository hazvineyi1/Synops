import { Router, type IRouter } from "express";
import authRouter from "./auth.js";
import materialsRouter from "./materials.js";
import uploadRouter from "./upload.js";
import flashcardsRouter from "./flashcards.js";
import practiceRouter from "./practice.js";
import examsRouter from "./exams.js";
import tutorRouter from "./tutor.js";
import profileRouter from "./profile.js";
import briefsRouter from "./briefs.js";
import dashboardRouter from "./dashboard.js";
import billingRouter from "./billing.js";
import knowledgeRouter from "./knowledge.js";
import adaptiveRouter from "./adaptive.js";
import assessmentRouter from "./assessment.js";
import pathsRouter from "./paths.js";
import strategyRouter from "./strategy.js";
import adminRouter from "./admin.js";
import adminAnalyticsRouter from "./admin-analytics.js";
import telemetryRouter from "./telemetry.js";
import notificationsRouter from "./notifications.js";
import ambassadorRouter from "./ambassador.js";
import accountRouter from "./account.js";
import { writeRateLimit } from "../../middlewares/rateLimit.js";

const router: IRouter = Router();

// Cap the cost/abuse exposure of the expensive AI-generation endpoints. These
// only throttle mutating requests (POST/PUT/PATCH/DELETE) so reads are never
// blocked. Keyed by client IP + route (needs `trust proxy`, set in app.ts, so
// req.ip is the real caller and not Railway's shared proxy address). Limits are
// generous for a real learner but stop a runaway loop from burning model spend.
const aiWrite = writeRateLimit({ windowMs: 10 * 60 * 1000, max: 40 });
// The tutor is chat: many short messages per session are normal, so allow more.
const tutorWrite = writeRateLimit({ windowMs: 10 * 60 * 1000, max: 80 });

router.use("/auth", authRouter);
router.use("/materials/upload", aiWrite, uploadRouter);
router.use("/materials", aiWrite, materialsRouter);
router.use("/flashcards", flashcardsRouter);
router.use("/practice", aiWrite, practiceRouter);
router.use("/exams", aiWrite, examsRouter);
router.use("/tutor", tutorWrite, tutorRouter);
router.use("/profile", profileRouter);
router.use("/briefs", briefsRouter);
router.use("/dashboard", dashboardRouter);
router.use("/billing", billingRouter);
router.use("/knowledge", aiWrite, knowledgeRouter);
router.use("/adaptive", aiWrite, adaptiveRouter);
router.use("/assessments", aiWrite, assessmentRouter);
router.use("/paths", aiWrite, pathsRouter);
router.use("/strategy", aiWrite, strategyRouter);
router.use("/admin", adminRouter);
router.use("/admin", adminAnalyticsRouter);
router.use("/telemetry", telemetryRouter);
router.use("/notifications", notificationsRouter);
router.use("/ambassador", ambassadorRouter);
router.use("/account", accountRouter);

export default router;
