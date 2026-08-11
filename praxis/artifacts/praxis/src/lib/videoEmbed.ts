/**
 * Universal video embed resolver.
 *
 * Turns any pasted video share link (or <iframe> snippet) into a single, chrome-free INLINE embed so a
 * short clip plays right inside the lesson, never a link that navigates the learner away ("not a dead
 * end"). Supports the big education sources: YouTube (+ Shorts), Khan Academy, Vimeo, TikTok, Loom,
 * Wistia, Google Drive, and direct video files. Where the provider allows it, we honour a start (and
 * end) time so teachers can trim to the 30–90s that actually matters instead of a 12-minute lecture.
 *
 * Usage: const v = resolveVideo(url);  then render <iframe src={v.src}> or <video src={v.src}>.
 */
export interface ResolvedVideo {
  kind: "iframe" | "file" | "none";
  src: string;
  provider: string;      // youtube | khan | vimeo | tiktok | loom | wistia | drive | file | generic
  start?: number;        // seconds
  end?: number;          // seconds
  note?: string;         // human hint (e.g. why it couldn't be embedded)
}

const NONE: ResolvedVideo = { kind: "none", src: "", provider: "" };

/** Parse a time like "90", "1m30s", "1:30", "2:05:10" → seconds. */
export function parseTime(v: string | null | undefined): number | undefined {
  if (!v) return undefined;
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const clock = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/); // h:mm:ss or mm:ss
  if (clock) return (parseInt(clock[1] || "0", 10) * 3600) + (parseInt(clock[2], 10) * 60) + parseInt(clock[3], 10);
  const hms = s.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/i);
  if (hms && (hms[1] || hms[2] || hms[3])) return (parseInt(hms[1] || "0", 10) * 3600) + (parseInt(hms[2] || "0", 10) * 60) + parseInt(hms[3] || "0", 10);
  return undefined;
}

/** Pull the src out of a pasted <iframe …> snippet, else return the trimmed string. */
function unwrapIframe(raw: string): string {
  const m = raw.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : raw.trim();
}

function q(url: string): URLSearchParams {
  try { return new URL(url).searchParams; } catch { return new URLSearchParams(); }
}

export function resolveVideo(raw?: string | null): ResolvedVideo {
  if (!raw) return NONE;
  const input = unwrapIframe(String(raw).trim());
  if (!input) return NONE;

  // Direct video file → play natively.
  if (/\.(mp4|webm|ogg|ogv|mov)(\?|#|$)/i.test(input)) return { kind: "file", src: input, provider: "file" };

  const params = q(input);
  const start = parseTime(params.get("t") || params.get("start"));
  const end = parseTime(params.get("end"));

  // YouTube (watch, youtu.be, shorts, embed, -nocookie) → privacy-friendly inline embed, no related vids.
  const yt = input.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|shorts\/|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (yt) {
    let src = `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0&modestbranding=1&playsinline=1`;
    if (start) src += `&start=${start}`;
    if (end) src += `&end=${end}`;
    return { kind: "iframe", src, provider: "youtube", start, end };
  }

  // Khan Academy. Their player is YouTube-backed; the embed endpoint takes the YouTube id (?v=) or a
  // slug. If the pasted link already carries a YouTube id, use it directly; otherwise use Khan's embed.
  if (/khanacademy\.org/i.test(input)) {
    const v = params.get("v");
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) {
      let src = `https://www.youtube-nocookie.com/embed/${v}?rel=0&modestbranding=1&playsinline=1`;
      if (start) src += `&start=${start}`;
      return { kind: "iframe", src, provider: "khan", start };
    }
    const slug = input.match(/\/v\/([^/?#]+)/);
    if (slug) return { kind: "iframe", src: `https://www.khanacademy.org/embed_video?slug=${encodeURIComponent(slug[1])}`, provider: "khan" };
    return { kind: "iframe", src: input, provider: "khan", note: "Paste the Khan Academy 'Embed' code for the cleanest result." };
  }

  // Vimeo → player embed (#t=90s for start).
  const vim = input.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vim) {
    let src = `https://player.vimeo.com/video/${vim[1]}?title=0&byline=0&portrait=0`;
    if (start) src += `#t=${start}s`;
    return { kind: "iframe", src, provider: "vimeo", start };
  }

  // TikTok → v2 inline embed player.
  const tt = input.match(/tiktok\.com\/(?:.*\/video\/|embed\/(?:v2\/)?)(\d+)/);
  if (tt) return { kind: "iframe", src: `https://www.tiktok.com/embed/v2/${tt[1]}`, provider: "tiktok" };

  // Loom → embed.
  const loom = input.match(/loom\.com\/(?:share|embed)\/([A-Za-z0-9]+)/);
  if (loom) return { kind: "iframe", src: `https://www.loom.com/embed/${loom[1]}`, provider: "loom" };

  // Wistia → iframe embed.
  const wistia = input.match(/(?:wistia\.com|wi\.st)\/(?:medias|embed\/iframe)\/([A-Za-z0-9]+)/);
  if (wistia) return { kind: "iframe", src: `https://fast.wistia.net/embed/iframe/${wistia[1]}`, provider: "wistia" };

  // Google Drive → preview (inline player, no download page).
  const drive = input.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (drive) return { kind: "iframe", src: `https://drive.google.com/file/d/${drive[1]}/preview`, provider: "drive" };

  // Already an embeddable player URL, or unknown provider, embed as-is (best effort).
  if (/^https?:\/\//i.test(input)) return { kind: "iframe", src: input, provider: "generic" };
  return NONE;
}

export const VIDEO_PROVIDERS_HINT =
  "Paste a link from YouTube, Khan Academy, Vimeo, TikTok, Loom, Wistia or Google Drive, or a video file. " +
  "Add a start time (e.g. ?t=90 or &start=90 on a YouTube link) to jump straight to the useful part and keep the clip short.";
