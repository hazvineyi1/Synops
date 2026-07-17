import { type Request, type Response, type NextFunction } from "express";
import { createHash } from "node:crypto";
import { db, studyApiKeysTable } from "@workspace/paideia-db";
import { eq } from "drizzle-orm";

/**
 * Guards the public, integration-facing API (e.g. the Praxis -> Coach catch-up push).
 * Authenticates a caller by an API key presented as `Authorization: Bearer <key>`.
 * Keys are minted in the Coach admin console (study_api_keys) and stored only as a
 * SHA-256 hash, so we hash the incoming key and look it up. On success the key's
 * owner id is attached as req.apiKeyOwnerId (the integration's identity, NOT the
 * learner acted upon) and lastUsedAt is bumped best-effort.
 */
export async function requireApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const m = ((req.headers.authorization as string) || "").match(/^Bearer\s+(\S+)$/i);
  if (!m) {
    res.status(401).json({ error: "Missing API key. Send 'Authorization: Bearer <key>'." });
    return;
  }
  const hash = createHash("sha256").update(m[1]).digest("hex");
  try {
    const [row] = await db
      .select()
      .from(studyApiKeysTable)
      .where(eq(studyApiKeysTable.keyHash, hash))
      .limit(1);
    if (!row || row.revokedAt) {
      res.status(401).json({ error: "Invalid or revoked API key." });
      return;
    }
    (req as { apiKeyOwnerId?: string }).apiKeyOwnerId = row.ownerId;
    // Best-effort last-used bump; never blocks the request.
    void db
      .update(studyApiKeysTable)
      .set({ lastUsedAt: new Date() })
      .where(eq(studyApiKeysTable.id, row.id))
      .catch(() => undefined);
    next();
  } catch (err) {
    req.log?.warn({ err }, "api key lookup failed");
    res.status(500).json({ error: "Could not verify API key." });
  }
}
