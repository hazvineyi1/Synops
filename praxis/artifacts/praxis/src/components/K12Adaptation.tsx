import { useEffect } from "react";
import { useSession } from "@/context/SessionContext";
import { personaByEmail, BAND_THEME } from "@/lib/k12Personas";

/**
 * Applies each K-12 demo persona's whole-app presentation while they're signed in, so a K-2 learner
 * sees a completely different world from a 9-12 learner:
 *   - font family + corner radius + page color + base size all shift by GRADE BAND (playful rounded &
 *     big for K-2 → clean, tight, restrained for 9-12);
 *   - motion class (playful → minimal), a high-contrast class for the low-vision learner, and a calm
 *     class for the autistic learner.
 * Renders nothing. No effect for non-K-12 users, so other tenants are untouched.
 */
const STYLE_ID = "k12-adaptation-css";
const CSS = `
.k12-hc [class*="text-muted"]{color:#1f2430 !important}
.k12-hc a{text-decoration:underline}
.k12-hc :focus-visible{outline:3px solid #111827 !important;outline-offset:2px}
.k12-calm *,.k12-motion-minimal *{animation-duration:.001ms !important;transition-duration:.001ms !important}
.k12-motion-playful button:hover,.k12-motion-playful [role="button"]:hover{transform:translateY(-1px)}
.k12-motion-playful button:active{transform:scale(.96)}
@keyframes k12pop{0%{transform:scale(.9)}60%{transform:scale(1.04)}100%{transform:scale(1)}}
.k12-band-early h1,.k12-band-elementary h1{letter-spacing:.2px}
`;

function ensureCss() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID; s.textContent = CSS;
  document.head.appendChild(s);
}

const MOTIONS = ["k12-motion-playful", "k12-motion-gentle", "k12-motion-standard", "k12-motion-minimal"];
const BANDS = ["k12-band-early", "k12-band-elementary", "k12-band-middle", "k12-band-high"];

export function K12Adaptation() {
  const { user } = useSession();
  const persona = personaByEmail(user?.email);

  useEffect(() => {
    ensureCss();
    const root = document.documentElement;
    const clearAll = () => {
      root.classList.remove("k12-hc", "k12-calm", ...MOTIONS, ...BANDS);
      root.style.removeProperty("--radius");
      root.style.removeProperty("--page-bg");
      if (root.dataset.k12Size) { root.style.fontSize = ""; delete root.dataset.k12Size; }
      if (document.body.dataset.k12Font) { document.body.style.fontFamily = ""; delete document.body.dataset.k12Font; }
    };
    if (!persona) { clearAll(); return; }

    const theme = BAND_THEME[persona.band];
    // Font family + corner radius + page tint by band.
    document.body.style.fontFamily = theme.font; document.body.dataset.k12Font = "1";
    root.style.setProperty("--radius", `${theme.radiusPx}px`);
    root.style.setProperty("--page-bg", theme.pageBg);
    // Base size (persona can bump for low-vision) unless the learner's own easy-reading toggle is on.
    if (!root.classList.contains("easy-reading")) { root.style.fontSize = `${persona.rootPx}px`; root.dataset.k12Size = "1"; }
    // State classes.
    root.classList.remove(...MOTIONS, ...BANDS);
    root.classList.add(`k12-motion-${theme.motion}`, `k12-band-${persona.band}`);
    root.classList.toggle("k12-hc", persona.highContrast);
    root.classList.toggle("k12-calm", persona.calm);
    return clearAll;
  }, [persona]);

  return null;
}
