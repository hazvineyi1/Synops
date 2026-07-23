import { db, usersTable } from "@workspace/db";
import { sql, inArray, count } from "drizzle-orm";

/**
 * Single source of truth for tenant member/learner counts.
 *
 * The denormalised partners.orgCount / partners.learnerCount /
 * organisations.memberCount columns are never recomputed on seed/enrol, so they
 * drift and different tabs showed different numbers for the same tenant. Every
 * surface now computes counts through these helpers so a partner's or an org's
 * count is identical wherever it appears (list card, detail, stats).
 */

/** Live member count (all roles) per organisation, for the given org ids. */
export async function orgMemberCounts(orgIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (orgIds.length === 0) return map;
  const rows = await db
    .select({ oid: usersTable.organisationId, c: count() })
    .from(usersTable)
    .where(inArray(usersTable.organisationId, orgIds))
    .groupBy(usersTable.organisationId);
  for (const r of rows) if (r.oid) map.set(r.oid, Number(r.c));
  return map;
}

/** Live member count (all roles) for one organisation. */
export async function orgMemberCount(orgId: string): Promise<number> {
  return (await orgMemberCounts([orgId])).get(orgId) ?? 0;
}

/**
 * Live org + learner counts per partner. A learner belongs to a partner directly
 * (users.partner_id) or through their organisation, and only role='learner' rows
 * count as learners - the same definition the partner list uses.
 */
export async function partnerCounts(): Promise<{
  orgs: Map<string, number>;
  learners: Map<string, number>;
}> {
  const orgs = new Map<string, number>();
  const learners = new Map<string, number>();
  const orgRows: { rows?: { pid: string; c: number }[] } = await db.execute(sql`
    SELECT partner_id AS pid, COUNT(*)::int AS c FROM organisations
    WHERE partner_id IS NOT NULL GROUP BY partner_id`);
  for (const r of orgRows.rows ?? []) orgs.set(r.pid, Number(r.c));
  const learnerRows: { rows?: { pid: string; c: number }[] } = await db.execute(sql`
    SELECT COALESCE(u.partner_id, o.partner_id) AS pid, COUNT(*)::int AS c
    FROM users u LEFT JOIN organisations o ON u.organisation_id = o.id
    WHERE u.role = 'learner' AND COALESCE(u.partner_id, o.partner_id) IS NOT NULL
    GROUP BY COALESCE(u.partner_id, o.partner_id)`);
  for (const r of learnerRows.rows ?? []) learners.set(r.pid, Number(r.c));
  return { orgs, learners };
}

/** Live counts for a single partner (matches the partner list definition). */
export async function partnerCount(partnerId: string): Promise<{ orgCount: number; learnerCount: number }> {
  const { orgs, learners } = await partnerCounts();
  return { orgCount: orgs.get(partnerId) ?? 0, learnerCount: learners.get(partnerId) ?? 0 };
}
