/**
 * Curated, verified Unsplash photos for early-reader "picture words". These are direct Unsplash CDN
 * URLs (no API key, no deprecated Source endpoint), sized to a square thumbnail. Young readers see a
 * real photo instead of a tiny emoji, so a "match the word to the picture" lesson actually shows the
 * picture. Each id was pulled live from unsplash.com and load-checked.
 */
const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=400&h=400&fit=crop&crop=entropy&auto=format&q=70`;

export const KID_PICTURES: Record<string, string> = {
  cat: U("1514888286974-6c03e2ca1dba"),
  dog: U("1530281700549-e82e7bf110d6"),
  sun: U("1563630381190-77c336ea545a"),
  hat: U("1588850561407-ed78c282e89b"),
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
