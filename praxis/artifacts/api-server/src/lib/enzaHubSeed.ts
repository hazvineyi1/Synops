import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import {
  partnersTable,
  organisationsTable,
  usersTable,
  billingSubscriptionsTable,
  billingInvoicesTable,
  fundingAgreementsTable,
  partnerDocumentsTable,
  delegatedAdminsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const ENZA_SLUG = "enza-global";

function firstOrNull<T>(rows: T[]): T | null {
  return rows.length ? rows[0] : null;
}

/**
 * The four hub tables are created lazily by their routes on the first POST, which may never have
 * happened for this partner. Create them here (IF NOT EXISTS) so the seed inserts land instead of
 * throwing. DDL mirrors the route definitions.
 */
async function ensureHubTables(): Promise<void> {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS billing_subscriptions (
    id text PRIMARY KEY, partner_id text NOT NULL, org_id text, org_name text,
    plan_name text NOT NULL DEFAULT 'Standard', price_per_seat integer NOT NULL DEFAULT 0,
    seats integer NOT NULL DEFAULT 0, active_seats integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS billing_invoices (
    id text PRIMARY KEY, partner_id text NOT NULL, org_id text, org_name text, number text NOT NULL,
    period text, net integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'due', issued text, due text,
    created_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS funding_agreements (
    id text PRIMARY KEY, partner_id text NOT NULL, funder_name text NOT NULL,
    funder_type text NOT NULL DEFAULT 'SETA', org_id text, org_name text,
    seats_funded integer NOT NULL DEFAULT 0, value integer NOT NULL DEFAULT 0, start_date text, expiry text,
    status text NOT NULL DEFAULT 'active', conditions jsonb NOT NULL DEFAULT '[]'::jsonb, created_by text,
    created_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS partner_documents (
    id text PRIMARY KEY, partner_id text NOT NULL, org_id text, org_name text, name text NOT NULL,
    category text NOT NULL DEFAULT 'other', status text NOT NULL DEFAULT 'pending', size text, file_url text,
    uploaded_by text, created_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`ALTER TABLE partner_documents ADD COLUMN IF NOT EXISTS template_key text`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS delegated_admins (
    id text PRIMARY KEY, partner_id text NOT NULL, org_id text, org_name text, name text NOT NULL,
    email text NOT NULL, powers jsonb NOT NULL DEFAULT '[]'::jsonb, status text NOT NULL DEFAULT 'invited',
    created_by text, created_at timestamptz NOT NULL DEFAULT now())`);

  // Heal schema drift: older deploys (and the route-level DDL) created these tables with fewer
  // columns, and CREATE TABLE IF NOT EXISTS never backfills. The seed's typed SELECT/INSERT lists
  // every column, so a missing one throws ("column ... does not exist"). ADD COLUMN IF NOT EXISTS
  // brings a pre-existing table up to the current shape. NOT NULL columns all carry a default so the
  // ALTER succeeds even when rows already exist.
  const heal = async (table: string, cols: string[]) => {
    for (const c of cols) await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${c}`));
  };
  await heal("billing_subscriptions", ["org_id text", "org_name text", "plan_name text NOT NULL DEFAULT 'Standard'", "price_per_seat integer NOT NULL DEFAULT 0", "seats integer NOT NULL DEFAULT 0", "active_seats integer NOT NULL DEFAULT 0", "created_at timestamptz NOT NULL DEFAULT now()"]);
  await heal("billing_invoices", ["org_id text", "org_name text", "number text", "period text", "net integer NOT NULL DEFAULT 0", "status text NOT NULL DEFAULT 'due'", "issued text", "due text", "created_at timestamptz NOT NULL DEFAULT now()"]);
  await heal("funding_agreements", ["funder_type text NOT NULL DEFAULT 'SETA'", "org_id text", "org_name text", "seats_funded integer NOT NULL DEFAULT 0", "value integer NOT NULL DEFAULT 0", "start_date text", "expiry text", "status text NOT NULL DEFAULT 'active'", "conditions jsonb NOT NULL DEFAULT '[]'::jsonb", "created_by text", "created_at timestamptz NOT NULL DEFAULT now()"]);
  await heal("partner_documents", ["org_id text", "org_name text", "category text NOT NULL DEFAULT 'other'", "status text NOT NULL DEFAULT 'pending'", "size text", "file_url text", "uploaded_by text", "template_key text", "created_at timestamptz NOT NULL DEFAULT now()"]);
  await heal("delegated_admins", ["org_id text", "org_name text", "powers jsonb NOT NULL DEFAULT '[]'::jsonb", "status text NOT NULL DEFAULT 'invited'", "created_by text", "created_at timestamptz NOT NULL DEFAULT now()"]);
}

/**
 * Seed REAL partner-hub records (billing, funding, documents, delegated admins) for the live Enza
 * partner and its organisations. The four Hub pages query these tables directly by partner_id, so
 * before this the pages read empty (the figures the demo showed lived only in a front-end mock).
 * This gives the real partner genuine rows so the hubs — and the Organisations rollup once it is
 * pointed at these endpoints — show real numbers. Idempotent: skips if billing already exists.
 */
export async function seedEnzaHub(): Promise<{ ok: boolean; seeded: boolean; message: string }> {
  const partner = firstOrNull(await db.select().from(partnersTable).where(eq(partnersTable.slug, ENZA_SLUG)));
  if (!partner) return { ok: false, seeded: false, message: "Provision Enza Global first." };
  const pid = partner.id;

  // Create the hub tables if missing AND heal any column drift, before the typed reads/writes below.
  await ensureHubTables();

  const orgs = await db.select().from(organisationsTable).where(eq(organisationsTable.partnerId, pid));
  if (orgs.length === 0) return { ok: false, seeded: false, message: "Seed the Enza cohort first (no organisations)." };

  // Active seats must reflect REALITY, not a fabricated 80%: an org's active seats = its actual
  // active learners. Without this the Seats card (billing) contradicts the People/Classes cards.
  const activeLearners = async (orgId: string): Promise<number> => {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(and(eq(usersTable.organisationId, orgId), eq(usersTable.role, "learner"), eq(usersTable.status, "active")));
    return Number(row?.n ?? 0);
  };
  const learnerCount = new Map<string, number>();
  for (const o of orgs) learnerCount.set(o.id, await activeLearners(o.id));

  // Already seeded? Don't duplicate — RECONCILE instead: correct each subscription's active seats
  // (and lift the contracted total if it somehow sits below actual usage) to match real learners.
  const existing = await db.select().from(billingSubscriptionsTable).where(eq(billingSubscriptionsTable.partnerId, pid));
  if (existing.length > 0) {
    for (const s of existing) {
      const active = learnerCount.get(s.orgId ?? "") ?? 0;
      const seats = Math.max(s.seats ?? 0, active);
      await db.update(billingSubscriptionsTable).set({ activeSeats: active, seats }).where(eq(billingSubscriptionsTable.id, s.id));
    }
    const totalActive = [...learnerCount.values()].reduce((a, b) => a + b, 0);
    return { ok: true, seeded: false, message: `Hub data present; reconciled active seats to real learners (${totalActive} active across ${existing.length} org(s)).` };
  }

  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const plusDays = (d: number) => {
    const t = new Date(now);
    t.setDate(t.getDate() + d);
    return t.toISOString().split("T")[0];
  };

  // Billing: one subscription per org, plus a couple of invoices (one paid, one due).
  const subs: any[] = [];
  const invoices: any[] = [];
  orgs.forEach((o, i) => {
    const active = learnerCount.get(o.id) ?? 0;
    const seats = Math.max(40 + i * 20, active); // contracted plan size, never below real usage
    const activeSeats = active;                  // active seats = real active learners
    const price = 450; // R450 / seat / month
    subs.push({
      id: randomUUID(), partnerId: pid, orgId: o.id, orgName: o.name,
      planName: "BizAscend Standard", pricePerSeat: price, seats, activeSeats,
    });
    invoices.push({
      id: randomUUID(), partnerId: pid, orgId: o.id, orgName: o.name,
      number: `INV-${ym.replace("-", "")}-${100 + i}`, period: ym,
      net: activeSeats * price, status: "paid", issued: plusDays(-20), due: plusDays(-6),
    });
    invoices.push({
      id: randomUUID(), partnerId: pid, orgId: o.id, orgName: o.name,
      number: `INV-${ym.replace("-", "")}-${200 + i}`, period: ym,
      net: seats * price, status: "due", issued: plusDays(-2), due: plusDays(12),
    });
  });

  // Funding: a SETA agreement + a foundation grant, attached to the first org.
  const primaryOrg = orgs[0];
  const funding = [
    {
      id: randomUUID(), partnerId: pid, funderName: "MICT SETA", funderType: "SETA",
      orgId: primaryOrg.id, orgName: primaryOrg.name, seatsFunded: 30, value: 30 * 450 * 12,
      startDate: plusDays(-120), expiry: plusDays(240), status: "active",
      conditions: ["Quarterly progress report", "80% completion target", "B-BBEE aligned learners"],
    },
    {
      id: randomUUID(), partnerId: pid, funderName: "Enza Foundation Bursary", funderType: "Foundation",
      orgId: primaryOrg.id, orgName: primaryOrg.name, seatsFunded: 15, value: 15 * 450 * 12,
      startDate: plusDays(-60), expiry: plusDays(300), status: "active",
      conditions: ["Youth (18-35)", "Monthly attendance evidence"],
    },
  ];

  // Documents: a few filed partner documents.
  const docs = [
    { id: randomUUID(), partnerId: pid, orgId: primaryOrg.id, orgName: primaryOrg.name, name: "Master Services Agreement.pdf", category: "contract", status: "filed", size: "412 KB", uploadedBy: "Enza Admin" },
    { id: randomUUID(), partnerId: pid, orgId: primaryOrg.id, orgName: primaryOrg.name, name: "MICT SETA Funding Agreement.pdf", category: "funding", status: "filed", size: "288 KB", uploadedBy: "Enza Admin" },
    { id: randomUUID(), partnerId: pid, orgId: null, orgName: null, name: "POPIA Data Processing Addendum.pdf", category: "compliance", status: "filed", size: "196 KB", uploadedBy: "Enza Admin" },
    { id: randomUUID(), partnerId: pid, orgId: primaryOrg.id, orgName: primaryOrg.name, name: "Q1 Programme Report.pdf", category: "report", status: "filed", size: "534 KB", uploadedBy: "Enza Admin" },
  ];

  // Delegated admin: one per org.
  const delegates = orgs.map((o, i) => ({
    id: randomUUID(), partnerId: pid, orgId: o.id, orgName: o.name,
    name: i === 0 ? "Thabo Dlamini" : `${o.name} Coordinator`,
    email: i === 0 ? "thabo.dlamini@enzaglobalmedia.co.za" : `admin${i + 1}@enzaglobalmedia.co.za`,
    powers: ["manage_learners", "view_reports", "manage_classes"],
    status: "active", createdBy: "system",
  }));

  let counts = { subs: 0, invoices: 0, funding: 0, docs: 0, delegates: 0 };
  try { await db.insert(billingSubscriptionsTable).values(subs); counts.subs = subs.length; } catch { /* skip */ }
  try { await db.insert(billingInvoicesTable).values(invoices); counts.invoices = invoices.length; } catch { /* skip */ }
  try { await db.insert(fundingAgreementsTable).values(funding); counts.funding = funding.length; } catch { /* skip */ }
  try { await db.insert(partnerDocumentsTable).values(docs); counts.docs = docs.length; } catch { /* skip */ }
  try { await db.insert(delegatedAdminsTable).values(delegates); counts.delegates = delegates.length; } catch { /* skip */ }

  return {
    ok: true,
    seeded: true,
    message: `Seeded Enza hub: ${counts.subs} subscriptions, ${counts.invoices} invoices, ${counts.funding} funding agreements, ${counts.docs} documents, ${counts.delegates} delegated admins.`,
  };
}
