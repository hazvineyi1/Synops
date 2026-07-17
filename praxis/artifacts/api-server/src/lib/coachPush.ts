/**
 * Push an off-track learner into The Coach (the standalone AI study-coach app) via its public
 * API. When a Praxis learner falls behind and a remedial plan is generated, we hand The Coach the
 * learner's identity, the gap, and the plan content so it sets up a ready-to-use catch-up plan the
 * learner can open in the coach conversation.
 *
 * SAFE NO-OP until configured, so shipping it never breaks anything:
 *   COACH_API_URL  - base URL of The Coach deployment, e.g. https://the-coach.up.railway.app
 *   COACH_API_KEY  - a Coach API key (coach_sk_...) issued in The Coach's /developers page.
 * Best-effort and fire-and-forget: never throws, never blocks the grade-write path.
 */

export function coachPushConfigured(): boolean {
  return Boolean(process.env.COACH_API_URL && process.env.COACH_API_KEY);
}

export interface CatchUpPush {
  learnerEmail: string;
  learnerName?: string | null;
  examName?: string | null;
  gap: string;
  content: Array<{ title: string; body: string }>;
  planRationale?: string | null;
}

export async function pushCatchUpToCoach(
  input: CatchUpPush,
): Promise<{ ok: boolean; status?: number; error?: string; coachUrl?: string | null }> {
  if (!coachPushConfigured()) return { ok: false, error: "Coach push not configured (COACH_API_URL + COACH_API_KEY)." };
  if (!input.learnerEmail || !input.content?.length) return { ok: false, error: "learnerEmail + content required." };
  try {
    const base = process.env.COACH_API_URL!.replace(/\/$/, "");
    const res = await fetch(`${base}/api/v1/catch-up`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.COACH_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[coachPush] The Coach responded ${res.status}: ${body.slice(0, 300)}`);
      return { ok: false, status: res.status, error: body.slice(0, 300) };
    }
    // The Coach returns { ok, coachUrl, ... } — the magic link the learner opens to work the plan.
    const data = (await res.json().catch(() => ({}))) as { coachUrl?: string };
    return { ok: true, status: res.status, coachUrl: typeof data?.coachUrl === "string" ? data.coachUrl : null };
  } catch (e) {
    const error = (e as Error)?.message ?? String(e);
    console.warn(`[coachPush] push failed: ${error}`);
    return { ok: false, error };
  }
}
