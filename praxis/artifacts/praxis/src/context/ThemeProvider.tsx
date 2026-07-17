import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/context/SessionContext";

/**
 * App-wide white-label theming. Fetches the caller's tenant brand theme and applies it to the
 * whole app at runtime: the shadcn --primary/--ring CSS variables (so buttons, links, focus and
 * active states recolor), raw --brand-* variables, the document title, favicon and font. This is
 * what turns per-tenant branding from "one page" into a real skin.
 */

export interface BrandTheme {
  displayName: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  fontFamily: string | null;
  credentialTitle: string | null;
  emailSenderName: string | null;
  customDomain: string | null;
}

/** Shared brand-theme query (react-query dedupes across consumers). */
export function useBrandTheme() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["brand-theme"],
    queryFn: () => apiFetch<BrandTheme>("/brand/theme"),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Public branding resolved from the current hostname. Only runs when signed out — on a partner's
 * custom domain this themes the login/marketing pages before any session exists. On the app's own
 * domain the endpoint returns the platform default, so nothing changes.
 */
export function usePublicBrandByHost() {
  const { user } = useSession();
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  return useQuery({
    queryKey: ["brand-public", host],
    queryFn: () => apiFetch<Partial<BrandTheme>>(`/brand/public?host=${encodeURIComponent(host)}`),
    enabled: !user,
    staleTime: 10 * 60 * 1000,
  });
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hue = 0;
  let sat = 0;
  const lum = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    sat = lum > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hue = (g - b) / d + (g < b ? 6 : 0); break;
      case g: hue = (b - r) / d + 2; break;
      default: hue = (r - g) / d + 4;
    }
    hue /= 6;
  }
  return { h: Math.round(hue * 360), s: Math.round(sat * 100), l: Math.round(lum * 100) };
}

/** Side-effect-only component: applies the current tenant theme to the document. Renders nothing. */
export function ThemeApplier() {
  const { user } = useSession();
  const { data: authed } = useBrandTheme();
  const { data: publik } = usePublicBrandByHost();
  // Signed in → the caller's tenant theme. Signed out → branding resolved from the hostname
  // (custom domains), so a partner's login page carries their identity too.
  const theme = (user ? authed : publik) as Partial<BrandTheme> | undefined;

  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;

    if (theme.primaryColor) {
      const hsl = hexToHsl(theme.primaryColor);
      if (hsl) {
        const triple = `${hsl.h} ${hsl.s}% ${hsl.l}%`;
        root.style.setProperty("--primary", triple);
        root.style.setProperty("--ring", triple);
        // Contrast: dark text on a light primary, white text on a dark one.
        root.style.setProperty("--primary-foreground", hsl.l > 62 ? "222 47% 11%" : "0 0% 100%");
      }
      root.style.setProperty("--brand-primary", theme.primaryColor);
    }
    if (theme.secondaryColor) root.style.setProperty("--brand-secondary", theme.secondaryColor);
    if (theme.accentColor) root.style.setProperty("--brand-accent", theme.accentColor);
    if (theme.fontFamily) document.body.style.fontFamily = theme.fontFamily;
    if (theme.displayName) document.title = theme.displayName;
    if (theme.faviconUrl) {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = theme.faviconUrl;
    }

    // PWA/browser chrome: colour the address bar + installed title bar, and the iOS home-screen
    // app name, to match the tenant. (The manifest itself is resolved by hostname server-side.)
    const setMeta = (name: string, content: string) => {
      let m = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      if (!m) {
        m = document.createElement("meta");
        m.name = name;
        document.head.appendChild(m);
      }
      m.content = content;
    };
    if (theme.primaryColor) setMeta("theme-color", theme.primaryColor);
    if (theme.displayName) setMeta("apple-mobile-web-app-title", theme.displayName);
  }, [theme]);

  return null;
}
