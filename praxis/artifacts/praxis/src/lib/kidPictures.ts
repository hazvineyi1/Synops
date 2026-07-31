/**
 * Curated, verified Unsplash photos for early-reader "picture words". These are direct Unsplash CDN
 * URLs (no API key, no deprecated Source endpoint), sized to a square thumbnail. Young readers see a
 * real photo instead of a tiny emoji, so a "match the word to the picture" lesson actually shows the
 * picture. Each id was pulled live from unsplash.com and load-checked.
 */
// Served by the API as a transparent-background "cut-out" PNG (background removed once via
// remove.bg, cached), with a graceful fallback to the original photo when no key is configured.
export const KID_PICTURES: Record<string, string> = {
  cat: "/api/kid-cutout/cat.png",
  dog: "/api/kid-cutout/dog.png",
  sun: "/api/kid-cutout/sun.png",
  hat: "/api/kid-cutout/hat.png",
};

/**
 * The picture-words that appear in a piece of reading text, in the order they first appear, with the
 * photo to show for each. Whole-word, case-insensitive; each word only once.
 */
export function picturesInText(text: string): { word: string; url: string }[] {
  const lower = (text || "").toLowerCase();
  return Object.keys(KID_PICTURES)
    .map((w) => ({ word: w, url: KID_PICTURES[w], at: lower.search(new RegExp(`\\b${w}\\b`)) }))
    .filter((h) => h.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(({ word, url }) => ({ word, url }));
}
