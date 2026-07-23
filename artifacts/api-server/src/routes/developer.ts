import { Router } from "express";
import crypto from "node:crypto";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { apiKeysTable, webhooksTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { generateApiKey } from "../lib/apiAuth";
import { isSafeWebhookTarget } from "../lib/ssrf";

const router = Router();

// --- API keys -------------------------------------------------------------

// GET /developer/keys — list keys (never the plaintext).
router.get("/developer/keys", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const rows = await db
    .select({
      id: apiKeysTable.id,
      name: apiKeysTable.name,
      prefix: apiKeysTable.prefix,
      lastUsedAt: apiKeysTable.lastUsedAt,
      revokedAt: apiKeysTable.revokedAt,
      createdAt: apiKeysTable.createdAt,
    })
    .from(apiKeysTable)
    .where(eq(apiKeysTable.ownerId, userId))
    .orderBy(desc(apiKeysTable.id));
  res.json(rows);
});

// POST /developer/keys { name } — create a key; the plaintext is returned ONCE.
router.post("/developer/keys", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const name =
    typeof req.body?.name === "string" && req.body.name.trim() ? req.body.name.trim().slice(0, 80) : "API key";
  const { full, hash, prefix } = generateApiKey();
  const [row] = await db
    .insert(apiKeysTable)
    .values({ ownerId: userId, name, keyHash: hash, prefix })
    .returning();
  res.status(201).json({ id: row.id, name: row.name, prefix: row.prefix, createdAt: row.createdAt, key: full });
});

// DELETE /developer/keys/:id — revoke a key.
router.delete("/developer/keys/:id", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const id = Number(req.params.id);
  await db
    .update(apiKeysTable)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeysTable.id, id), eq(apiKeysTable.ownerId, userId)));
  res.status(204).send();
});

// --- Webhooks -------------------------------------------------------------

// GET /developer/webhooks — list webhooks (never the secret).
router.get("/developer/webhooks", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const rows = await db
    .select({
      id: webhooksTable.id,
      url: webhooksTable.url,
      events: webhooksTable.events,
      active: webhooksTable.active,
      createdAt: webhooksTable.createdAt,
    })
    .from(webhooksTable)
    .where(eq(webhooksTable.ownerId, userId))
    .orderBy(desc(webhooksTable.id));
  res.json(rows);
});

// POST /developer/webhooks { url, events } — create; the signing secret is returned ONCE.
router.post("/developer/webhooks", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  if (!/^https?:\/\/.+/i.test(url)) {
    res.status(400).json({ error: "A valid http(s) URL is required." });
    return;
  }
  // SSRF guard: reject webhook targets that point at loopback, private, or
  // link-local/metadata addresses so a registered webhook cannot be used to
  // reach internal infrastructure.
  if (!(await isSafeWebhookTarget(url))) {
    res.status(400).json({
      error: "Webhook URL must be a public address (private, loopback, and metadata hosts are not allowed).",
    });
    return;
  }
  const events =
    typeof req.body?.events === "string" && req.body.events.trim() ? req.body.events.trim().slice(0, 200) : "*";
  const secret = `whsec_${crypto.randomBytes(24).toString("base64url")}`;
  const [row] = await db
    .insert(webhooksTable)
    .values({ ownerId: userId, url, events, secret })
    .returning();
  res.status(201).json({
    id: row.id,
    url: row.url,
    events: row.events,
    active: row.active,
    createdAt: row.createdAt,
    secret,
  });
});

// DELETE /developer/webhooks/:id
router.delete("/developer/webhooks/:id", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const id = Number(req.params.id);
  await db
    .delete(webhooksTable)
    .where(and(eq(webhooksTable.id, id), eq(webhooksTable.ownerId, userId)));
  res.status(204).send();
});

export default router;
