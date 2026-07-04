import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, meetingRecordingsTable, projectsTable } from "@workspace/compass-db";
import {
  ListMeetingRecordingsParams,
  CreateMeetingRecordingParams,
  CreateMeetingRecordingBody,
  DeleteMeetingRecordingParams,
  TranscribeMeetingRecordingParams,
} from "@workspace/compass-api-zod";
import {
  denyNoScope,
  resolveProjectScope,
  resolveMeetingRecordingScope,
  resolveMeetingScope,
} from "../lib/tenancy";
import { recordActorAudit } from "../lib/audit";
import { ObjectStorageService } from "../lib/objectStorage";
import {
  isRecordingAiConfigured,
  transcribeAndDraftNotes,
} from "../lib/recordingNotesAi";

const router = Router();
const objectStorageService = new ObjectStorageService();

// Hard guards on what we will pull into memory and transcribe synchronously.
// A recording past either limit is rejected (413) rather than risking a request
// timeout or a large in-memory buffer. These match the upload-side expectations.
const MAX_TRANSCRIBE_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_TRANSCRIBE_SECONDS = 20 * 60; // 20 minutes

function serialize(row: typeof meetingRecordingsTable.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    meetingId: row.meetingId,
    kind: row.kind,
    title: row.title,
    objectPath: row.objectPath,
    externalUrl: row.externalUrl,
    durationSec: row.durationSec,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    transcript: row.transcript,
    draftNotes: row.draftNotes,
    transcribedAt: row.transcribedAt ? row.transcribedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/projects/:projectId/recordings", async (req, res): Promise<void> => {
  const params = ListMeetingRecordingsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (
    await denyNoScope(
      res,
      req.actor!,
      await resolveProjectScope(params.data.projectId),
      "read",
      "Project not found",
    )
  ) {
    return;
  }

  const rows = await db
    .select()
    .from(meetingRecordingsTable)
    .where(eq(meetingRecordingsTable.projectId, params.data.projectId))
    .orderBy(meetingRecordingsTable.createdAt);

  res.json(rows.map(serialize));
});

router.post("/projects/:projectId/recordings", async (req, res): Promise<void> => {
  const params = CreateMeetingRecordingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateMeetingRecordingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Enforce the per-kind shape: an upload must carry an object path produced by
  // the storage endpoint FOR THIS ACTOR; an external recording must carry an
  // http(s) link. The objectPath must sit in the caller's own upload namespace
  // (`/objects/uploads/<userId>/<uuid>`). This prevents a caller from attaching
  // (and then reading, via the serving ACL) an object they did not upload. The
  // trailing segment must be a bare UUID so no path traversal can slip through.
  if (parsed.data.kind === "upload") {
    const expectedPrefix = `/objects/uploads/${req.actor!.userId}/`;
    const objectPath = parsed.data.objectPath ?? "";
    const tail = objectPath.startsWith(expectedPrefix)
      ? objectPath.slice(expectedPrefix.length)
      : "";
    if (!/^[0-9a-fA-F-]{36}$/.test(tail)) {
      res.status(400).json({ error: "An uploaded recording requires a valid objectPath." });
      return;
    }
  } else {
    const url = parsed.data.externalUrl ?? "";
    if (!/^https?:\/\//i.test(url)) {
      res.status(400).json({ error: "An external recording requires an http(s) link." });
      return;
    }
  }

  if (
    await denyNoScope(
      res,
      req.actor!,
      await resolveProjectScope(params.data.projectId),
      "write",
      "Project not found",
    )
  ) {
    return;
  }

  // A scoped recording must belong to a meeting in THIS project (and therefore
  // this org). Cross-project or cross-org meeting ids return 404, not 403, to
  // avoid leaking existence.
  if (parsed.data.meetingId != null) {
    const meetingScope = await resolveMeetingScope(parsed.data.meetingId);
    if (!meetingScope || meetingScope.projectId !== params.data.projectId) {
      res.status(404).json({ error: "Meeting not found" });
      return;
    }
  }

  const isUpload = parsed.data.kind === "upload";
  const [row] = await db
    .insert(meetingRecordingsTable)
    .values({
      projectId: params.data.projectId,
      meetingId: parsed.data.meetingId ?? null,
      kind: parsed.data.kind,
      title: parsed.data.title,
      objectPath: isUpload ? parsed.data.objectPath! : null,
      externalUrl: isUpload ? null : parsed.data.externalUrl!,
      durationSec: parsed.data.durationSec ?? null,
      contentType: isUpload ? parsed.data.contentType ?? null : null,
      sizeBytes: isUpload ? parsed.data.sizeBytes ?? null : null,
      createdByUserId: req.actor!.userId,
    })
    .returning();

  await recordActorAudit(req.actor!, {
    action: "create",
    entityType: "meeting_recording",
    entityTitle: row.title,
    projectId: row.projectId,
  });

  res.status(201).json(serialize(row));
});

