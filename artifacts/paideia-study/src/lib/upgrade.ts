// Detects the server's "upgrade_required" 402 (a free-tier limit was hit) and
// returns the human message, so callers can nudge the learner to the plans page.
export function upgradeError(err: unknown): { message: string } | null {
  const data = (err as { data?: { code?: string; error?: string } } | undefined)?.data;
  if (data && data.code === "upgrade_required") {
    return { message: data.error || "You've reached a free-tier limit. Upgrade to unlock more." };
  }
  return null;
}
