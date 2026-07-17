import type { Express } from "express";
import { resolvePublicBrandByHost } from "./lib/brandResolve";

/**
 * Branded PWA: a dynamic web manifest + app icon resolved from the request hostname, so installing
 * the app ("Add to Home Screen") on a partner's custom domain uses that partner's name, colour and
 * icon — not "Synops Praxis". These live at the site root (not under /api) because the browser
 * fetches /manifest.webmanifest and the icon from the page origin, and must be registered before
 * the SPA catch-all so they aren't swallowed by index.html.
 */

/** Black/white text for legibility on a hex background. */
function contrastInk(hex: string): string {
  const h = (hex || "").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length !== 6 || /[^0-9a-f]/i.test(full)) return "#ffffff";
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#14231f" : "#ffffff";
}

/** First letter of the brand name, sanitised for embedding in SVG/text. */
function initial(name: string): string {
  const c = (name || "S").trim().charAt(0).toUpperCase();
  return /[A-Z0-9]/.test(c) ? c : "S";
}

export function registerPwa(app: Express) {
  app.get("/manifest.webmanifest", async (req, res) => {
    const brand = await resolvePublicBrandByHost(req.headers.host);
    const name = brand.displayName || "Synops Praxis";
    const shortName = name.length > 12 ? name.slice(0, 12).trim() : name;

    const icons: Array<{ src: string; sizes: string; type: string; purpose: string }> = [
      { src: "/pwa-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
    ];
    // If the tenant logo is a raster image, offer it as an installable icon too (some
    // platforms prefer a real bitmap). The generated SVG glyph is always the safe fallback.
    if (brand.logoUrl && /\.(png|jpe?g)(\?|#|$)/i.test(brand.logoUrl)) {
      icons.push({
        src: brand.logoUrl,
        sizes: "512x512",
        type: /\.png(\?|#|$)/i.test(brand.logoUrl) ? "image/png" : "image/jpeg",
        purpose: "any",
      });
    }

    const manifest = {
      name,
      short_name: shortName,
      description: `${name} — learning platform`,
      start_url: "/dashboard",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#ffffff",
      theme_color: brand.primaryColor || "#1a1f36",
      icons,
    };
    res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(JSON.stringify(manifest));
  });

  app.get("/pwa-icon.svg", async (req, res) => {
    const brand = await resolvePublicBrandByHost(req.headers.host);
    const primary = brand.primaryColor || "#1a1f36";
    const ink = contrastInk(primary);
    const letter = initial(brand.displayName || "Synops");
    // Full-bleed square (the OS applies its own mask on maskable); glyph kept within the
    // centre safe zone so it survives circular/rounded masks.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="${primary}"/><text x="256" y="352" font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif" font-size="260" font-weight="700" fill="${ink}" text-anchor="middle">${letter}</text></svg>`;
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(svg);
  });
}
