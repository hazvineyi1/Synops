import { Router } from "express";
import { logger } from "../lib/logger";

/**
 * True picture-word "cut-outs" for the young reader lessons.
 *
 * Serves a transparent-background PNG of an early-reader noun (cat, dog, sun, hat) at
 * `/api/kid-cutout/:key.png`. The background is removed once via remove.bg (server-side, using the
 * REMOVEBG_API_KEY env var) and cached in memory, so the browser only ever sees a same-origin PNG.
 *
 * IMPORTANT: REMOVEBG_API_KEY must be set as an env var on the praxis-api Railway service (and the
 * remove.bg account must have quota). Without it, backgrounds are NOT removed, every key 302-redirects
 * to the full source photo (still a real photo, just with its background). Setting the key upgrades the
 * images to cut-outs automatically on next load (the fallback is served no-store), no redeploy needed.
 *
 * Safety: only the fixed whitelist below can be fetched (no arbitrary URL → no SSRF).
 * Graceful fallback: if no API key is set, or remove.bg fails, we 302 to the original photo so the
 * pictures still render (as normal photos) instead of breaking.
 */
const router = Router();

// Source photos (same set as the frontend kidPictures map). Whitelisted, nothing else is fetchable.
const S = (id: string) => `https://images.unsplash.com/photo-${id}?w=600&h=600&fit=crop&crop=entropy&auto=format&q=80`;
const KID_SRC: Record<string, string> = {
  cat: S("1514888286974-6c03e2ca1dba"),
  dog: S("1530281700549-e82e7bf110d6"),
  sun: S("1563630381190-77c336ea545a"),
  hat: S("1588850561407-ed78c282e89b"),
  apple: S("1568702846914-96b305d2aaeb"),
  ball: S("1498940757830-82f7813bf178"),
  fish: S("1522069169874-c58ec4b76be5"),
  tree: S("1502082553048-f009c37129b9"),
  // Topical objects so EVERY subject (not just reading) shows a real background-removed photo.
  flag: S("1626836014893-37663794dca7"),    // US flag, civics / government
  gavel: S("1676181739859-08330dea8999"),   // gavel, civics / law
  book: S("1527176930608-09cb256ab504"),     // single open book on white, reading / history / writing
  pencil: S("1595584354232-f07d525d87c1"),   // pencil, writing / math
  globe: S("1593632717071-218c1d85c663"),    // desk globe on light bg, world history / civilizations
};

const cache = new Map<string, Buffer>();

router.get("/kid-cutout/:key", async (req, res) => {
  const key = (req.params.key || "").replace(/\.png$/i, "").toLowerCase();
  const src = KID_SRC[key];
  if (!src) { res.status(404).end(); return; }

  // Serve the cached cut-out if we already made it.
  const hit = cache.get(key);
  if (hit) {
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(hit);
    return;
  }

  const apiKey = process.env["REMOVEBG_API_KEY"];
  // No key yet → show the normal photo (don't cache, so it upgrades to a cut-out once the key is set).
  if (!apiKey) {
    res.setHeader("Cache-Control", "no-store");
    res.redirect(302, src);
    return;
  }

  try {
    const body = new URLSearchParams({ image_url: src, size: "preview", format: "png" });
    const r = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": apiKey, "Content-Type": "application/x-www-form-urlencoded", Accept: "image/png" },
      body,
    });
    if (!r.ok) {
      logger.warn({ key, status: r.status }, "remove.bg failed; falling back to original photo");
      res.setHeader("Cache-Control", "no-store");
      res.redirect(302, src);
      return;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    cache.set(key, buf);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(buf);
  } catch (err) {
    logger.warn({ err, key }, "kid-cutout error; falling back to original photo");
    res.setHeader("Cache-Control", "no-store");
    res.redirect(302, src);
  }
});

export default router;