router.delete("/meeting-recordings/:id", async (req, res): Promise<void> => {
  const params = DeleteMeetingRecordingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (
    await denyNoScope(
      res,
      req.actor!,
      await resolveMeetingRecordingScope(params.data.id),
      "write",
      "Recording not found",
    )
  ) {
    return;
  }

  const [row] = await db
    .select()
    .from(meetingRecordingsTable)
    .where(eq(meetingRecordingsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Recording not found" });
    return;
  }

  await db.delete(meetingRecordingsTable).where(eq(meetingRecordingsTable.id, params.data.id));

  // Best-effort removal of the underlying object so deletes do not orphan blobs.
  if (row.kind === "upload" && row.objectPath) {
    try {
      const file = await objectStorageService.getObjectEntityFile(row.objectPath);
      await file.delete();
    } catch {
      // The DB row is already gone; serving 404s without it. Ignore blob errors.
    }
  }

  await recordActorAudit(req.actor!, {
    action: "delete",
    entityType: "meeting_recording",
    entityTitle: row.title,
    projectId: row.projectId,
  });

  res.status(204).end();
});

router.post("/meeting-recordings/:id/transcribe", async (req, res): Promise<void> => {
  const params = TranscribeMeetingRecordingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Org-scope check first: a recording the actor cannot write is reported as
  // "not found" (cross-org stays a 404, never a 403) and the audio is never read.
  if (
    await denyNoScope(
      res,
      req.actor!,
      await resolveMeetingRecordingScope(params.data.id),
      "write",
      "Recording not found",
    )
  ) {
    return;
  }

  const [row] = await db
    .select()
    .from(meetingRecordingsTable)
    .where(eq(meetingRecordingsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Recording not found" });
    return;
  }

  // Only uploaded audio can be transcribed. External links are refused (not
  // fetched) so the server never makes an outbound request to a client-supplied
  // URL (SSRF) on behalf of the actor.
  if (row.kind !== "upload" || !row.objectPath) {
    res.status(409).json({ error: "Only uploaded recordings can be transcribed." });
    return;
  }

  // Refuse work up front when AI is not configured, so we never download a large
  // object just to discover we cannot transcribe it.
  if (!isRecordingAiConfigured()) {
    res.status(503).json({ error: "AI transcription is not configured." });
    return;
  }

  // Cheap guards from the stored metadata before any download.
  if (row.sizeBytes != null && row.sizeBytes > MAX_TRANSCRIBE_BYTES) {
    res.status(413).json({ error: "Recording is too large to transcribe (limit 25 MB)." });
    return;
  }
  if (row.durationSec != null && row.durationSec > MAX_TRANSCRIBE_SECONDS) {
    res.status(413).json({ error: "Recording is too long to transcribe (limit 20 minutes)." });
    return;
  }

  // Read ONLY the object referenced by this row (never a request-supplied path)
  // into memory, re-checking the actual byte length after download.
  let audio: Buffer;
  try {
    const file = await objectStorageService.getObjectEntityFile(row.objectPath);
    const response = await objectStorageService.downloadObject(file);
    const arrayBuffer = await response.arrayBuffer();
    audio = Buffer.from(arrayBuffer);
  } catch (error) {
    req.log.error({ err: error, recordingId: row.id }, "Failed to read recording for transcription");
    res.status(404).json({ error: "Recording audio not found" });
    return;
  }

  if (audio.byteLength > MAX_TRANSCRIBE_BYTES) {
    res.status(413).json({ error: "Recording is too large to transcribe (limit 25 MB)." });
    return;
  }
  if (audio.byteLength === 0) {
    res.status(422).json({ error: "Recording audio could not be decoded for transcription." });
    return;
  }

  const [project] = await db
    .select({ title: projectsTable.title })
    .from(projectsTable)
    .where(eq(projectsTable.id, row.projectId));

  const outcome = await transcribeAndDraftNotes(audio, {
    recordingTitle: row.title,
    projectTitle: project?.title ?? null,
  });

  if (outcome.status === "ai_unavailable") {
    res.status(503).json({ error: "AI transcription is not configured." });
    return;
  }
  if (outcome.status === "decode_failed") {
    res.status(422).json({ error: "Recording audio could not be transcribed." });
    return;
  }

  // Persist the transcript (and the draft notes when the draft step succeeded).
  // A successful transcription is saved even when note drafting failed, so a slow
  // or paid transcription is never discarded for a second-step failure.
  const [updated] = await db
    .update(meetingRecordingsTable)
    .set({
      transcript: outcome.transcript,
      draftNotes: outcome.draftNotes,
      transcribedAt: new Date(),
    })
    .where(eq(meetingRecordingsTable.id, row.id))
    .returning();

  await recordActorAudit(req.actor!, {
    action: "transcribe",
    entityType: "meeting_recording",
    entityTitle: row.title,
    projectId: row.projectId,
  });

  res.status(200).json(serialize(updated));
});

export default router;
