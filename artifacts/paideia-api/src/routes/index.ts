import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import copilotRouter from "./copilot/index.js";
import studyRouter from "./study/index.js";
import v1Router from "./v1.js";
import consentRouter from "./consent.js";
import dataRightsRouter from "./dataRights.js";

const router: IRouter = Router();

router.use(healthRouter);
// POPIA consent + data-subject rights for the signed-in learner (guarded inside).
router.use(consentRouter);
router.use(dataRightsRouter);
router.use("/copilot", copilotRouter);
router.use("/study", studyRouter);
// Public integration API (API-key auth): e.g. Praxis -> Coach off-track catch-up push.
router.use("/v1", v1Router);

export default router;
