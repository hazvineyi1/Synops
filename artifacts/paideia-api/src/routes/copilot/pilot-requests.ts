import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, pilotRequestsTable } from "@workspace/paideia-db";
import { logEvent } from "../../lib/eventLog.js";
import { rateLimit } from "../../middlewares/rateLimit.js";
import { sendEmail } from "../../lib/email.js";
import { logger } from "../../lib/logger.js";

/** Where new website inquiries are delivered. Override with INQUIRY_NOTIFY_TO. */
const INQUIRY_NOTIFY_TO = process.env["INQUIRY_NOTIFY_TO"] || "info@synops-consulting.com";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

/**
 * Email the inbox about a new inquiry. Fire-and-forget: never blocks or fails the
 * HTTP response, and degrades to a no-op (logged) when email is not configured.
 * reply_to is set to the visitor so a reply goes straight back to them.
 */
async function notifyInquiry(d: {
  source: string;
  contactName: string;
  contactEmail: string;
  organization?: string | null;
  schoolName?: string | null;
  country?: string | null;
  message?: string | null;
  sourcePath?: string | null;
}): Promise<void> {
  const rows: [string, string | null | undefined][] = [
    ["Name", d.contactName],
    ["Email", d.contactEmail],
    ["Organization", d.organization],
    ["School", d.schoolName],
    ["Country", d.country],
    ["Source", d.source],
    ["Page", d.sourcePath],
  ];
  const filled = rows.filter(([, v]) => v);
  const textLines = filled.map(([k, v]) => `${k}: ${v}`).join("\n");
  const text = `New inquiry from the Synops website\n\n${textLines}\n\nMessage:\n${d.message || "(no message)"}\n`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.6;color:#0f172a;max-width:560px">
  <h2 style="margin:0 0 16px;font-size:19px;color:#312e81">New website inquiry</h2>
  <table style="border-collapse:collapse;font-size:15px">
    ${filled.map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#64748b;vertical-align:top">${esc(k)}</td><td style="padding:4px 0"><strong>${esc(String(v))}</strong></td></tr>`).join("")}
  </table>
  <p style="margin:20px 0 6px;color:#64748b;font-size:13px">Message</p>
  <p style="margin:0;white-space:pre-wrap;font-size:15px">${esc(d.message || "(no message)")}</p>
</div>`;
  try {
    const r = await sendEmail({
      to: INQUIRY_NOTIFY_TO,
      subject: `New inquiry: ${d.contactName}${d.organization ? ` (${d.organization})` : ""}`,
      html,
      text,
      replyTo: d.contactEmail,
    });
    if (!r.ok) logger.warn({ configured: r.configured, error: r.error }, "inquiry notification not sent");
  } catch (err) {
    logger.error({ err }, "inquiry notification threw");
  }
}

const router: IRouter = Router();
router.use(rateLimit({ windowMs: 60 * 60 * 1000, max: 10 }));

const schema = z.object({
  source: z.string().min(1).max(60),
  schoolName: z.string().max(200).optional().nullable(),
  country: z.string().max(120).optional().nullable(),
  gradeLevels: z.string().max(60).optional().nullable(),
  organization: z.string().max(200).optional().nullable(),
  contactName: z.string().min(2).max(120),
  contactEmail: z.string().email().max(200),
  message: z.string().max(2000).optional().nullable(),
  sourcePath: z.string().max(400).optional().nullable(),
  sourceReferrer: z.string().max(400).optional().nullable(),
  sourceUtm: z.record(z.string(), z.string().max(200)).optional().nullable(),
  anonymousId: z.string().max(80).optional().nullable(),
});

router.post("/", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  const [row] = await db
    .insert(pilotRequestsTable)
    .values({
      source: d.source,
      schoolName: d.schoolName?.trim() || null,
      country: d.country?.trim() || null,
      gradeLevels: d.gradeLevels?.trim() || null,
      organization: d.organization?.trim() || null,
      contactName: d.contactName.trim(),
      contactEmail: d.contactEmail.trim().toLowerCase(),
      message: d.message?.trim() || null,
      sourcePath: d.sourcePath ?? null,
      sourceReferrer: d.sourceReferrer ?? null,
      sourceUtm: d.sourceUtm ?? null,
      anonymousId: d.anonymousId ?? null,
    })
    .returning();
  void logEvent(req, "pilot_request_submitted", {
    source: d.source,
    school: d.schoolName ?? null,
    country: d.country ?? null,
    pilotRequestId: row?.id,
  }, {
    surface: "site",
    path: d.sourcePath ?? null,
    referrer: d.sourceReferrer ?? null,
    anonymousId: d.anonymousId ?? null,
  });
  // Deliver the inquiry to the inbox. Fire-and-forget so a slow/misconfigured
  // mailer never delays or fails the visitor's submission.
  void notifyInquiry({
    source: d.source,
    contactName: d.contactName.trim(),
    contactEmail: d.contactEmail.trim(),
    organization: d.organization?.trim() || null,
    schoolName: d.schoolName?.trim() || null,
    country: d.country?.trim() || null,
    message: d.message?.trim() || null,
    sourcePath: d.sourcePath ?? null,
  });
  res.status(201).json({ ok: true, id: row?.id });
});

export default router;
