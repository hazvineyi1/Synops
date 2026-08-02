import React, { useEffect, useId } from "react";

/**
 * Glossy cartoon mascots for the K-12 "Aventura" look — original characters (fish, star, book,
 * treasure chest) drawn as inline SVG with gradient shading, gloss highlights and dark outlines.
 * Crisp at any size, tiny, recolorable, and gently animated (a soft bob). Decorative only.
 */
const KF_ID = "k12-mascot-keyframes";
const KEYFRAMES =
  "@keyframes k12bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}" +
  "@keyframes k12sway{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}";

function useMascotKeyframes() {
  useEffect(() => {
    if (typeof document === "undefined" || document.getElementById(KF_ID)) return;
    const s = document.createElement("style");
    s.id = KF_ID;
    s.textContent = KEYFRAMES;
    document.head.appendChild(s);
  }, []);
}

const anim = (name: string, secs: number): React.CSSProperties => ({
  animation: `${name} ${secs}s ease-in-out infinite`,
  transformOrigin: "center",
});

type MascotProps = { size?: number; animated?: boolean; className?: string };

export function FishMascot({ size = 72, animated = true, className }: MascotProps) {
  useMascotKeyframes();
  const g = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size * 0.75} viewBox="0 0 130 100" className={className}
      style={animated ? anim("k12bob", 2.3) : undefined} aria-hidden="true">
      <defs><linearGradient id={g} x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stopColor="#67D7FF" /><stop offset="1" stopColor="#2A79DE" /></linearGradient></defs>
      <path d="M100 50 L126 26 Q118 50 126 74 Z" fill="#FFC93C" stroke="#0B2B52" strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M46 24 Q34 4 24 24 Q34 22 50 34 Z" fill="#7C5CFF" stroke="#0B2B52" strokeWidth="3" strokeLinejoin="round" />
      <path d="M54 68 Q49 92 68 82 Z" fill="#7C5CFF" stroke="#0B2B52" strokeWidth="3" strokeLinejoin="round" />
      <ellipse cx="60" cy="50" rx="48" ry="32" fill={`url(#${g})`} stroke="#0B2B52" strokeWidth="3.5" />
      <ellipse cx="38" cy="34" rx="15" ry="8" fill="#fff" opacity="0.32" />
      <circle cx="72" cy="42" r="4" fill="#fff" opacity="0.5" /><circle cx="86" cy="52" r="3" fill="#fff" opacity="0.5" />
      <circle cx="36" cy="46" r="12" fill="#fff" stroke="#0B2B52" strokeWidth="3" /><circle cx="36" cy="47" r="6" fill="#0B2B52" /><circle cx="38" cy="45" r="2" fill="#fff" />
      <path d="M14 50 q-7 4 0 10 q8 -3 11 -7 z" fill="#E24B6A" stroke="#0B2B52" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

export function StarMascot({ size = 48, animated = true, className }: MascotProps) {
  useMascotKeyframes();
  const g = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className}
      style={animated ? anim("k12bob", 2.7) : undefined} aria-hidden="true">
      <defs><linearGradient id={g} x1="0" y1="0" x2="0.7" y2="1"><stop offset="0" stopColor="#FFE264" /><stop offset="0.55" stopColor="#FBBB21" /><stop offset="1" stopColor="#E88E0C" /></linearGradient></defs>
      <path d="M60 8 l14 29 32 4 -23 22 6 32 -29 -16 -29 16 6 -32 -23 -22 32 -4 z" fill={`url(#${g})`} stroke="#2B2B3A" strokeWidth="4" strokeLinejoin="round" />
      <ellipse cx="44" cy="36" rx="8" ry="15" fill="#fff" opacity="0.7" transform="rotate(-22 44 36)" />
      <circle cx="48" cy="62" r="5" fill="#2B2B3A" /><circle cx="72" cy="62" r="5" fill="#2B2B3A" /><circle cx="50" cy="60" r="1.6" fill="#fff" /><circle cx="74" cy="60" r="1.6" fill="#fff" />
      <path d="M50 74 Q60 84 70 74" stroke="#2B2B3A" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <circle cx="40" cy="70" r="4.5" fill="#FF9AB0" opacity="0.85" /><circle cx="80" cy="70" r="4.5" fill="#FF9AB0" opacity="0.85" />
    </svg>
  );
}

export function BookMascot({ size = 56, animated = true, className }: MascotProps) {
  useMascotKeyframes();
  const g = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size * 0.82} viewBox="0 0 84 68" className={className}
      style={animated ? anim("k12bob", 2.9) : undefined} aria-hidden="true">
      <defs><linearGradient id={g} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8A6BFF" /><stop offset="1" stopColor="#6A47E6" /></linearGradient></defs>
      <rect x="12" y="12" width="58" height="44" rx="4" fill={`url(#${g})`} stroke="#33238A" strokeWidth="3" />
      <rect x="20" y="18" width="42" height="32" rx="2" fill="#F2EEFF" stroke="#33238A" strokeWidth="2" />
      <line x1="41" y1="18" x2="41" y2="50" stroke="#B9A9FF" strokeWidth="2" />
      <ellipse cx="26" cy="20" rx="8" ry="3.5" fill="#fff" opacity="0.4" />
      <circle cx="32" cy="32" r="3" fill="#2B2B3A" /><circle cx="50" cy="32" r="3" fill="#2B2B3A" />
      <path d="M33 39 Q41 45 49 39" stroke="#2B2B3A" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function ChestMascot({ size = 48, animated = true, className }: MascotProps) {
  useMascotKeyframes();
  return (
    <svg width={size} height={size * 0.85} viewBox="0 0 60 52" className={className}
      style={animated ? anim("k12sway", 2.6) : undefined} aria-hidden="true">
      <rect x="8" y="22" width="44" height="22" rx="2" fill="#C77B32" stroke="#5A3410" strokeWidth="3" />
      <rect x="8" y="14" width="44" height="12" rx="2" fill="#9A5A20" stroke="#5A3410" strokeWidth="3" />
      <rect x="25" y="24" width="10" height="10" fill="#FFCB47" stroke="#5A3410" strokeWidth="2" />
      <circle cx="30" cy="29" r="1.8" fill="#5A3410" />
    </svg>
  );
}
