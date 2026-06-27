import { Router, type IRouter } from "express";
import healthRouter from "./health";
import profileRouter from "./profile";
import messagesRouter from "./messages";
import materialRouter from "./material";
import plansRouter from "./plans";
import checkpointsRouter from "./checkpoints";
import progressRouter from "./progress";
import adminRouter from "./admin";
import accountRouter from "./account";
import billingRouter from "./billing";
import referralRouter from "./referral";
import cohortsRouter from "./cohorts";
import developerRouter from "./developer";
import v1Router from "./v1";
import activityRouter from "./activity";
import testLoginRouter from "./test-login";
import { aiLimiter, authLimiter } from "../middlewares/rateLimit";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profileRouter);

// Throttle the expensive Anthropic-backed write endpoints. The limiter skips
// GETs, so listing messages/material stays governed by the global limiter only.
router.use("/messages", aiLimiter);
router.use("/material", aiLimiter);
router.use(messagesRouter);
router.use(materialRouter);

router.use(plansRouter);
router.use(checkpointsRouter);
router.use(progressRouter);
router.use(adminRouter);
router.use(accountRouter);
router.use(billingRouter);
router.use(referralRouter);
router.use(cohortsRouter);
router.use(developerRouter);
router.use(v1Router);
router.use(activityRouter);

// Strict limit on the unauthenticated dev test-login endpoint.
router.use("/test-login", authLimiter);
router.use(testLoginRouter);

export default router;
