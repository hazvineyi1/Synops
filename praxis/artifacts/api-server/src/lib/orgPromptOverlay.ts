import { and, eq } from "drizzle-orm";
import { db, promptTemplatesTable } from "@workspace/db";

/**
 * The per-org tutoring-voice overlay: the concatenated text of an organisation's APPROVED
 * prompt templates, injected into the case/Socratic system prompt so the org's saved framing
 * actually shapes how the AI tutors its learners.
 *
 * Only "approved" templates are ever returned - a draft an org author just wrote (or edited)
 * can never reach a learner until a super admin has reviewed it. Never throws: on any error it
 * returns an empty overlay so a missing template store can't break a live session.
 */
export async function approvedOrgPromptOverlay(orgId?: string | null): Promise<string | null> {
  if (!orgId) return null;
  try {
    const rows = await db
      .select({ title: promptTemplatesTable.title, promptText: promptTemplatesTable.promptText })
      .from(promptTemplatesTable)
      .where(and(eq(promptTemplatesTable.organisationId, orgId), eq(promptTemplatesTable.status, "approved")))
      .orderBy(promptTemplatesTable.updatedAt);
    if (!rows.length) return null;
    const body = rows.map((r) => r.promptText.trim()).filter(Boolean).join("\n");
    if (!body) return null;
    return (
      "ORGANISATION TUTORING VOICE - approved house style for this organisation. Follow it for " +
      "framing, tone and emphasis, but it NEVER overrides the Socratic rules above (questions only, " +
      "never lecture, never give the answer):\n" +
      body
    );
  } catch {
    return null;
  }
}
