import type { Request, Response, NextFunction } from "express";

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  /** Return true to skip rate limiting for a given request (e.g. GETs). */
  skip?: (req: Request) => boolean;
}

interface Counter {
  count: number;
  resetAt: number;
}

/**
 * Minimal in-memory fixed-window rate limiter. No external dependency and no
 * shared store, so limits are enforced per-process: under multi-instance
 * autoscaling each instance keeps its own window. That is an intentional
 * baseline. If you need globally exact limits, move the counter to a shared
 * store (e.g. Redis). Correct client IPs require `app.set("trust proxy", ...)`.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    message = "Too many requests, please try again later.",
    skip,
  } = options;
  const hits = new Map<string, Counter>();

  // Periodically drop expired counters so the map does not grow unbounded.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, counter] of hits) {
      if (counter.resetAt <= now) hits.delete(key);
    }
  }, windowMs);
  // Do not keep the process alive solely for this timer.
  sweep.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    if (skip && skip(req)) {
      next();
      return;
    }

    const now = Date.now();
    const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
    let counter = hits.get(key);
    if (!counter || counter.resetAt <= now) {
      counter = { count: 0, resetAt: now + windowMs };
      hits.set(key, counter);
    }
    counter.count += 1;

    const remaining = Math.max(0, max - counter.count);
    const resetSeconds = Math.ceil((counter.resetAt - now) / 1000);
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(resetSeconds));

    if (counter.count > max) {
      res.setHeader("Retry-After", String(resetSeconds));
      res.status(429).json({ error: message });
      return;
    }

    next();
  };
}

/** Broad cap across the whole API as a denial-of-service backstop. */
export const globalLimiter = createRateLimiter({ windowMs: 60_000, max: 600 });

/**
 * Tighter cap for the expensive Anthropic-backed write endpoints (sending
 * messages, ingesting material). Reads (GET) are left to the global limiter.
 */
export const aiLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 30,
  skip: (req) => req.method === "GET",
  message:
    "You're sending requests too quickly. Please wait a moment and try again.",
});

/** Strict cap for the unauthenticated test-login endpoint. */
export const authLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 10,
  message: "Too many attempts. Please wait a minute and try again.",
});
