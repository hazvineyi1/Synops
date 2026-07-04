// Shared text helpers for the binary renderers.
//
// The PDF renderer uses pdfkit's built-in standard fonts (WinAnsi encoding), and
// the product forbids non-ASCII punctuation (em/en dashes, smart quotes) in
// generated copy. DB-sourced strings (objective text, notes, org names) are not
// guaranteed ASCII, so `clean` transliterates the common offenders and drops any
// remaining characters outside the Latin-1 range both renderers can represent.

export function clean(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");
}

/** ISO timestamp -> "YYYY-MM-DD" (ASCII, locale-independent). */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return clean(iso);
  return d.toISOString().slice(0, 10);
}
