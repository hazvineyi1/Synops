import {
  db,
  studyUsersTable,
  studyNotificationsTable,
  studyWeeklyBriefsTable,
  studyFlashcardsTable,
  type StudyUser,
} from "@workspace/paideia-db";
import { and, count, eq, gte, isNotNull, lte, ne, sql } from "drizzle-orm";
import { logger } from "../logger.js";
import { isWhatsAppConfigured, sendWhatsAppMessage } from "./whatsapp.js";

export type NotificationKind =
  | "welcome_platform"
  | "welcome_ambassador"
  | "renewal_reminder"
  | "brief_ready"
  | "review_nudge";

export interface NotifyOutcome {
  status: "sent" | "skipped" | "failed";
  reason?: string;
}

export interface RunSummary {
  kind: NotificationKind;
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
}

// Base URL for links inside messages. Prefers an explicit override, then the Replit
// dev domain. Empty string if neither is set (links are simply omitted).
function studyBaseUrl(): string {
  const explicit = process.env["STUDY_APP_URL"];
  if (explicit) return explicit.replace(/\/$/, "");
  const domain = process.env["REPLIT_DEV_DOMAIN"];
  if (domain) return `https://${domain}/study`;
  return "";
}

function link(path: string): string {
  const base = studyBaseUrl();
  return base ? `${base}${path}` : "";
}

// Send + log a single notification. Idempotent on dedupeKey: a row already written
// for that key short-circuits as "skipped: duplicate". Respects opt-in and explicitly
// records when WhatsApp is not yet configured rather than failing silently.
async function notifyUser(
  user: Pick<StudyUser, "id" | "whatsappNumber" | "whatsappOptIn">,
  kind: NotificationKind,
  body: string,
  dedupeKey: string,
): Promise<NotifyOutcome> {
  if (!user.whatsappOptIn) {
    return { status: "skipped", reason: "not_opted_in" };
  }
  if (!user.whatsappNumber) {
    return { status: "skipped", reason: "no_number" };
  }

  // Claim the dedupeKey first. The unique constraint makes this atomic across
  // concurrent runs: only one claimant proceeds, so the same logical notification
  // can never be sent twice. If the insert hits the constraint, a *successful* send
  // already holds the key (we release the key on every non-sent outcome below), so
  // an existing row means a real duplicate.
  const claimed = await db
    .insert(studyNotificationsTable)
    .values({
      userId: user.id,
      kind,
      toAddress: user.whatsappNumber,
      body,
      status: "queued",
      dedupeKey,
    })
    .onConflictDoNothing({ target: studyNotificationsTable.dedupeKey })
    .returning({ id: studyNotificationsTable.id });

  const row = claimed[0];
  if (!row) {
    return { status: "skipped", reason: "duplicate" };
  }

  // Not yet configured (the "connect later" steady state): release the claim by
  // removing the row so this notification is retried once Twilio is wired up. We do
  // not keep a row here to avoid piling up skipped rows on every batch run.
  if (!isWhatsAppConfigured()) {
    await db.delete(studyNotificationsTable).where(eq(studyNotificationsTable.id, row.id));
    return { status: "skipped", reason: "not_configured" };
  }

  try {
    const result = await sendWhatsAppMessage({ to: user.whatsappNumber, body });
    await db
      .update(studyNotificationsTable)
      .set({ status: "sent", providerRef: result.sid, sentAt: new Date() })
      .where(eq(studyNotificationsTable.id, row.id));
    return { status: "sent" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, userId: user.id, kind }, "whatsapp send failed");
    // Keep the row for audit but null out the dedupeKey so the unique slot is freed
    // and a later run can retry the send. Only successful sends retain the key.
    await db
      .update(studyNotificationsTable)
      .set({ status: "failed", reason: message.slice(0, 500), dedupeKey: null })
      .where(eq(studyNotificationsTable.id, row.id));
    return { status: "failed", reason: message };
  }
}

