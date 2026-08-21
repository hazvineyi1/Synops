import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { sendMail, mailerConfigured } from "./mailer";

/*
 * Lightweight demo-access tracking + email notification. Records who opened a demo, from what IP and
 * device, when, and (via ping/end) how long they stayed, and emails a notification to the founder so it
 * lands on their phone. Best-effort throughout: tracking never blocks or breaks a demo sign-in.
 */

const NOTIFY = process.env.DEMO_NOTIFY_EMAIL || "hazvimusoni@gmail.com";
let ensured = false;

async function ensure(): Promise<void> {
  if (ensured) return;
  await db.execute(sql`CREATE TABLE IF NOT EXISTS demo_sessions (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_key text,
    visitor_name text,
    ip text,
    user_agent text,
    started_at timestamp NOT NULL DEFAULT now(),
    last_seen_at timestamp NOT NULL DEFAULT now(),
    ended_notified boolean NOT NULL DEFAULT false)`);
  ensured = true;
}

/** Record a demo access and email a "demo opened" notification. Returns the session id for ping/end. */
export async function startDemoSession(opts: { tenantKey: string; name?: string | null; ip?: string | null; ua?: string | null }): Promise<string | null> {
  try {
    await ensure();
    const r = await db.execute(sql`
      INSERT INTO demo_sessions (tenant_key, visitor_name, ip, user_agent)
      VALUES (${opts.tenantKey}, ${opts.name || null}, ${opts.ip || null}, ${opts.ua || null}) RETURNING id`);
    const id = (r.rows?.[0] as { id?: string } | undefined)?.id ?? null;
    if (mailerConfigured()) {
      const when = new Date().toLocaleString("en-GB", { timeZone: "UTC" }) + " UTC";
      const who = opts.name ? opts.name : "Someone";
      sendMail({
        to: NOTIFY,
        subject: `Demo opened: ${opts.tenantKey}${opts.name ? ` by ${opts.name}` : ""}`,
        html: `<p><strong>${who}</strong> just opened the <strong>${opts.tenantKey}</strong> demo.</p>
<ul><li>When: ${when}</li><li>IP: ${opts.ip || "unknown"}</li><li>Device: ${opts.ua || "unknown"}</li></ul>
<p>You will get a second note with time spent when they leave.</p>`,
        text: `${who} opened the ${opts.tenantKey} demo. When: ${when}. IP: ${opts.ip || "unknown"}.`,
      }).catch(() => { /* email is best-effort */ });
    }
    return id;
  } catch {
    return null;
  }
}

export async function pingDemoSession(id: string): Promise<void> {
  try { await ensure(); await db.execute(sql`UPDATE demo_sessions SET last_seen_at = now() WHERE id = ${id}`); } catch { /* ignore */ }
}

/** Mark a demo as ended and email a "time spent" notification (once). */
export async function endDemoSession(id: string): Promise<void> {
  try {
    await ensure();
    const r = await db.execute(sql`SELECT tenant_key, visitor_name, ip, started_at, ended_notified FROM demo_sessions WHERE id = ${id} LIMIT 1`);
    const row = r.rows?.[0] as { tenant_key: string; visitor_name: string | null; ip: string | null; started_at: string; ended_notified: boolean } | undefined;
    await db.execute(sql`UPDATE demo_sessions SET last_seen_at = now() WHERE id = ${id}`);
    if (!row || row.ended_notified) return;
    await db.execute(sql`UPDATE demo_sessions SET ended_notified = true WHERE id = ${id}`);
    if (mailerConfigured()) {
      const started = new Date(row.started_at).getTime();
      const ms = Math.max(0, Date.now() - started);
      const mins = Math.round(ms / 60000);
      const dur = mins >= 1 ? `${mins} min` : `${Math.round(ms / 1000)} sec`;
      const who = row.visitor_name || "A visitor";
      sendMail({
        to: NOTIFY,
        subject: `Demo ended: ${row.tenant_key}${row.visitor_name ? ` (${row.visitor_name})` : ""} - ${dur}`,
        html: `<p><strong>${who}</strong> finished the <strong>${row.tenant_key}</strong> demo.</p>
<ul><li>Time spent: ${dur}</li><li>IP: ${row.ip || "unknown"}</li></ul>`,
        text: `${who} finished the ${row.tenant_key} demo. Time spent: ${dur}. IP: ${row.ip || "unknown"}.`,
      }).catch(() => { /* best-effort */ });
    }
  } catch { /* best effort */ }
}
