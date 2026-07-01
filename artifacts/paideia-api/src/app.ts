import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { loadTeacher } from "./middlewares/auth.js";
import { getStripeSync } from "./lib/stripeClient.js";
import { syncTeacherFromCustomer } from "./lib/stripeSync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reactBuildPath = path.resolve(__dirname, "../../paideia-ren/dist/public");

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    origin: process.env["NODE_ENV"] === "production"
      ? undefined
      : ["http://localhost:25565", "http://localhost:5173", "http://localhost:3000"],
    credentials: true,
  }),
);
app.use(cookieParser());

// Stripe webhook must receive the raw body and be registered BEFORE
// express.json(). The handler keeps logic minimal: hand off to
// stripe-replit-sync, then reflect subscription state onto the teacher row.
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) { res.status(400).json({ error: "Missing signature" }); return; }
    const sig = Array.isArray(signature) ? signature[0]! : signature;
    try {
      const sync = await getStripeSync();
      const event = await sync.processWebhook(req.body as Buffer, sig);
      const customerId = event?.data?.object?.customer;
      if (typeof customerId === "string" && customerId.length > 0) {
        await syncTeacherFromCustomer(customerId);
        // Also reflect Stripe state onto study learners (card auto-renew).
        const { activateStudyStripeFromCustomer, getStudyUserIdByStripeCustomer } =
          await import("./lib/billing/service.js");
        await activateStudyStripeFromCustomer(customerId);

        // Ambassador residuals: credit on each cleared invoice (initial + renewal),
        // claw back on refund / dispute. Best-effort: never break the webhook.
        try {
          if (!event) throw new Error("missing event");
          const obj = event.data.object as Record<string, unknown>;
          const { safeCreditCommission, clawbackBySourcePayment } = await import(
            "./lib/billing/ambassador.js"
          );
          if (event.type === "invoice.payment_succeeded") {
            const amountPaid = Number(obj["amount_paid"] ?? 0);
            const invoiceId = typeof obj["id"] === "string" ? (obj["id"] as string) : null;
            const currency =
              typeof obj["currency"] === "string"
                ? (obj["currency"] as string).toUpperCase()
                : "USD";
            const studyUserId = await getStudyUserIdByStripeCustomer(customerId);
            if (studyUserId && invoiceId && amountPaid > 0) {
              await safeCreditCommission({
                customerId: studyUserId,
                sourceKind: "stripe",
                sourcePaymentId: invoiceId,
                grossMinor: amountPaid,
                currency,
                paidAt: new Date(),
              });
            }
          } else if (event.type === "charge.refunded") {
            // The event object is a charge, which carries the invoice id directly.
            const invoiceId = typeof obj["invoice"] === "string" ? (obj["invoice"] as string) : null;
            if (invoiceId) {
              await clawbackBySourcePayment("stripe", invoiceId, `stripe ${event.type}`);
            }
          } else if (event.type === "charge.dispute.created") {
            // The event object is a dispute, which does NOT expose `invoice`.
            // Resolve the underlying charge first, then read its invoice id so the
            // clawback targets the same source payment that minted the commission.
            let invoiceId: string | null =
              typeof obj["invoice"] === "string" ? (obj["invoice"] as string) : null;
            const chargeId = typeof obj["charge"] === "string" ? (obj["charge"] as string) : null;
            if (!invoiceId && chargeId) {
              try {
                const { getUncachableStripeClient } = await import("./lib/stripeClient.js");
                const stripe = await getUncachableStripeClient();
                const charge = (await stripe.charges.retrieve(chargeId)) as unknown as Record<
                  string,
                  unknown
                >;
                invoiceId = typeof charge["invoice"] === "string" ? (charge["invoice"] as string) : null;
              } catch (lookupErr) {
                logger.error({ err: lookupErr, chargeId }, "dispute charge lookup failed");
              }
            }
            if (invoiceId) {
              await clawbackBySourcePayment("stripe", invoiceId, `stripe ${event.type}`);
            }
          }
        } catch (err) {
          logger.error({ err }, "ambassador commission hook failed");
        }
      }
      res.status(200).json({ received: true });
    } catch (err) {
      logger.error({ err }, "stripe webhook failed");
      res.status(400).json({ error: "Webhook handling failed" });
    }
  },
);

// Mobile-money webhooks (Paynow result URL, Flutterwave). These must be raw and
// registered BEFORE express.json(). We never trust the posted body for money
// state: we look the payment up by reference and re-confirm with the gateway
// before activating.
app.post(
  "/api/study/billing/webhook/paynow",
  express.raw({ type: "*/*" }),
  async (req, res) => {
    try {
      const body = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
      const params = new URLSearchParams(body);
      const reference = params.get("reference") ?? "";
      const { getPaymentByReference, activatePayment, markPaymentFailed } = await import(
        "./lib/billing/service.js"
      );
      const { getProviderById } = await import("./lib/billing/providers/index.js");
      const payment = reference ? await getPaymentByReference(reference) : null;
      if (payment && payment.status === "pending") {
        const provider = getProviderById(payment.provider);
        const result = await provider.checkStatus({
          reference: payment.reference,
          providerRef: payment.providerRef,
          pollUrl: payment.pollUrl,
        });
        if (result.status === "paid") await activatePayment(payment.reference, result.raw);
        else if (result.status === "failed") await markPaymentFailed(payment.reference, result.raw);
      }
      res.status(200).send("ok");
    } catch (err) {
      logger.error({ err }, "paynow webhook failed");
      res.status(200).send("ok");
    }
  },
);

