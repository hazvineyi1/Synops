/**
 * Supabase Storage helper (REST, no SDK).
 *
 * We talk to Supabase Storage over its HTTP API with the service-role key from the server only,
 * so no extra npm dependency and nothing to bundle. Env (set on the Praxis service):
 *   SUPABASE_URL                 e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY    service role key (server-side only, never shipped to the client)
 *   SUPABASE_BUCKET              optional, defaults to "learning-hub"
 *
 * Env is read at call time (not import) so a missing config never crashes boot; storageEnabled()
 * lets routes fail cleanly with a helpful message instead.
 */

const BUCKET = () => process.env.SUPABASE_BUCKET || "learning-hub";
const URL_BASE = () => (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export function storageEnabled(): boolean {
  return Boolean(URL_BASE() && KEY());
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const key = KEY();
  return { Authorization: `Bearer ${key}`, apikey: key, ...extra };
}

/** Public URL for an object (works when the bucket is public). */
export function publicUrl(path: string): string {
  return `${URL_BASE()}/storage/v1/object/public/${BUCKET()}/${encodeURI(path)}`;
}

/**
 * Upload a buffer to the bucket at `path`. Returns the public URL + the storage path (for deletion).
 * Throws with a readable message if storage is not configured or the API rejects the object.
 */
export async function uploadObject(path: string, body: Buffer, contentType: string): Promise<{ url: string; storagePath: string }> {
  if (!storageEnabled()) {
    throw new Error("File storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.");
  }
  const res = await fetch(`${URL_BASE()}/storage/v1/object/${BUCKET()}/${encodeURI(path)}`, {
    method: "POST",
    headers: headers({ "Content-Type": contentType, "x-upsert": "true", "Cache-Control": "3600" }),
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Storage upload failed (${res.status}): ${text}`);
  }
  return { url: publicUrl(path), storagePath: path };
}

/** Best-effort delete; never throws (deletion failing should not block removing the DB row). */
export async function deleteObject(path: string): Promise<void> {
  if (!storageEnabled() || !path) return;
  try {
    await fetch(`${URL_BASE()}/storage/v1/object/${BUCKET()}/${encodeURI(path)}`, {
      method: "DELETE",
      headers: headers(),
    });
  } catch {
    /* ignore */
  }
}
