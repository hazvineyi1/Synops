import { db } from "@workspace/db";
import { partnersTable, organisationsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

/*
 * Seed for the "PEJ Justice Practice" demo partner: a practice-credentials programme for prosecutors and
 * investigators, drawn from the PEJ-EVD-01 objectives (documenting a conflict-related crime scene). It
 * reuses the whole practice engine (adaptive cycle portfolio, the coach "Mira", authenticity, calibrated
 * review, verifiable credentials, peer exemplars) exactly like the educator PD demo.
 *
 * DEMO ONLY. Everyone is a composite; initials are used for any named person. No real case material is
 * ever entered, and every legal claim is SME sign-off pending. Idempotent: finds-or-creates by natural key.
 */

const SLUG = "pej-practice";
// The demo ENTRY learner is a fresh investigator with no portfolio, so /demos/pej-practice starts from the
// very beginning. A separate SHOWCASE learner (O. Marchenko) carries a worked portfolio so the
// recognised-credential, verify and program-insights features still demo.
export const PEJ_DEMO_LEARNER_EMAIL = "demo.learner@pej-practice.test";
export const PEJ_SHOWCASE_LEARNER_EMAIL = "showcase.learner@pej-practice.test";
export const PEJ_DEMO_ADMIN_EMAIL = "demo.admin@pej-practice.test";

async function firstOrNull<T>(rows: T[]): Promise<T | null> {
  return rows.length ? rows[0] : null;
}

export async function seedPejPractice(): Promise<{ partnerId: string; demoLearnerId: string; showcaseLearnerId: string }> {
  let partner = await firstOrNull(await db.select().from(partnersTable).where(eq(partnersTable.slug, SLUG)));
  if (!partner) {
    [partner] = await db.insert(partnersTable).values({
      name: "PEJ Justice Practice", slug: SLUG, status: "active", contactEmail: "info@synops-consulting.com",
    }).returning();
  }

  let org = await firstOrNull(await db.select().from(organisationsTable).where(and(eq(organisationsTable.partnerId, partner.id), eq(organisationsTable.name, "Synops Justice Practice Academy"))));
  if (!org) {
    [org] = await db.insert(organisationsTable).values({
      name: "Synops Justice Practice Academy", partnerId: partner.id, industry: "Justice-sector professional development",
    }).returning();
  }

  let faculty = await firstOrNull(await db.select().from(usersTable).where(eq(usersTable.email, "faculty@pej-practice.synops")));
  if (!faculty) {
    await db.insert(usersTable).values({
      email: "faculty@pej-practice.synops", firstName: "PEJ", lastName: "Faculty",
      role: "instructional_designer", status: "active", partnerId: partner.id, organisationId: org.id,
    });
  }

  // Demo admin (for the one-click demo tenant registry).
  let admin = await firstOrNull(await db.select().from(usersTable).where(eq(usersTable.email, PEJ_DEMO_ADMIN_EMAIL)));
  if (!admin) {
    await db.insert(usersTable).values({
      email: PEJ_DEMO_ADMIN_EMAIL, firstName: "Programme", lastName: "Lead",
      role: "partner_admin", status: "active", partnerId: partner.id, organisationId: org.id,
    });
  }

  // Fresh entry learner (no portfolio): an investigator just starting out. Personalised on entry.
  let learner = await firstOrNull(await db.select().from(usersTable).where(eq(usersTable.email, PEJ_DEMO_LEARNER_EMAIL)));
  if (!learner) {
    [learner] = await db.insert(usersTable).values({
      email: PEJ_DEMO_LEARNER_EMAIL, firstName: "Sam", lastName: "Koval",
      role: "learner", status: "active", partnerId: partner.id, organisationId: org.id,
    }).returning();
  } else {
    await db.update(usersTable).set({ firstName: "Sam", lastName: "Koval" }).where(eq(usersTable.id, learner.id));
  }

  // Showcase learner (worked portfolio): O. Marchenko (composite).
  let showcase = await firstOrNull(await db.select().from(usersTable).where(eq(usersTable.email, PEJ_SHOWCASE_LEARNER_EMAIL)));
  if (!showcase) {
    [showcase] = await db.insert(usersTable).values({
      email: PEJ_SHOWCASE_LEARNER_EMAIL, firstName: "Olena", lastName: "Marchenko",
      role: "learner", status: "active", partnerId: partner.id, organisationId: org.id,
    }).returning();
  } else {
    await db.update(usersTable).set({ firstName: "Olena", lastName: "Marchenko" }).where(eq(usersTable.id, showcase.id));
  }

  await db.update(partnersTable).set({ orgCount: 1 }).where(eq(partnersTable.id, partner.id));
  return { partnerId: partner.id, demoLearnerId: learner.id, showcaseLearnerId: showcase.id };
}
