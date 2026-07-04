import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import passwordResetRouter from "./password-reset";
import contactRouter from "./contact";
import demoRouter from "./demo";
import brandingRouter from "./branding";
import clientsRouter from "./clients";
import projectsRouter from "./projects";
import coursesRouter from "./courses";
import objectivesRouter from "./objectives";
import assessmentsRouter from "./assessments";
import ledgerRouter from "./ledger";
import qaRouter from "./qa";
import standardsRouter from "./standards";
import dashboardRouter from "./dashboard";
import intakeRouter from "./intake";
import buildersRouter from "./builders";
import allocationsRouter from "./allocations";
import classesRouter from "./classes";
import schoolRouter from "./school";
import consoleRouter from "./console";
import impersonationRouter from "./impersonation";
import meetingRecordingsRouter from "./meeting-recordings";
import agendaRouter from "./agenda";
import correspondenceRouter from "./correspondence";
import timeTrackingRouter from "./time-tracking";
import evidenceRouter from "./evidence";
import storageRouter from "./storage";
import billingRouter from "./billing";
import { requireAuth, requireProduct } from "../lib/auth";
import { loadActorContext } from "../lib/actor";
import { blockWritesWhenReadOnly } from "../lib/readonly";

const router: IRouter = Router();

// ── Public routes ───────────────────────────────────────────
router.use(healthRouter);
router.use(authRouter);
router.use(passwordResetRouter);
router.use(contactRouter);
router.use(demoRouter);
router.use(brandingRouter);

// ── Compass curriculum builder (single guarded namespace) ────
// Every curriculum route lives under /compass behind ONE gate applied at the top
// of the engine router: authenticate, confirm the Compass product (admins and
// super-admins bypass), then load the actor's tenancy context. Because the gate
// sits above every mounted module, a route added inside the engine is always
// authenticated, product-gated, and org-aware. There is no way to register an
// ungated curriculum route here (the previous path-prefix allowlist could leave
// a new prefix wide open). See engine.safeguard.test.ts.
const engineRouter = Router();
engineRouter.use(requireAuth, requireProduct("compass"), loadActorContext);
// Billing is mounted FIRST, above the read-only guard, so a read-only tenant
// (e.g. an expired trial) can still reach checkout/portal to upgrade. Its own
// handlers authorize each action.
engineRouter.use(billingRouter);
// From here down, create/edit/delete is refused for read-only tenants; reads
// always pass. Global actors and the internal org bypass (see billing.canWrite).
engineRouter.use(blockWritesWhenReadOnly);
engineRouter.use(dashboardRouter);
engineRouter.use(clientsRouter);
engineRouter.use(projectsRouter);
engineRouter.use(coursesRouter);
engineRouter.use(objectivesRouter);
engineRouter.use(assessmentsRouter);
engineRouter.use(ledgerRouter);
engineRouter.use(qaRouter);
engineRouter.use(standardsRouter);
engineRouter.use(intakeRouter);
engineRouter.use(meetingRecordingsRouter);
engineRouter.use(agendaRouter);
engineRouter.use(correspondenceRouter);
engineRouter.use(timeTrackingRouter);
engineRouter.use(evidenceRouter);
engineRouter.use(buildersRouter);
engineRouter.use(allocationsRouter);
engineRouter.use(classesRouter);
engineRouter.use(schoolRouter);
engineRouter.use(consoleRouter);
router.use("/compass", engineRouter);

// ── Object storage (top-level, self-gated) ──────────────────
// Storage lives outside /compass but is not public: the router authenticates and
// loads the actor itself, and the serving route enforces a DB-backed ACL (an
// object path is only served when it belongs to a recording the actor may read).
router.use(storageRouter);

// ── Authenticated routes ────────────────────────────────────
// Everything below requires a valid session.
router.use(requireAuth);

// ── Impersonation (top-level so the operator can always stop) ──
// Authorization is enforced inside the router (start requires super_admin).
router.use(impersonationRouter);

export default router;
