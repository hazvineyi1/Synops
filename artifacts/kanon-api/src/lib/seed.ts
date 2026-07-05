import { eq, and, isNull, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  organizationsTable,
  clientsTable,
  projectsTable,
  coursesTable,
  classesTable,
  modulesTable,
  allocationsTable,
  objectivesTable,
  assessmentsTable,
  activitiesTable,
  ledgerEntriesTable,
  qaChecksTable,
  intakeProgressTable,
  crosswalkLinksTable,
  projectTimeEntriesTable,
  meetingRecordingsTable,
  projectMeetingsTable,
  meetingActionItemsTable,
  meetingDecisionsTable,
  meetingOpenQuestionsTable,
  projectCorrespondenceTable,
  auditEventsTable,
  impersonationEventsTable,
  standardsFrameworksTable,
  standardCompetenciesTable,
} from "@workspace/kanon-db";
import { BUILTIN_FRAMEWORKS, domainLabel } from "@workspace/kanon-evidence-packet";
import { hashPassword } from "./auth";

interface MinimalLogger {
  info: (obj: object, msg?: string) => void;
}

// The consulting firm's own tenant. The curriculum tree built by internal staff
// roots here; every pre-multi-tenancy client and compass user belongs to it.
const INTERNAL_ORG_SLUG = "synops-internal";
// Former demo school slug -- removed; kept as a constant so the prune can clean it up.
const DEMO_SCHOOL_SLUG = "demo-academy";

const DEMO_DOMAIN = "demo.synops.test";
// Dev-only shared password for every seeded example account. Documented in the
// project README; never used in production (this seed is skipped there).
const DEMO_PASSWORD = "Demo!2345";

// The example accounts allowed to exist in dev. Any other account is pruned.
const EXAMPLE_EMAILS = [
  `super-admin@${DEMO_DOMAIN}`,
  `school-admin@${DEMO_DOMAIN}`,
  `builder@${DEMO_DOMAIN}`,
];

/**
 * Dev-only: clear all Compass curriculum content and remove surplus demo accounts
 * and orgs, leaving only the two example accounts and the internal org. Runs at
 * startup before the seed functions so the DB is in a known-clean state on every
 * boot. Skipped in production.
 *
 * Deletion order is leaf-to-root to avoid FK conflicts should constraints ever be
 * added. Standards frameworks and competencies are shared/global and are left alone.
 */
export async function pruneDevData(log: MinimalLogger): Promise<void> {
  if (process.env.NODE_ENV === "production") return;

  // Opt-in only. By default dev curriculum work PERSISTS across restarts so the
  // builder pipeline can be tested without losing data on every workflow reboot.
  // Set COMPASS_DEV_RESET=1 to wipe back to a clean slate (e.g. before a demo).
  if (process.env.COMPASS_DEV_RESET !== "1") {
    log.info({}, "Dev data prune skipped (set COMPASS_DEV_RESET=1 to reset to a clean slate)");
    return;
  }

  // 1. Curriculum leaf tables (meeting children, then project/course children)
  await db.delete(meetingRecordingsTable);
  await db.delete(meetingActionItemsTable);
  await db.delete(meetingDecisionsTable);
  await db.delete(meetingOpenQuestionsTable);
  await db.delete(projectCorrespondenceTable);
  await db.delete(projectMeetingsTable);
  await db.delete(auditEventsTable);
  await db.delete(impersonationEventsTable);
  await db.delete(ledgerEntriesTable);
  await db.delete(projectTimeEntriesTable);
  await db.delete(qaChecksTable);
  await db.delete(intakeProgressTable);
  await db.delete(crosswalkLinksTable);
  await db.delete(activitiesTable);
  await db.delete(assessmentsTable);
  await db.delete(objectivesTable);
  await db.delete(modulesTable);
  await db.delete(classesTable);
  await db.delete(allocationsTable);
  // 2. Curriculum tree
  await db.delete(coursesTable);
  await db.delete(projectsTable);
  await db.delete(clientsTable);
  // 3. Remove all user accounts. ensureDemoUsers recreates the two example
  //    accounts with the correct role, org, and password on every boot, so
  //    deleting all users here guarantees a canonical state regardless of
  //    what org IDs or roles existed in the previous DB.
  const deleted = await db
    .delete(usersTable)
    .returning({ email: usersTable.email });
  if (deleted.length > 0) {
    log.info({ count: deleted.length }, "Pruned all user accounts for clean-slate boot");
  }
  // 4. Remove the former demo-academy org if it still exists
  const deletedOrgs = await db
    .delete(organizationsTable)
    .where(eq(organizationsTable.slug, DEMO_SCHOOL_SLUG))
    .returning({ slug: organizationsTable.slug });
  if (deletedOrgs.length > 0) {
    log.info({ slug: DEMO_SCHOOL_SLUG }, "Pruned demo-academy organization");
  }

  log.info({}, "Dev data pruned to clean slate");
}

/**
 * Idempotently ensure the internal organization exists and adopt any orphaned
 * tenancy rows. Runs in EVERY environment (production included) because the
 * curriculum engine cannot function without a tenant for internal staff:
 * `clients.organization_id` is NOT NULL and client creation copies the actor's
 * organization. Returns the internal org id for the demo seed to bind to.
 */
