import { db } from "@workspace/db";
import {
  partnersTable, brandThemesTable, organisationsTable, usersTable,
  coursePartnerAssignmentsTable, enrolmentsTable,
  orgClassesTable, orgClassCoursesTable, orgClassStaffTable,
  modulesTable, beatsTable, beatProgressTable,
} from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { hashPassword } from "../lib/auth";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

/**
 * Public demo tenant "Synops Demo" - a clone of the Enza partner used as the link we send to
 * investors and prospects at demo.synops-consulting.com. It reuses the platform's real courses
 * (assigned to Enza) so the catalogue is full, but stands on its own partner with its own graphite
 * + amber brand, its own organisation and cohort, and dedicated demo identities. Idempotent: safe
 * to re-run; it upserts rather than duplicating.
 *
 * The two fixed demo identities are also referenced by /auth/demo-login and the MFA exemption list.
 */
const DEMO_SLUG = "synops-demo";
const ENZA_SLUG = "enza-global";
const ORG_NAME = "Synops Demo Academy";
const CLASS_NAME = "Demo cohort (2026)";
const DEMO_PASSWORD = "SynopsDemo123";

export const DEMO_LEARNER_EMAIL = "demo.learner@synops-demo.test";
export const DEMO_ADMIN_EMAIL = "demo.admin@synops-demo.test";
export const DEMO_PARTNER_SLUG = DEMO_SLUG;

// Graphite + amber on greige - the chosen demo brand, deliberately distinct from Enza's lime.
const BRAND = {
  displayName: "Synops Demo",
  primaryColor: "#111827",   // graphite (headers/buttons; carries white text)
  secondaryColor: "#F0EDE8", // warm greige surface
  accentColor: "#B45309",    // amber accent
  logoUrl: null as string | null,   // no image -> the shell shows a clean "S" monogram
  faviconUrl: null as string | null,
  fontFamily: "Inter, system-ui, sans-serif",
  credentialTitle: "Synops Demo Certificate",
  emailSenderName: "Synops Demo",
};

function firstOrNull<T>(rows: T[]): T | null { return rows.length ? rows[0] : null; }

async function applyBrand(partnerId: string): Promise<void> {
  const fields = { ...BRAND, updatedAt: new Date() };
  const current = firstOrNull(await db.select().from(brandThemesTable).where(eq(brandThemesTable.tenantId, partnerId)));
  if (current) await db.update(brandThemesTable).set(fields).where(eq(brandThemesTable.tenantId, partnerId));
  else await db.insert(brandThemesTable).values({ ...fields, tenantId: partnerId, tenantType: "partner" });
}

async function upsertUser(u: {
  email: string; firstName: string; lastName: string;
  role: "partner_admin" | "org_admin" | "coach" | "learner"; partnerId: string; organisationId: string | null;
}): Promise<string> {
  const existing = firstOrNull(await db.select().from(usersTable).where(eq(usersTable.email, u.email)));
  const fields = {
    firstName: u.firstName, lastName: u.lastName, role: u.role, status: "active" as const,
    partnerId: u.partnerId, organisationId: u.organisationId, updatedAt: new Date(),
  };
  if (existing) {
    await db.update(usersTable).set(fields).where(eq(usersTable.id, existing.id));
    return existing.id;
  }
  const [created] = await db.insert(usersTable).values({
    email: u.email, passwordHash: hashPassword(DEMO_PASSWORD), ...fields,
  }).returning();
  return created.id;
}

