import { useEffect } from "react";
import { useSession } from "@/context/SessionContext";
import { personaByEmail } from "@/lib/k12Personas";

/**
 * Applies each K-12 demo persona's presentation adaptation app-wide while they're signed in:
 *   - base font size scales by grade band (Grade 3 largest → Grade 11 smallest), and up again for the
 *     low-vision learner, so "the layout adapts as learners get older / to their needs" is literally true;
 *   - a high-contrast class for the low-vision learner (darkens muted text, thicker focus);
 *   - a calm / reduced-motion class for the autistic learner (predictable, low-stimulation).
 * Renders nothing. No effect for non-K-12 users, so other tenants are untouched.
 */
const STYLE_ID = "k12-adaptation-css";
const CSS = `
.k12-hc [class*="text-muted"]{color:#1f2430 !important}
.k12-hc a{text-decoration:underline}
.k12-hc :focus-visible{outline:3px solid #111827 !important;outline-offset:2px}
.k12-calm *{animation-duration:.001ms !important;transition-duration:.001ms !important}
`;

function ensureCss() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID; s.textContent = CSS;
  document.head.appendChild(s);
}

export function K12Adaptation() {
  const { user } = useSession();
  const persona = personaByEmail(user?.email);

  useEffect(() => {
    ensureCss();
    const root = document.documentElement;
    if (!persona) {
      root.classList.remove("k12-hc", "k12-calm");
      // Only clear a size we set; leave the easy-reading toggle's own value alone.
      if (root.dataset.k12Size) { root.style.fontSize = ""; delete root.dataset.k12Size; }
      return;
    }
    // Don't fight the learner's own easy-reading toggle (Leo): it sets html.easy-reading.
    if (!root.classList.contains("easy-reading")) {
      root.style.fontSize = `${persona.rootPx}px`;
      root.dataset.k12Size = "1";
    }
    root.classList.toggle("k12-hc", persona.highContrast);
    root.classList.toggle("k12-calm", persona.calm);
    return () => { /* next run reconciles */ };
  }, [persona]);

  return null;
}