export async function ensureOrganizationsSeed(
  log: MinimalLogger,
): Promise<{ internalOrgId: number }> {
  let [internal] = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.slug, INTERNAL_ORG_SLUG));

  if (!internal) {
    [internal] = await db
      .insert(organizationsTable)
      .values({
        name: "Synops Consulting Group",
        slug: INTERNAL_ORG_SLUG,
        type: "internal",
        tagline: "Internal consulting tenant",
      })
      .returning({ id: organizationsTable.id });
    log.info({ id: internal.id }, "Seeded internal organization");
  }

  // Adopt any compass user who predates multi-tenancy (null org) into the
  // internal tenant so the internal-consulting flow keeps working after upgrade.
  // Global roles (admin/super_admin) bypass org checks, so this is harmless even
  // if one happens to be a compass user.
  const adopted = await db
    .update(usersTable)
    .set({ organizationId: internal.id })
    .where(and(eq(usersTable.productKey, "compass"), isNull(usersTable.organizationId)))
    .returning({ id: usersTable.id });
  if (adopted.length > 0) {
    log.info({ count: adopted.length }, "Adopted orphaned compass users into internal org");
  }

  // Defensive safety net for any client row left without a tenant. The column is
  // NOT NULL on a clean schema, so this normally matches nothing.
  await db
    .update(clientsTable)
    .set({ organizationId: internal.id })
    .where(isNull(clientsTable.organizationId));

  return { internalOrgId: internal.id };
}

/**
 * Idempotently seed exactly two example accounts for development:
 *   - one super_admin (global, no organization)
 *   - one builder (bound to the internal organization)
 *
 * Skipped entirely in production.
 */
export async function ensureDemoUsers(
  log: MinimalLogger,
  internalOrgId: number,
): Promise<void> {
  if (process.env.NODE_ENV === "production") return;

  interface DemoAccount {
    email: string;
    name: string;
    role: string;
    productKey: string;
    organizationId: number | null;
  }

  const accounts: DemoAccount[] = [
    {
      email: `super-admin@${DEMO_DOMAIN}`,
      name: "Super Admin",
      role: "super_admin",
      productKey: "compass",
      organizationId: null,
    },
    {
      // Organization-bound administrator: the primary "builder side" working
      // account. Unlike a global admin (no org), a school_admin can create
      // clients/projects directly in its own organization without choosing one.
      email: `school-admin@${DEMO_DOMAIN}`,
      name: "School Admin",
      role: "school_admin",
      productKey: "compass",
      organizationId: internalOrgId,
    },
    {
      email: `builder@${DEMO_DOMAIN}`,
      name: "Example Builder",
      role: "builder",
      productKey: "compass",
      organizationId: internalOrgId,
    },
  ];

  const emails = accounts.map((a) => a.email);
  const existing = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(inArray(usersTable.email, emails));
  const existingSet = new Set(existing.map((r) => r.email));

  const toCreate = accounts.filter((a) => !existingSet.has(a.email));

  if (toCreate.length > 0) {
    const passwordHash = await hashPassword(DEMO_PASSWORD);

    for (const acct of toCreate) {
      await db
        .insert(usersTable)
        .values({
          email: acct.email,
          passwordHash,
          name: acct.name,
          organization: "Synops Consulting Group",
          organizationId: acct.organizationId,
          role: acct.role,
          productKey: acct.productKey,
        });
    }

    log.info({ count: toCreate.length }, "Seeded example accounts");
  }
}

/**
 * Idempotently seed the shared, global standards catalog (the built-in accreditor
 * datasets: CCNE, ABET, AACSB, SACSCOC). Runs in EVERY environment because the
 * evidence packet and crosswalk features depend on the catalog existing. Matching
 * is by framework acronym and competency code, so re-running inserts nothing and
 * existing curriculum crosswalk links are never disturbed. The competency
 * descriptions are product-authored paraphrases, not verbatim copyrighted text.
 */
export async function ensureStandardsFrameworksSeed(log: MinimalLogger): Promise<void> {
  for (const fw of BUILTIN_FRAMEWORKS) {
    let [framework] = await db
      .select({ id: standardsFrameworksTable.id })
      .from(standardsFrameworksTable)
      .where(eq(standardsFrameworksTable.acronym, fw.acronym))
      .orderBy(standardsFrameworksTable.id);

    if (!framework) {
      [framework] = await db
        .insert(standardsFrameworksTable)
        .values({
          name: fw.name,
          acronym: fw.acronym,
          frameworkType: fw.frameworkType,
          description: fw.description,
        })
        .returning({ id: standardsFrameworksTable.id });
      log.info({ id: framework.id, acronym: fw.acronym }, "Seeded standards framework");
    }

    const existing = await db
      .select({ code: standardCompetenciesTable.code })
      .from(standardCompetenciesTable)
      .where(eq(standardCompetenciesTable.frameworkId, framework.id));
    const existingCodes = new Set(existing.map((r) => r.code));

    const toInsert: { frameworkId: number; code: string; description: string; domain: string }[] = [];
    for (const domain of fw.domains) {
      for (const comp of domain.competencies) {
        if (existingCodes.has(comp.code)) continue;
        toInsert.push({
          frameworkId: framework.id,
          code: comp.code,
          description: comp.description,
          domain: domainLabel(domain),
        });
      }
    }

    if (toInsert.length > 0) {
      await db.insert(standardCompetenciesTable).values(toInsert);
      log.info({ count: toInsert.length, acronym: fw.acronym }, "Seeded competencies");
    }
  }
}
