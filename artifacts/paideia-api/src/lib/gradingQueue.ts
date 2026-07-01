import { db, submissionsTable } from "@workspace/paideia-db";
import { and, inArray, lt, eq } from "drizzle-orm";
import { gradeSubmissionWithAi } from "./aiGrading.js";

const inFlight = new Set<string>();

export function enqueueGrading(submissionId: string): void {
  if (inFlight.has(submissionId)) return;
  inFlight.add(submissionId);
  setImmediate(() => {
    void gradeSubmissionWithAi(submissionId).finally(() => {
      inFlight.delete(submissionId);
    });
  });
}

export async function recoverStuckSubmissions(): Promise<number> {
  const cutoff = new Date(Date.now() - 2 * 60 * 1000);
  const stuck = await db
    .select({ id: submissionsTable.id })
    .from(submissionsTable)
    .where(
      and(
        inArray(submissionsTable.gradingStatus, ["pending", "grading"]),
        lt(submissionsTable.submittedAt, cutoff),
      ),
    );
  for (const row of stuck) {
    await db
      .update(submissionsTable)
      .set({ gradingStatus: "pending" })
      .where(eq(submissionsTable.id, row.id));
    enqueueGrading(row.id);
  }
  return stuck.length;
}
