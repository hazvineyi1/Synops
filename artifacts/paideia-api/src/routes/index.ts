import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import copilotRouter from "./copilot/index.js";
import studyRouter from "./study/index.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/copilot", copilotRouter);
router.use("/study", studyRouter);

export default router;
