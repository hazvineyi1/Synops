import express, { type Express, type RequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/kanon-db";
import router from "./routes";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./lib/logger";
import { handleStripeWebhook } from "./lib/stripeWebhook";

const app: Express = express();

app.set("trust proxy", 1);

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
app.use(cors());

app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), handleStripeWebhook);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set for session management.");
}

const PgSession = connectPgSimple(session);

app.use(
    session({
          name: "sid",
          store: new PgSession({
                  pool,
                  tableName: "user_sessions",
          }),
          secret: process.env.SESSION_SECRET,
          resave: false,
          saveUninitialized: false,
          rolling: true,
          cookie: {
                  httpOnly: true,
                  sameSite: "lax",
                  secure: process.env.NODE_ENV === "production",
                  maxAge: 1000 * 60 * 60 * 24 * 7,
          },
    }),
  );

const sameOriginGuard: RequestHandler = (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
          next();
          return;
    }
    const origin = req.get("origin");
    if (!origin) {
          next();
          return;
    }
    try {
          const originHost = new URL(origin).host;
          const host = req.get("host");
          const allowed = (process.env.ALLOWED_ORIGINS ?? process.env.REPLIT_DOMAINS ?? "")
            .split(",")
            .map((d) => d.trim())
            .filter(Boolean);
          if (originHost === host || allowed.includes(originHost)) {
                  next();
                  return;
          }
          req.log.warn({ origin, host }, "Blocked cross-origin mutating request");
          res.status(403).json({ error: "Cross-origin request blocked" });
    } catch {
          res.status(403).json({ error: "Invalid origin" });
    }
};
app.use(sameOriginGuard);

app.use("/api", router);

if (process.env.NODE_ENV === "production") {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const clientDir =
          process.env.CLIENT_DIST_DIR ||
          path.resolve(here, "../../kanon/dist/public");
    app.use(express.static(clientDir));
    app.use((req, res, next) => {
          if (req.method !== "GET" || req.path.startsWith("/api")) {
                  next();
                  return;
          }
          res.sendFile(path.join(clientDir, "index.html"));
    });
    logger.info({ clientDir }, "Serving built frontend (production)");
}

export default app;
