import { db } from "@workspace/db";
import { partnersTable, organisationsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

/*
 * Seed for the "Educator Professional Development" demo partner: a separate practice-credentials
 * programme for educators, themed on integrating AI into teaching with pedagogical judgement. It reuses
 * the whole practice engine (adaptive cycle portfolio, Mutale, authenticity, calibrated review,
 * verifiable credentials, program insights, peer exemplars). Everyone is a composite.
 *
 * Grounded in adult learning theory: andragogy (self-directed, experience-based, problem-centred),
 * transformative learning (examining assumptions about AI), reflective practice, and communities of
 * practice (peer exemplars). Idempotent: finds-or-creates by natural key.
 */

const SLUG = "educator-pd";
export const EDU_DEMO_LEARNER_EMAIL = "demo.educator@edupd.test";
export const EDU_DEMO_ADMIN_EMAIL = "demo.admin@edupd.test";

async function firstOrNull<T>(rows: T[]): Promise<T | null> {
  return rows.length ? rows[0] : null;
}

export async function seedEducatorPD(): Promise<{ partnerId: string; demoLearnerId: string }> {
  let partner = await firstOrNull(await db.select().from(partnersTable).where(eq(partnersTable.slug, SLUG)));
  if (!partner) {
    [partner] = await db.insert(partnersTable).values({
      name: "Educator Professional Development", slug: SLUG, status: "active", contactEmail: "info@synops-consulting.com",
    }).returning();
  }

  let org = await firstOrNull(await db.select().from(organisationsTable).where(and(eq(organisationsTable.partnerId, partner.id), eq(organisationsTable.name, "Synops Educator Academy"))));
  if (!org) {
    [org] = await db.insert(organisationsTable).values({
      name: "Synops Educator Academy", partnerId: partner.id, industry: "Educator professional development",
    }).returning();
  }

  let faculty = await firstOrNull(await db.select().from(usersTable).where(eq(usersTable.email, "faculty@educator-pd.synops")));
  if (!faculty) {
    await db.insert(usersTable).values({
      email: "faculty@educator-pd.synops", firstName: "PD", lastName: "Faculty",
      role: "instructional_designer", status: "active", partnerId: partner.id, organisationId: org.id,
    });
  }

  // Demo admin (for the one-click demo tenant registry) and demo educator learner (persona: Maria Alvarez).
  let admin = await firstOrNull(await db.select().from(usersTable).where(eq(usersTable.email, EDU_DEMO_ADMIN_EMAIL)));
  if (!admin) {
    await db.insert(usersTable).values({
      email: EDU_DEMO_ADMIN_EMAIL, firstName: "Programme", lastName: "Lead",
      role: "partner_admin", status: "active", partnerId: partner.id, organisationId: org.id,
    });
  }

  let learner = await firstOrNull(await db.select().from(usersTable).where(eq(usersTable.email, EDU_DEMO_LEARNER_EMAIL)));
  if (!learner) {
    [learner] = await db.insert(usersTable).values({
      email: EDU_DEMO_LEARNER_EMAIL, firstName: "Maria", lastName: "Alvarez",
      role: "learner", status: "active", partnerId: partner.id, organisationId: org.id,
    }).returning();
  } else {
    await db.update(usersTable).set({ firstName: "Maria", lastName: "Alvarez" }).where(eq(usersTable.id, learner.id));
  }

  await db.update(partnersTable).set({ orgCount: 1 }).where(eq(partnersTable.id, partner.id));
  return { partnerId: partner.id, demoLearnerId: learner.id };
}
