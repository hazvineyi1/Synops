import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { eq } from "drizzle-orm";
import { db, meetingRecordingsTable } from "@workspace/compass-db";
import { RequestUploadUrlBody } from "@workspace/compass-api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { requireAuth } from "../lib/auth";
import { loadActorContext } from "../lib/actor";
import { denyNoScope, resolveProjectScope } from "../lib/tenancy";
import { loadOrgBilling, isReadOnly } from "../lib/billing";
import { READ_ONLY_MESSAGE } from "../lib/readonly";

/**
 * Object storage endpoints. These live OUTSIDE the /compass namespace but are
 * not public: the router authenticates and loads the actor on every request,
 * and the serving route enforces a DB-backed ACL. An opaque object path is NOT
 * authorization on its own; serving an object requires that the path belongs to
 * a meeting_recordings row the actor may read (org + builder allocation scoped).
 */
const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

router.use(requireAuth, loadActorContext);

// POST /storage/uploads/request-url
// Returns a presigned PUT URL plus the objectPath to persist. The client sends
// JSON metadata only and uploads the bytes directly to the presigned URL.
router.post("/storage/uploads/request-url", async (req: Request, res: Response): Promise<void> => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Minting an upload URL is the first step of a create, so it is gated like any
  // other write: a read-only tenant (e.g. expired trial) cannot start an upload.
  // This route lives outside /compass, so it cannot rely on the engine's
  // blockWritesWhenReadOnly guard and must check here.
  const actor = req.actor!;
  if (!actor.isGlobal && actor.organizationId != null) {
    const org = await loadOrgBilling(actor.organizationId);
    if (org && isReadOnly(org)) {
      res.status(402).json({ error: "read_only", upgrade: true, message: READ_ONLY_MESSAGE });
      return;
    }
  }

  try {
    // Bind the minted object to the requesting actor. The owner segment lets the
    // attach step reject any objectPath that is not in the caller's namespace, so
    // a forged recording row cannot point a serving ACL at someone else's object.
    const uploadURL = await objectStorageService.getObjectEntityUploadURL(
      String(req.actor!.userId),
    );
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath });
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

// GET /storage/objects/*path
// Serve an uploaded object entity. Authorization is DB-backed: the object path
// must belong to a meeting_recordings row the actor may read. Anything else is
// reported as 404 (never leak existence, never serve on an opaque path alone).
router.get("/storage/objects/*path", async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;

    const [recording] = await db
      .select({ id: meetingRecordingsTable.id, projectId: meetingRecordingsTable.projectId })
      .from(meetingRecordingsTable)
      .where(eq(meetingRecordingsTable.objectPath, objectPath));

    if (!recording) {
      res.status(404).json({ error: "Object not found" });
      return;
    }

    if (
      await denyNoScope(
        res,
        req.actor!,
        await resolveProjectScope(recording.projectId),
        "read",
        "Object not found",
      )
    ) {
      return;
    }

    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
