#!/usr/bin/env node
// Zero-dependency HTTP load generator for the Synops services.
//
// Fires a fixed number of requests at a target URL with bounded concurrency and
// reports throughput, latency percentiles, and the status-code distribution. No
// external dependency so it runs anywhere node does (locally against a booted
// server, or against a staging URL as part of a pre-launch capacity check).
//
// Usage:
//   node scripts/loadtest.mjs <url> [--requests N] [--concurrency C] [--method M]
// Examples:
//   node scripts/loadtest.mjs http://localhost:5099/api/readyz --requests 2000 --concurrency 100
//   node scripts/loadtest.mjs https://<staging-host>/api/healthz -r 5000 -c 200
//
// SLO gate: pass --max-p99 <ms> and/or --max-error-rate <pct> to assert service
// objectives. Exit code is non-zero if any request errored, any response was
// >= 500, or a supplied SLO threshold was breached — so it can gate a pipeline
// or a pre-launch sign-off against agreed numbers.
import http from "node:http";
import https from "node:https";

function arg(names, def) {
  for (const n of names) {
    const i = process.argv.indexOf(n);
    if (i !== -1 && process.argv[i + 1] !== undefined) return process.argv[i + 1];
  }
  return def;
}

const url = process.argv[2];
if (!url || url.startsWith("--")) {
  console.error("usage: node scripts/loadtest.mjs <url> [--requests N] [--concurrency C] [--method M]");
  process.exit(2);
}
const total = Number(arg(["--requests", "-r"], "1000"));
const concurrency = Number(arg(["--concurrency", "-c"], "50"));
const method = arg(["--method", "-m"], "GET");
const maxP99 = arg(["--max-p99"], null);
const maxErrRate = arg(["--max-error-rate"], null);
const target = new URL(url);
const client = target.protocol === "https:" ? https : http;
const agent = new client.Agent({ keepAlive: true, maxSockets: concurrency });

const latencies = [];
const statuses = new Map();
let errors = 0;
let done = 0;
let started = 0;

function once() {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const req = client.request(
      target,
      { method, agent, timeout: 15000 },
      (res) => {
        res.on("data", () => {});
        res.on("end", () => {
          latencies.push(Number(process.hrtime.bigint() - t0) / 1e6);
          statuses.set(res.statusCode, (statuses.get(res.statusCode) ?? 0) + 1);
          resolve();
        });
      },
    );
    req.on("error", () => { errors++; resolve(); });
    req.on("timeout", () => { errors++; req.destroy(); resolve(); });
    req.end();
  });
}

async function worker() {
  while (started < total) {
    started++;
    await once();
    done++;
  }
}

function pct(sorted, p) {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

const wall0 = process.hrtime.bigint();
console.log(`load: ${method} ${url}  requests=${total} concurrency=${concurrency}`);
await Promise.all(Array.from({ length: concurrency }, worker));
const wallMs = Number(process.hrtime.bigint() - wall0) / 1e6;

latencies.sort((a, b) => a - b);
const ok = [...statuses.entries()].filter(([s]) => s < 500).reduce((a, [, n]) => a + n, 0);
const server5xx = [...statuses.entries()].filter(([s]) => s >= 500).reduce((a, [, n]) => a + n, 0);

console.log(`\nrequests:    ${done} in ${wallMs.toFixed(0)}ms`);
console.log(`throughput:  ${(done / (wallMs / 1000)).toFixed(0)} req/s`);
console.log(`latency ms:  p50=${pct(latencies, 50).toFixed(1)} p90=${pct(latencies, 90).toFixed(1)} p99=${pct(latencies, 99).toFixed(1)} max=${(latencies.at(-1) ?? 0).toFixed(1)}`);
console.log(`statuses:    ${[...statuses.entries()].map(([s, n]) => `${s}:${n}`).join("  ") || "(none)"}`);
console.log(`errors:      ${errors}  5xx: ${server5xx}`);

// SLO evaluation.
const p99 = pct(latencies, 99);
const errorRate = done > 0 ? ((errors + server5xx) / done) * 100 : 100;
let failed = errors > 0 || server5xx > 0;
const slo = [];
if (maxP99 !== null) {
  const ok = p99 <= Number(maxP99);
  slo.push(`p99 ${p99.toFixed(1)}ms <= ${maxP99}ms: ${ok ? "PASS" : "FAIL"}`);
  if (!ok) failed = true;
}
if (maxErrRate !== null) {
  const ok = errorRate <= Number(maxErrRate);
  slo.push(`error-rate ${errorRate.toFixed(2)}% <= ${maxErrRate}%: ${ok ? "PASS" : "FAIL"}`);
  if (!ok) failed = true;
}
if (slo.length) console.log(`SLO:         ${slo.join("  |  ")}`);
console.log(`result:      ${failed ? "FAIL" : "PASS"}`);

process.exit(failed ? 1 : 0);
