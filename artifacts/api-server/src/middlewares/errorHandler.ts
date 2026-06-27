import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";
import { isProduction } from "../lib/config";

/** JSON 404 for unmatched API routes (keeps the SPA fallback for everything else). */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
}

function statusFromError(err: unknown): number {
  if (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  ) {
    return (err as { status: number }).status;
  }
  return 500;
}

/**
 * Final Express error handler. Logs the error with request context and returns
 * a sanitised JSON body. Internal (5xx) error messages are hidden in production
 * to avoid leaking implementation details; client (4xx) messages are surfaced.
 *
 * The unused `next` parameter is required for Express to recognise this as an
 * error-handling middleware (it is identified by arity of 4).
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const status = statusFromError(err);

  logger.error(
    { err, method: req.method, url: req.url?.split("?")[0], status },
    "Request failed",
  );

  if (res.headersSent) return;

  const message =
    status < 500
      ? err instanceof Error
        ? err.message
        : "Request error"
      : isProduction
        ? "Internal server error"
        : err instanceof Error
          ? err.message
          : "Internal server error";

  res.status(status).json({ error: message });
}