export async function seedSynopsDemo(): Promise<{ ok: boolean; partnerId?: string; courses?: number; learners?: number; message: string }> {
  // 1. Partner (idempotent by slug) + brand.
  let partner = firstOrNull(await db.select().from(partnersTable).where(eq(partnersTable.slug, DEMO_SLUG)));
  if (!partner) {
    [partner] = await db.insert(partnersTable).values({
      name: "Synops Demo", slug: DEMO_SLUG, status: "active", contactEmail: "demo@synops-consulting.com",
    }).returning();
  }
  await applyBrand(partner.id);

  // 2. Organisation + cohort class.
  let org = firstOrNull(await db.select().from(organisationsTable)
    .where(and(eq(organisationsTable.partnerId, partner.id), eq(organisationsTable.name, ORG_NAME))));
  if (!org) [org] = await db.insert(organisationsTable).values({
    name: ORG_NAME, partnerId: partner.id, industry: "Enterprise and skills development",
  }).returning();

  let cls = firstOrNull(await db.select().from(orgClassesTable).where(eq(orgClassesTable.orgId, org.id)));
  if (!cls) [cls] = await db.insert(orgClassesTable).values({
    orgId: org.id, partnerId: partner.id, name: CLASS_NAME,
  }).returning();

  // 3. Reuse the platform courses assigned to Enza (same full catalogue), assigned to the demo partner.
  const enza = firstOrNull(await db.select().from(partnersTable).where(eq(partnersTable.slug, ENZA_SLUG)));
  const sourceCourseIds = enza
    ? (await db.select().from(coursePartnerAssignmentsTable).where(eq(coursePartnerAssignmentsTable.partnerId, enza.id))).map((a) => a.courseId)
    : [];
  const existingAssign = (await db.select().from(coursePartnerAssignmentsTable).where(eq(coursePartnerAssignmentsTable.partnerId, partner.id))).map((a) => a.courseId);
  const toAssign = sourceCourseIds.filter((id) => !existingAssign.includes(id));
  if (toAssign.length) await db.insert(coursePartnerAssignmentsTable).values(toAssign.map((courseId) => ({ partnerId: partner.id, courseId })));
  const courseIds = [...new Set([...existingAssign, ...sourceCourseIds])];
  const classCourseIds = courseIds.slice(0, 4);

  // Register the first few courses on the cohort class (skip any already linked).
  const linkedClassCourses = (await db.select().from(orgClassCoursesTable).where(eq(orgClassCoursesTable.classId, cls.id))).map((c) => c.courseId);
  const classCoursesToAdd = classCourseIds.filter((id) => !linkedClassCourses.includes(id));
  if (classCoursesToAdd.length) await db.insert(orgClassCoursesTable).values(classCoursesToAdd.map((courseId) => ({ classId: cls.id, courseId })));

  // 4. People: a demo admin, a coach, and learners including the headline "Demo Learner".
  // Partner-level admin so "Explore the admin view" lands on the full partner hub (organisations,
  // finance, funders, evidence, reports) rather than a single org.
  const adminId = await upsertUser({ email: DEMO_ADMIN_EMAIL, firstName: "Demo", lastName: "Admin", role: "partner_admin", partnerId: partner.id, organisationId: null });
  const coachId = await upsertUser({ email: "demo.coach@synops-demo.test", firstName: "Demo", lastName: "Coach", role: "coach", partnerId: partner.id, organisationId: org.id });
  const existingStaff = (await db.select().from(orgClassStaffTable).where(eq(orgClassStaffTable.classId, cls.id))).map((s) => s.staffId);
  const staffToAdd = [
    { classId: cls.id, staffId: coachId, role: "coach" as const },
    { classId: cls.id, staffId: adminId, role: "administrator" as const },
  ].filter((s) => !existingStaff.includes(s.staffId));
  if (staffToAdd.length) await db.insert(orgClassStaffTable).values(staffToAdd);

  // Pre-fetch each class course's ordered beats so we can pre-fill realistic learner progress.
  const courseBeats: Record<string, { beatId: string; moduleId: string }[]> = {};
  for (const courseId of classCourseIds) {
    const mods = await db.select().from(modulesTable).where(eq(modulesTable.courseId, courseId)).orderBy(asc(modulesTable.order));
    const flat: { beatId: string; moduleId: string }[] = [];
    for (const m of mods) {
      const bs = await db.select().from(beatsTable).where(eq(beatsTable.moduleId, m.id)).orderBy(asc(beatsTable.createdAt));
      for (const b of bs) flat.push({ beatId: b.id, moduleId: m.id });
    }
    courseBeats[courseId] = flat;
  }

  // Demo Learner sits mid-strong; the others spread across strong / on-track / off-track so the admin
  // dashboards show a realistic range on arrival. `progress` = fraction of each course's beats viewed.
  const learnerDefs = [
    { email: DEMO_LEARNER_EMAIL, firstName: "Demo", lastName: "Learner", progress: 0.70 },
    { email: "sam.demo@synops-demo.test", firstName: "Sam", lastName: "Ndlovu", progress: 0.50 },
    { email: "aisha.demo@synops-demo.test", firstName: "Aisha", lastName: "Patel", progress: 0.90 },
    { email: "thabo.demo@synops-demo.test", firstName: "Thabo", lastName: "Kekana", progress: 0.25 },
  ];
  let learnerCount = 0;
  for (let i = 0; i < learnerDefs.length; i++) {
    const l = learnerDefs[i];
    const learnerId = await upsertUser({ email: l.email, firstName: l.firstName, lastName: l.lastName, role: "learner", partnerId: partner.id, organisationId: org.id });
    learnerCount++;

    const already = (await db.select().from(enrolmentsTable).where(eq(enrolmentsTable.userId, learnerId))).map((e) => e.courseId);
    const enrolToAdd = classCourseIds.filter((cid) => !already.includes(cid));
    if (enrolToAdd.length) {
      await db.insert(enrolmentsTable).values(enrolToAdd.map((courseId) => ({ userId: learnerId, courseId, status: "active" as const, enrolledAt: daysAgo(40 - i * 4) })));
    }

    // Pre-fill progress: mark the first fraction of each course's beats as viewed.
    for (const courseId of classCourseIds) {
      const beats = courseBeats[courseId] ?? [];
      const viewCount = Math.round(beats.length * l.progress);
      if (viewCount <= 0) continue;
      const rows = beats.slice(0, viewCount).map((b, idx) => ({
        userId: learnerId, beatId: b.beatId, moduleId: b.moduleId, courseId,
        secondsSpent: 60 + (idx % 5) * 20,
        firstViewedAt: daysAgo(38 - i * 4), lastViewedAt: daysAgo(Math.max(1, 26 - i * 4)),
      }));
      try { await db.insert(beatProgressTable).values(rows).onConflictDoNothing(); } catch { /* progress is cosmetic */ }
    }
  }

  return {
    ok: true, partnerId: partner.id, courses: courseIds.length, learners: learnerCount,
    message: `Synops Demo ready: ${courseIds.length} courses, ${learnerCount} learners. Demo learner ${DEMO_LEARNER_EMAIL}, demo admin ${DEMO_ADMIN_EMAIL} (password ${DEMO_PASSWORD}).`,
  };
}