app.post(
  "/api/study/billing/webhook/flutterwave",
  express.raw({ type: "*/*" }),
  async (req, res) => {
    try {
      const expected = process.env["FLUTTERWAVE_SECRET_HASH"];
      const signature = req.headers["verif-hash"];
      // Fail closed: in production, refuse unsigned webhooks (missing hash means
      // the gateway is misconfigured, so we must not accept forgeable posts).
      if (!expected) {
        if (process.env["NODE_ENV"] === "production") {
          logger.error("flutterwave webhook rejected: FLUTTERWAVE_SECRET_HASH not set");
          res.status(401).send("webhook not configured");
          return;
        }
      } else if (signature !== expected) {
        res.status(401).send("invalid signature");
        return;
      }
      const body = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "{}";
      const event = JSON.parse(body) as { data?: { tx_ref?: string } };
      const reference = event.data?.tx_ref ?? "";
      const { getPaymentByReference, activatePayment, markPaymentFailed } = await import(
        "./lib/billing/service.js"
      );
      const { getProviderById } = await import("./lib/billing/providers/index.js");
      const payment = reference ? await getPaymentByReference(reference) : null;
      if (payment && payment.status === "pending") {
        const provider = getProviderById(payment.provider);
        const result = await provider.checkStatus({
          reference: payment.reference,
          providerRef: payment.providerRef,
          pollUrl: payment.pollUrl,
        });
        if (result.status === "paid") await activatePayment(payment.reference, result.raw);
        else if (result.status === "failed") await markPaymentFailed(payment.reference, result.raw);
      }
      res.status(200).send("ok");
    } catch (err) {
      logger.error({ err }, "flutterwave webhook failed");
      res.status(200).send("ok");
    }
  },
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(loadTeacher);

app.use("/api", router);

// Host-based routing for the Coach's own domain (e.g. synopscoach.com).
// All apps live behind one deployment and are routed by path on the primary
// domain (marketing at "/", Coach at "/study/"). Custom domains all hit this
// same server, so when a request arrives on a Coach domain we send the visitor
// straight into the Coach app (served at "/study/") instead of the marketing
// site - they never see marketing. The Coach is built with base "/study/", so
// redirecting (rather than serving its HTML at root) keeps asset and SPA-router
// paths correct. Override the domain list with the COACH_HOSTS env var.
const coachHosts = new Set(
  (process.env["COACH_HOSTS"] ?? "synopscoach.com,www.synopscoach.com")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
);
app.use((req, res, next) => {
  const forwarded = req.headers["x-forwarded-host"];
  const rawHost =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded) ||
    req.headers.host ||
    "";
  const host = rawHost.toString().toLowerCase().split(":")[0];
  if (!coachHosts.has(host)) {
    next();
    return;
  }

  const p = req.path;
  // The shared API is served on every host - let it through untouched. Match
  // only the real "/api" segment, not look-alikes like "/apiary".
  if (p === "/api" || p.startsWith("/api/")) {
    next();
    return;
  }
  // Requests already inside the Coach app (served by the "/study/" path router)
  // are left alone. Use the trailing slash so look-alikes like "/studyfoo" are
  // NOT treated as Coach routes - they must be redirected, or they would fall
  // through to the marketing catch-all and leak marketing on the Coach domain.
  if (p.startsWith("/study/")) {
    next();
    return;
  }

  // Everything else on a Coach host goes into the Coach app at "/study/".
  // Bare "/" and "/study" canonicalize to "/study/"; other paths keep their
  // sub-path (e.g. "/coach" -> "/study/coach").
  const queryIndex = req.originalUrl.indexOf("?");
  const search = queryIndex === -1 ? "" : req.originalUrl.slice(queryIndex);
  const target =
    p === "/" || p === "/study" ? "/study/" + search : "/study" + p + search;
  res.redirect(302, target);
});

app.use(express.static(reactBuildPath));
// SPA fallback, per sub-app. Each frontend is a separate single-page app served
// under its own base path (Coach at /study/, teacher at /app/, marketing at /).
// A hard load or refresh of a deep client-route (e.g. /study/admin) has no matching
// static file, so serve the correct sub-app's index.html instead of always falling
// back to the marketing app (which would 404 on Coach/teacher routes).
app.get(/^(?!\/api).*/, (req, res) => {
  const p = req.path;
  if (p === "/study" || p.startsWith("/study/")) {
    res.sendFile(path.join(reactBuildPath, "study", "index.html"));
  } else if (p === "/app" || p.startsWith("/app/")) {
    res.sendFile(path.join(reactBuildPath, "app", "index.html"));
  } else {
    res.sendFile(path.join(reactBuildPath, "index.html"));
  }
});

export default app;
