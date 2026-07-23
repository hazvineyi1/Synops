#!/usr/bin/env node
// Pre-deploy readiness check. Validates that the environment a service is about
// to boot with actually has the variables that service requires, and optionally
// that its database is reachable. Run it in a release pipeline BEFORE starting
// the server so a misconfiguration fails fast with a clear report instead of a
// crash-loop (each server already fail-fasts at boot; this surfaces the same
// gaps earlier, for all services at once, and can check DB reachability too).
//
// Usage:
//   node scripts/preflight.mjs <service|all> [--check-db]
//   node scripts/preflight.mjs coach
//   node scripts/preflight.mjs all --check-db
//
// Services: coach, kanon, paideia, praxis, all
// Exit code 0 when every REQUIRED variable (and every all-or-nothing OPTIONAL
// group) for the selected service(s) is satisfied; 1 otherwise. Optional
// integrations that are simply unset are reported as notes, never failures —
// they degrade gracefully at runtime by design.
//
// The manifests mirror each service's own config/.env.example (the source of
// truth is the server's boot-time validation; keep this in sync with it).
import net from "node:net";

// group: an all-or-nothing OPTIONAL cluster. Setting any member requires all.
const SERVICES = {
  coach: {
    label: "The Coach (artifacts/api-server)",
    required: ["DATABASE_URL", "ANTHROPIC_API_KEY", "CLERK_SECRET_KEY", "CLERK_PUBLISHABLE_KEY", "PORT"],
    buildTime: ["VITE_CLERK_PUBLISHABLE_KEY"],
    groups: {
      Stripe: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_MONTHLY", "STRIPE_PRICE_YEARLY"],
      Flutterwave: ["FLW_SECRET_KEY", "FLW_WEBHOOK_HASH"],
    },
    optional: ["ALLOWED_ORIGINS", "APP_URL", "ADMIN_EMAILS", "SENTRY_DSN", "LOG_LEVEL"],
  },
  kanon: {
    label: "Kanon (artifacts/kanon-api)",
    required: ["DATABASE_URL", "SESSION_SECRET", "PORT"],
    buildTime: [],
    groups: {
      Stripe: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    },
    optional: ["ALLOWED_ORIGINS", "SENTRY_DSN", "LOG_LEVEL"],
  },
  paideia: {
    label: "Paideia (artifacts/paideia-api)",
    required: ["DATABASE_URL", "PORT", "AI_INTEGRATIONS_OPENAI_BASE_URL", "AI_INTEGRATIONS_OPENAI_API_KEY"],
    buildTime: [],
    groups: {
      // The embedded Compass builder mount stays dormant unless BOTH are set.
      "Compass builder mount": ["SESSION_SECRET", "COMPASS_DATABASE_URL"],
    },
    optional: ["SENTRY_DSN", "RESEND_API_KEY", "EMAIL_FROM", "LOG_LEVEL"],
  },
  praxis: {
    label: "Synops Praxis (praxis/artifacts/api-server)",
    required: ["DATABASE_URL", "SESSION_SECRET", "PORT"],
    buildTime: [],
    groups: {},
    optional: ["ANTHROPIC_API_KEY", "SENTRY_DSN", "RESEND_API_KEY", "EMAIL_FROM", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LOG_LEVEL"],
  },
};

const has = (name) => {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
};

// TCP reachability probe for DATABASE_URL (host:port), no driver dependency.
function checkDbReachable(urlStr, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(urlStr);
    } catch {
      resolve({ ok: false, reason: "DATABASE_URL is not a valid URL" });
      return;
    }
    const host = url.hostname;
    const port = Number(url.port || 5432);
    if (!host) {
      resolve({ ok: false, reason: "DATABASE_URL has no host" });
      return;
    }
    const socket = new net.Socket();
    const done = (ok, reason) => {
      socket.destroy();
      resolve({ ok, reason, host, port });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false, `timed out connecting to ${host}:${port}`));
    socket.once("error", (err) => done(false, `${err.code || err.message} connecting to ${host}:${port}`));
    socket.connect(port, host);
  });
}

function validateService(key, svc, checkDb) {
  const problems = [];
  const notes = [];

  const missing = svc.required.filter((n) => !has(n));
  if (missing.length) problems.push(`missing REQUIRED: ${missing.join(", ")}`);

  const missingBuild = (svc.buildTime || []).filter((n) => !has(n));
  if (missingBuild.length) {
    notes.push(`build-time vars not set here (must be present when the frontend is BUILT): ${missingBuild.join(", ")}`);
  }

  for (const [name, keys] of Object.entries(svc.groups || {})) {
    const set = keys.filter(has);
    if (set.length === 0) {
      notes.push(`${name}: not configured (feature disabled — OK)`);
    } else if (set.length === keys.length) {
      notes.push(`${name}: configured`);
    } else {
      problems.push(`${name}: partially configured — set all or none. Missing: ${keys.filter((k) => !has(k)).join(", ")}`);
    }
  }

  const optSet = (svc.optional || []).filter(has);
  if (optSet.length) notes.push(`optional set: ${optSet.join(", ")}`);

  return { key, label: svc.label, problems, notes };
}

async function main() {
  const args = process.argv.slice(2);
  const checkDb = args.includes("--check-db");
  const target = (args.find((a) => !a.startsWith("--")) || "all").toLowerCase();

  const keys = target === "all" ? Object.keys(SERVICES) : [target];
  if (keys.some((k) => !SERVICES[k])) {
    console.error(`Unknown service "${target}". Use one of: ${Object.keys(SERVICES).join(", ")}, all`);
    process.exit(2);
  }

  let failed = false;
  console.log(`\nPreflight readiness check — ${target === "all" ? "all services" : SERVICES[target].label}\n`);

  for (const k of keys) {
    const r = validateService(k, SERVICES[k], checkDb);
    const status = r.problems.length ? "FAIL" : "OK";
    console.log(`[${status}] ${r.label}`);
    for (const p of r.problems) console.log(`   x ${p}`);
    for (const n of r.notes) console.log(`   - ${n}`);
    if (r.problems.length) failed = true;
    console.log("");
  }

  if (checkDb && has("DATABASE_URL")) {
    const db = await checkDbReachable(process.env.DATABASE_URL);
    if (db.ok) {
      console.log(`[OK] database reachable at ${db.host}:${db.port}`);
    } else {
      console.log(`[FAIL] database: ${db.reason}`);
      failed = true;
    }
    console.log("");
  } else if (checkDb) {
    console.log("[skip] --check-db requested but DATABASE_URL is not set\n");
  }

  console.log(failed
    ? "Preflight FAILED — resolve the items above before deploying."
    : "Preflight passed — required configuration is present.");
  process.exit(failed ? 1 : 0);
}

main();
