import type { Request, Response, NextFunction } from "express";

interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>();

export function rateLimit(opts: { windowMs: number; max: number; key?: (req: Request) => string }) {
  const keyFn = opts.key ?? ((req: Request) => req.ip ?? "anon");
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `${req.baseUrl}${req.path}:${keyFn(req)}`;
    const b = buckets.get(key);
    if (!b || now > b.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      next();
      return;
    }
    if (b.count >= opts.max) {
      res.status(429).json({ error: "Too many requests. Please try again in a few minutes." });
      return;
    }
    b.count += 1;
    next();
  };
}

// Like rateLimit, but only throttles mutating requests (POST/PUT/PATCH/DELETE);
// reads (GET/HEAD/OPTIONS) always pass through. Use this at the mount point of
// the expensive AI-generation routers so a runaway loop or abusive client can't
// rack up unbounded model cost, while normal page reads stay unthrottled.
export function writeRateLimit(opts: { windowMs: number; max: number; key?: (req: Request) => string }) {
  const limiter = rateLimit(opts);
  return (req: Request, res: Response, next: NextFunction) => {
    const m = req.method.toUpperCase();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") { next(); return; }
    limiter(req, res, next);
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now > b.resetAt) buckets.delete(k);
}, 5 * 60 * 1000).unref?.();
