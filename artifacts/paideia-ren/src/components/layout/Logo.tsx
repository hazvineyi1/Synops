import React from "react";

/**
 * Synops monogram-S mark + wordmark.
 *
 * The tile is brand-fixed (electric-indigo gradient, white geometric S) so it reads
 * the same on the dark hero and the white scrolled nav. Only the wordmark colour
 * changes with context, controlled by `wordmarkClassName`.
 */
export function Logo({
  wordmarkClassName = "text-foreground",
  showWordmark = true,
  size = 32,
}: {
  wordmarkClassName?: string;
  showWordmark?: boolean;
  size?: number;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <SynopsMark size={size} />
      {showWordmark && (
        <span className={`font-sans text-[22px] font-bold tracking-tight ${wordmarkClassName}`}>
          Synops
        </span>
      )}
    </span>
  );
}

/** The standalone tile mark, reused for favicon parity. */
export function SynopsMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="synopsTile" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2E6B74" />
          <stop offset="1" stopColor="#17444C" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#synopsTile)" />
      <path
        d="M22 11.2c0-2.2-2.4-3.8-6-3.8-3.9 0-6.3 1.9-6.3 4.6 0 5.6 12.6 3 12.6 8.2 0 2.1-2.4 3.8-6 3.8-3.5 0-6-1.6-6-3.8"
        stroke="#FFFFFF"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
