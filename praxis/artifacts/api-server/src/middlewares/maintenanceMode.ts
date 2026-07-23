import type { Request, Response, NextFunction } from "express";

/**
 * Maintenance / read-only mode for the region cutover (and any other window
 * where writes must be frozen).
 *
 * When MAINTENANCE_MODE is truthy:
 *   - every response carries `X-Maintenance-Mode: 1` so the SPA can show a banner;
 *   - mutating requests (POST/PUT/PATCH/DELETE) are rejected with 503 so no new
 *     writes land while the database is being dumped/restored;
 *   - reads (GET/HEAD) and the health/version/readyz probes keep working, so
 *     monitoring and the cutover checks still pass.
 *
 * Off by default: with the env unset this is a no-op.
 */
export function maintenanceEnabled(): boolean {
  const v = process.env.MAINTENANCE_MODE;
  return v === "1" || v === "true" || v === "yes";
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function maintenanceMode(req: Request, res: Response, next: NextFunction): void {
  if (!maintenanceEnabled()) {
    next();
    return;
  }
  res.setHeader("X-Maintenance-Mode", "1");
  if (MUTATING.has(req.method)) {
    res.status(503).json({
      error: "maintenance_mode",
      message:
        "Synops is in scheduled maintenance and is temporarily read-only. Please try again shortly.",
    });
    return;
  }
  next();
}