function tally(outcomes: NotifyOutcome[], kind: NotificationKind): RunSummary {
  return {
    kind,
    processed: outcomes.length,
    sent: outcomes.filter((o) => o.status === "sent").length,
    skipped: outcomes.filter((o) => o.status === "skipped").length,
    failed: outcomes.filter((o) => o.status === "failed").length,
  };
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function dayStamp(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Renewal reminders ───
// Mobile money does not auto-charge, so manually-renewing paid users get a heads-up
// before their period ends. Card (auto-renew) users are skipped. Window: next `days`.
export async function runRenewalReminders(days = 3): Promise<RunSummary> {
  const now = new Date();
  const until = new Date(now);
  until.setDate(until.getDate() + days);

  const users = await db
    .select()
    .from(studyUsersTable)
    .where(
      and(
        eq(studyUsersTable.whatsappOptIn, true),
        isNotNull(studyUsersTable.whatsappNumber),
        eq(studyUsersTable.autoRenew, false),
        ne(studyUsersTable.subscriptionTier, "free"),
        eq(studyUsersTable.subscriptionStatus, "active"),
        isNotNull(studyUsersTable.subscriptionCurrentPeriodEnd),
        gte(studyUsersTable.subscriptionCurrentPeriodEnd, now),
        lte(studyUsersTable.subscriptionCurrentPeriodEnd, until),
      ),
    );

  const outcomes: NotifyOutcome[] = [];
  for (const user of users) {
    const end = user.subscriptionCurrentPeriodEnd!;
    const tierLabel = user.subscriptionTier === "pro" ? "Pro" : "Plus";
    const renewUrl = link("/upgrade");
    const body =
      `Hi ${user.name}, your Synops ${tierLabel} plan ends on ${fmtDate(end)}. ` +
      `Mobile money does not renew automatically, so renew now to keep your access` +
      (renewUrl ? `: ${renewUrl}` : ".");
    const dedupeKey = `renewal:${user.id}:${dayStamp(end)}`;
    outcomes.push(await notifyUser(user, "renewal_reminder", body, dedupeKey));
  }
  return tally(outcomes, "renewal_reminder");
}

// ─── Weekly brief ready ───
// Pings users whose weekly brief was generated recently (default last 2 days). Dedupes
// per brief id so each brief is announced at most once.
export async function runBriefReady(sinceDays = 2): Promise<RunSummary> {
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);

  const rows = await db
    .select({
      briefId: studyWeeklyBriefsTable.id,
      generatedAt: studyWeeklyBriefsTable.generatedAt,
      user: studyUsersTable,
    })
    .from(studyWeeklyBriefsTable)
    .innerJoin(studyUsersTable, eq(studyWeeklyBriefsTable.userId, studyUsersTable.id))
    .where(
      and(
        gte(studyWeeklyBriefsTable.generatedAt, since),
        eq(studyUsersTable.whatsappOptIn, true),
        isNotNull(studyUsersTable.whatsappNumber),
      ),
    );

  const outcomes: NotifyOutcome[] = [];
  for (const { briefId, user } of rows) {
    const briefUrl = link("/briefs");
    const body =
      `Hi ${user.name}, your weekly Synops study brief is ready. ` +
      `See your progress and what to focus on next` +
      (briefUrl ? `: ${briefUrl}` : ".");
    const dedupeKey = `brief:${briefId}`;
    outcomes.push(await notifyUser(user, "brief_ready", body, dedupeKey));
  }
  return tally(outcomes, "brief_ready");
}

// ─── Review nudges ───
// Users with flashcards due (nextReviewAt <= now) get one nudge per day. The due count
// comes from the same spaced-repetition schedule the app already maintains.
export async function runReviewNudges(): Promise<RunSummary> {
  const now = new Date();

  const due = await db
    .select({
      userId: studyFlashcardsTable.userId,
      dueCount: count(studyFlashcardsTable.id),
    })
    .from(studyFlashcardsTable)
    .innerJoin(studyUsersTable, eq(studyFlashcardsTable.userId, studyUsersTable.id))
    .where(
      and(
        isNotNull(studyFlashcardsTable.nextReviewAt),
        lte(studyFlashcardsTable.nextReviewAt, now),
        eq(studyUsersTable.whatsappOptIn, true),
        isNotNull(studyUsersTable.whatsappNumber),
      ),
    )
    .groupBy(studyFlashcardsTable.userId);

  const outcomes: NotifyOutcome[] = [];
  for (const group of due) {
    if (group.dueCount < 1) continue;
    const [user] = await db
      .select()
      .from(studyUsersTable)
      .where(eq(studyUsersTable.id, group.userId))
      .limit(1);
    if (!user) continue;

    const reviewUrl = link("/flashcards");
    const plural = group.dueCount === 1 ? "flashcard" : "flashcards";
    const body =
      `Hi ${user.name}, you have ${group.dueCount} ${plural} ready for review today. ` +
      `A quick session keeps your streak going` +
      (reviewUrl ? `: ${reviewUrl}` : ".");
    const dedupeKey = `review:${user.id}:${dayStamp(now)}`;
    outcomes.push(await notifyUser(user, "review_nudge", body, dedupeKey));
  }
  return tally(outcomes, "review_nudge");
}

// ─── Welcome messages ───
// Both are fired best-effort at the first reachable moment (signup, opt-in, or
// program join). notifyUser is idempotent on the per-user dedupeKey, so each
// welcome is delivered at most once ever no matter how many triggers fire.

// Welcomes a new learner to the platform and explains how to use it. Safe to call
// even before the user has a WhatsApp number on file: it simply skips until they
// are reachable, then the next trigger sends it.
export async function sendPlatformWelcome(
  user: Pick<StudyUser, "id" | "name" | "whatsappNumber" | "whatsappOptIn">,
): Promise<NotifyOutcome> {
  const startUrl = link("");
  const body =
    `Hi ${user.name}, welcome to Synops. Here is how it works: pick a topic or upload your ` +
    `study material and Synops turns it into guided lessons, practice questions, and flashcards. ` +
    `Study a little each day, review the cards that are due, and your weekly brief shows what to ` +
    `focus on next. Jump back in any time` +
    (startUrl ? `: ${startUrl}` : ".");
  return notifyUser(user, "welcome_platform", body, `welcome_platform:${user.id}`);
}

// Welcomes a new ambassador and explains how to earn (referrals) and keep learning.
// Pulls the live rate schedule, holdback, and cash-out increment so the message
// always reflects current program settings.
export async function sendAmbassadorWelcome(
  user: Pick<StudyUser, "id" | "name" | "whatsappNumber" | "whatsappOptIn">,
): Promise<NotifyOutcome> {
  const { getAmbassadorSettings } = await import("../billing/ambassador.js");
  const settings = await getAmbassadorSettings();
  const rates = settings.schedule.map((b) => `${b.ratePct}%`).join(", ");
  const increment = `${(settings.cashoutIncrementUsdMinor / 100).toFixed(0)} USD`;
  const dashUrl = link("/ambassador");
  const body =
    `Hi ${user.name}, welcome to the Synops ambassador program. Here is how to earn and learn: ` +
    `share your referral link with other learners, and when they pay for a plan you earn a share ` +
    `of every real payment they make. Your commission is ${rates} and tapers over time, earnings ` +
    `clear after a ${settings.holdbackDays} day holdback, and you can cash out in ${increment} ` +
    `increments. Keep studying on Synops while you earn` +
    (dashUrl ? `. Your dashboard: ${dashUrl}` : ".");
  return notifyUser(user, "welcome_ambassador", body, `welcome_ambassador:${user.id}`);
}

// Recent notification log, newest first.
export async function recentNotifications(limit = 100) {
  return db
    .select()
    .from(studyNotificationsTable)
    .orderBy(sql`${studyNotificationsTable.createdAt} desc`)
    .limit(limit);
}
