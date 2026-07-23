# Multi-Region and Failover

How to run the Synops services across more than one region, and what is already
in place versus what an operator provisions. The application is built to be
region-portable; the topology itself is an infrastructure decision made when the
business needs it.

## What the application already provides (no code changes needed)

- **Stateless app tier.** The API/SPA containers hold no local state: sessions
  live in Postgres or Clerk, uploads in object storage, rate-limit counters are
  per-instance and advisory. Any instance in any region can serve any request.
- **Health and readiness probes.** `/api/healthz` (liveness, DB-free) and
  `/api/readyz` (DB-backed, 503 when the DB is unreachable) are exactly the
  signals a global load balancer or health-checked DNS needs to route away from a
  degraded region. Probes are exempt from rate limiting so a spike never trips
  them.
- **Region-aware identity.** `/api/version` reports `region` and `instanceId`
  (from `RAILWAY_REPLICA_REGION`/`REGION` and `RAILWAY_REPLICA_ID`/`HOSTNAME`),
  so during a split or failover you can tell which region and replica answered a
  request — the first thing you need when debugging cross-region behaviour.
- **Graceful shutdown.** SIGTERM/SIGINT drain in-flight requests, so shifting
  traffic between regions (or draining a region) does not sever live connections.
- **Fail-fast config.** Every service validates required env at boot, so a
  mis-provisioned region fails immediately and visibly instead of serving errors.

## Topologies

Pick based on the recovery objective and budget:

1. **Active–passive (simplest, recommended first step).** One primary region
   serves all traffic; a standby region runs the app against a read replica of
   the primary database. Failover = promote the replica to primary and point the
   app/DNS at the standby. RTO minutes, RPO ≈ replica lag.
2. **Active–active reads, single-writer.** Both regions serve traffic; each app
   tier talks to a regional read replica for reads and the single primary for
   writes. Lower read latency globally; writes still cross to the primary region.
3. **Active–active multi-writer.** Requires a multi-primary/distributed database
   and conflict handling. Highest availability, highest complexity — only worth
   it at scale with a data layer built for it.

## What the operator provisions (the infrastructure decision)

- **Database replication.** A cross-region read replica (topologies 1–2) or a
  distributed database (topology 3). This is the crux: the app is stateless, so
  multi-region availability is really *database* availability. Choose a managed
  Postgres that offers cross-region replicas and automated promotion.
- **Global traffic routing.** Health-checked DNS (e.g. Route 53 health checks,
  Cloudflare load balancing) or a global load balancer, pointed at each region's
  `/api/readyz`, with a failover or latency/geo policy.
- **Per-region service instances.** Deploy the same image in each region with
  that region's `DATABASE_URL` (regional replica/endpoint) and set `REGION` (or
  rely on the platform's injected region var) so `/version` is accurate.
- **Secrets in every region.** The same env vars (see the `.env*.example` files)
  must be present in each region.

## Failover runbook (active–passive)

1. Detect: the primary region's `/api/readyz` is failing / DNS health check is
   red.
2. Promote the standby region's database replica to primary (managed-DB console
   or CLI).
3. Point the standby app tier's `DATABASE_URL` at the promoted primary and
   confirm `/api/readyz` is green there.
4. Shift DNS/global-LB to the standby region; confirm `/api/version` reports the
   standby `region`.
5. After the incident, rebuild the failed region as the new standby and
   re-replicate.

## Validation before relying on it

- Practise the failover in staging (promote a replica, cut traffic over, confirm
  `/version` region flips and reads/writes work) — the same discipline as the
  disaster-recovery restore drill in OPERATIONS.md.
- Run `scripts/loadtest.mjs` against each region's `/api/readyz` to confirm each
  meets the SLO independently.
