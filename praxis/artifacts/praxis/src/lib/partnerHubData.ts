/**
 * Partner Hub - seeded data layer.
 *
 * The Partner Hub (Financial Hub, Funders Hub, Accounts & Roles, unified Audit Log) is an
 * exemplar administrative surface built for review against the v0.1 functional spec. Per
 * that pass's decision it runs on SEEDED data, not live money rails: there is no payment
 * gateway, SARS/VAT integration, or funder KYC yet -- those need credentials and the spec's
 * Open Decisions confirmed. Everything here is realistic and internally consistent (ZAR,
 * real SA SETAs, the platform's real partner/org ids) so the screens behave like the real
 * thing while the integrations are still to be wired.
 *
 * Data is keyed by the platform's actual partner ids (partner_talentforge / partner_skillbridge)
 * and their real organisations, so a partner_admin sees only their own tenant's figures.
 */

export const ZAR = (n: number) =>
  'R' + n.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
export const ZAR2 = (n: number) =>
  'R' + n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const VAT_RATE = 0.15; // South African VAT

export type Plan = { id: string; name: string; pricePerSeat: number; cycle: 'monthly' | 'annual' };
export type OrgSubscription = { orgId: string; orgName: string; planId: string; seats: number; activeSeats: number };
export type Invoice = {
  id: string; number: string; orgName: string; period: string;
  net: number; status: 'paid' | 'due' | 'overdue'; issued: string; due: string;
};
export type Disbursement = {
  id: string; funder: string; orgName: string; seats: number; amount: number;
  status: 'received' | 'scheduled' | 'pending'; date: string;
};
export type FunderAgreement = {
  id: string; funder: string; funderType: string; scopeOrgs: string[]; seatsFunded: number;
  value: number; start: string; expiry: string; conditions: string[]; status: 'active' | 'pending' | 'expiring';
};
export type SeatAllocation = { id: string; funder: string; orgName: string; allocated: number; used: number };
export type Account = {
  id: string; name: string; email: string; role: 'coach' | 'org_admin'; orgName: string;
  status: 'active' | 'invited' | 'suspended'; lastActive: string;
};
export type Invite = { id: string; email: string; role: 'coach' | 'org_admin'; orgName: string; sentAt: string };
export type AuditCategory = 'account' | 'financial' | 'funder' | 'impersonation' | 'branding';
export type AuditEntry = {
  id: string; at: string; actor: string; actorRole: string; action: string;
  resource: string; category: AuditCategory; detail: string;
};
export type ImpersonationSession = {
  id: string; admin: string; target: string; org: string; startedAt: string;
  durationMin: number; reason: string; active: boolean;
};
export type DocCategory = 'invoice' | 'contract' | 'funder' | 'compliance' | 'other';
export type PartnerDoc = {
  id: string; name: string; category: DocCategory; orgName: string | null;
  status: 'filed' | 'pending' | 'action-required'; uploadedAt: string; size: string;
};
export type LoginEvent = { at: string; ip: string; device: string; ok: boolean };
export type DelegatedAdmin = {
  id: string; name: string; email: string; orgName: string;
  powers: string[]; status: 'active' | 'invited'; addedAt: string;
};

/**
 * The powers a main (partner) admin can hand to a junior/org admin. A delegated admin is
 * scoped to exactly one organisation and can do only what is ticked here -- everything else,
 * and every OTHER organisation, stays invisible to them. Partner-wide surfaces (Financial
 * Hub, Funders Hub, other orgs, delegation itself) are never delegatable.
 */
export const DELEGATABLE_POWERS = [
  { key: 'learners', label: 'Manage learners', help: 'Enrol, remove and view learners in the org' },
  { key: 'coaches', label: 'Manage coaches', help: 'Assign and manage the org’s coaches' },
  { key: 'catalog', label: 'Manage course catalog', help: 'Choose which courses the org runs' },
  { key: 'gradebook', label: 'View gradebook', help: 'See progress and grades for the org' },
  { key: 'sessions', label: 'Manage sessions & attendance', help: 'Schedule sessions, mark attendance' },
  { key: 'reports', label: 'View reports', help: 'Read the org’s completion and outcome reports' },
  { key: 'invoices', label: 'View invoices (read-only)', help: 'See the org’s invoices, not pay them' },
  { key: 'documents', label: 'Upload org documents', help: 'File paperwork for this org only' },
] as const;

export interface PartnerHub {
  partnerId: string;
  partnerName: string;
  orgs: { id: string; name: string }[];
  plans: Plan[];
  subscriptions: OrgSubscription[];
  invoices: Invoice[];
  disbursements: Disbursement[];
  agreements: FunderAgreement[];
  allocations: SeatAllocation[];
  accounts: Account[];
  invites: Invite[];
  audit: AuditEntry[];
  impersonations: ImpersonationSession[];
  documents: PartnerDoc[];
  delegatedAdmins: DelegatedAdmin[];
}

const PLANS: Plan[] = [
  { id: 'plan_essential', name: 'Essential', pricePerSeat: 180, cycle: 'monthly' },
  { id: 'plan_growth', name: 'Growth', pricePerSeat: 240, cycle: 'monthly' },
  { id: 'plan_scale', name: 'Scale', pricePerSeat: 320, cycle: 'monthly' },
];

// ── TalentForge SA (telecoms: MTN + Vodacom) ─────────────────────────────────
const TALENTFORGE: PartnerHub = {
  partnerId: 'partner_talentforge',
  partnerName: 'TalentForge SA',
  orgs: [
    { id: 'org_mtn', name: 'MTN Skills Academy' },
    { id: 'org_vodacom', name: 'Vodacom Learning Centre' },
  ],
  plans: PLANS,
  subscriptions: [
    { orgId: 'org_mtn', orgName: 'MTN Skills Academy', planId: 'plan_growth', seats: 120, activeSeats: 96 },
    { orgId: 'org_vodacom', orgName: 'Vodacom Learning Centre', planId: 'plan_essential', seats: 80, activeSeats: 61 },
  ],
  invoices: [
    { id: 'inv1', number: 'TF-2026-0042', orgName: 'MTN Skills Academy', period: 'Jul 2026', net: 28800, status: 'paid', issued: '2026-07-01', due: '2026-07-15' },
    { id: 'inv2', number: 'TF-2026-0043', orgName: 'Vodacom Learning Centre', period: 'Jul 2026', net: 14400, status: 'due', issued: '2026-07-01', due: '2026-07-31' },
    { id: 'inv3', number: 'TF-2026-0037', orgName: 'MTN Skills Academy', period: 'Jun 2026', net: 28800, status: 'paid', issued: '2026-06-01', due: '2026-06-15' },
    { id: 'inv4', number: 'TF-2026-0031', orgName: 'Vodacom Learning Centre', period: 'May 2026', net: 14400, status: 'overdue', issued: '2026-05-01', due: '2026-05-31' },
  ],
  disbursements: [
    { id: 'dis1', funder: 'MICT SETA', orgName: 'MTN Skills Academy', seats: 40, amount: 96000, status: 'received', date: '2026-06-20' },
    { id: 'dis2', funder: 'MTN Foundation (CSI)', orgName: 'MTN Skills Academy', seats: 25, amount: 60000, status: 'scheduled', date: '2026-08-01' },
    { id: 'dis3', funder: 'NSFAS', orgName: 'Vodacom Learning Centre', seats: 30, amount: 72000, status: 'pending', date: '2026-08-15' },
  ],
  agreements: [
    { id: 'ag1', funder: 'MICT SETA', funderType: 'SETA', scopeOrgs: ['MTN Skills Academy'], seatsFunded: 40, value: 384000, start: '2026-04-01', expiry: '2027-03-31', conditions: ['B-BBEE skills-development spend', 'Min. 70% completion', 'Quarterly WSP/ATR evidence'], status: 'active' },
    { id: 'ag2', funder: 'MTN Foundation (CSI)', funderType: 'Corporate CSI', scopeOrgs: ['MTN Skills Academy'], seatsFunded: 25, value: 180000, start: '2026-06-01', expiry: '2026-12-31', conditions: ['Youth (18-34)', 'Impact report per quarter'], status: 'active' },
    { id: 'ag3', funder: 'NSFAS', funderType: 'Public', scopeOrgs: ['Vodacom Learning Centre'], seatsFunded: 30, value: 216000, start: '2026-08-01', expiry: '2027-07-31', conditions: ['Means-tested learners', 'NQF Level 3+'], status: 'pending' },
  ],
  allocations: [
    { id: 'al1', funder: 'MICT SETA', orgName: 'MTN Skills Academy', allocated: 40, used: 38 },
    { id: 'al2', funder: 'MTN Foundation (CSI)', orgName: 'MTN Skills Academy', allocated: 25, used: 19 },
    { id: 'al3', funder: 'NSFAS', orgName: 'Vodacom Learning Centre', allocated: 30, used: 0 },
  ],
  accounts: [
    { id: 'ac1', name: 'Thabo Dlamini', email: 'thabo.dlamini@mtn.com', role: 'org_admin', orgName: 'MTN Skills Academy', status: 'active', lastActive: '2026-07-17' },
    { id: 'ac2', name: 'Nomsa Khumalo', email: 'nomsa.khumalo@vodacom.com', role: 'org_admin', orgName: 'Vodacom Learning Centre', status: 'active', lastActive: '2026-07-16' },
    { id: 'ac3', name: 'Aisha Patel', email: 'aisha.patel@talentforge.co.za', role: 'coach', orgName: 'MTN Skills Academy', status: 'active', lastActive: '2026-07-18' },
    { id: 'ac4', name: 'Dev Maharaj', email: 'dev.maharaj@talentforge.co.za', role: 'coach', orgName: 'Vodacom Learning Centre', status: 'active', lastActive: '2026-07-15' },
  ],
  invites: [
    { id: 'iv1', email: 'lerato.mokoena@mtn.com', role: 'coach', orgName: 'MTN Skills Academy', sentAt: '2026-07-14' },
  ],
  audit: [
    { id: 'au1', at: '2026-07-18T09:12:00', actor: 'James Mokoena', actorRole: 'Partner Admin', action: 'invoice.mark_paid', resource: 'TF-2026-0042', category: 'financial', detail: 'MTN Skills Academy · Jul 2026 · R33 120 incl. VAT' },
    { id: 'au2', at: '2026-07-18T08:40:00', actor: 'James Mokoena', actorRole: 'Partner Admin', action: 'impersonation.start', resource: 'Thabo Dlamini', category: 'impersonation', detail: 'Support: reconciling seat count · notified org at start' },
    { id: 'au3', at: '2026-07-17T15:03:00', actor: 'James Mokoena', actorRole: 'Partner Admin', action: 'account.invite', resource: 'lerato.mokoena@mtn.com', category: 'account', detail: 'Coach · MTN Skills Academy' },
    { id: 'au4', at: '2026-07-16T11:20:00', actor: 'System', actorRole: 'System', action: 'disbursement.received', resource: 'MICT SETA', category: 'funder', detail: '40 seats · R96 000 · MTN Skills Academy' },
    { id: 'au5', at: '2026-07-15T10:05:00', actor: 'James Mokoena', actorRole: 'Partner Admin', action: 'branding.update', resource: 'theme_talentforge', category: 'branding', detail: 'Primary colour + credential title changed' },
    { id: 'au6', at: '2026-07-14T16:47:00', actor: 'James Mokoena', actorRole: 'Partner Admin', action: 'agreement.create', resource: 'NSFAS', category: 'funder', detail: '30 funded seats · Vodacom Learning Centre' },
  ],
  impersonations: [
    { id: 'im1', admin: 'James Mokoena', target: 'Thabo Dlamini', org: 'MTN Skills Academy', startedAt: '2026-07-18T08:40:00', durationMin: 12, reason: 'Reconciling seat count', active: false },
    { id: 'im2', admin: 'James Mokoena', target: 'Nomsa Khumalo', org: 'Vodacom Learning Centre', startedAt: '2026-07-11T13:22:00', durationMin: 8, reason: 'Verifying invoice dispute', active: false },
  ],
  documents: [
    { id: 'doc1', name: 'TF-2026-0042 Tax Invoice.pdf', category: 'invoice', orgName: 'MTN Skills Academy', status: 'filed', uploadedAt: '2026-07-01', size: '84 KB' },
    { id: 'doc2', name: 'MICT SETA Grant Agreement 2026-27.pdf', category: 'funder', orgName: 'MTN Skills Academy', status: 'filed', uploadedAt: '2026-04-01', size: '1.2 MB' },
    { id: 'doc3', name: 'MTN Master Services Agreement.pdf', category: 'contract', orgName: 'MTN Skills Academy', status: 'filed', uploadedAt: '2026-03-12', size: '640 KB' },
    { id: 'doc4', name: 'Vodacom SLA (renewal).docx', category: 'contract', orgName: 'Vodacom Learning Centre', status: 'action-required', uploadedAt: '2026-07-10', size: '210 KB' },
    { id: 'doc5', name: 'B-BBEE Skills Spend Evidence Q2.xlsx', category: 'compliance', orgName: 'MTN Skills Academy', status: 'pending', uploadedAt: '2026-07-14', size: '48 KB' },
    { id: 'doc6', name: 'NSFAS Means-Test Register.pdf', category: 'funder', orgName: 'Vodacom Learning Centre', status: 'pending', uploadedAt: '2026-07-15', size: '320 KB' },
  ],
  delegatedAdmins: [
    { id: 'da1', name: 'Thabo Dlamini', email: 'thabo.dlamini@mtn.com', orgName: 'MTN Skills Academy', powers: ['learners', 'coaches', 'catalog', 'gradebook', 'sessions', 'reports'], status: 'active', addedAt: '2026-05-02' },
    { id: 'da2', name: 'Nomsa Khumalo', email: 'nomsa.khumalo@vodacom.com', orgName: 'Vodacom Learning Centre', powers: ['learners', 'gradebook', 'reports'], status: 'active', addedAt: '2026-06-18' },
  ],
};

// ── SkillBridge Africa (retail: Shoprite) ────────────────────────────────────
const SKILLBRIDGE: PartnerHub = {
  partnerId: 'partner_skillbridge',
  partnerName: 'SkillBridge Africa',
  orgs: [{ id: 'org_shoprite', name: 'Shoprite Workforce Development' }],
  plans: PLANS,
  subscriptions: [
    { orgId: 'org_shoprite', orgName: 'Shoprite Workforce Development', planId: 'plan_scale', seats: 200, activeSeats: 173 },
  ],
  invoices: [
    { id: 'inv1', number: 'SB-2026-0088', orgName: 'Shoprite Workforce Development', period: 'Jul 2026', net: 64000, status: 'paid', issued: '2026-07-01', due: '2026-07-15' },
    { id: 'inv2', number: 'SB-2026-0079', orgName: 'Shoprite Workforce Development', period: 'Jun 2026', net: 64000, status: 'paid', issued: '2026-06-01', due: '2026-06-15' },
  ],
  disbursements: [
    { id: 'dis1', funder: 'W&RSETA', orgName: 'Shoprite Workforce Development', seats: 90, amount: 288000, status: 'received', date: '2026-06-28' },
    { id: 'dis2', funder: 'Services SETA', orgName: 'Shoprite Workforce Development', seats: 45, amount: 144000, status: 'scheduled', date: '2026-08-05' },
  ],
  agreements: [
    { id: 'ag1', funder: 'W&RSETA', funderType: 'SETA', scopeOrgs: ['Shoprite Workforce Development'], seatsFunded: 90, value: 1152000, start: '2026-04-01', expiry: '2027-03-31', conditions: ['B-BBEE skills spend', 'Min. 75% completion', 'Retail unit standards aligned', 'Quarterly WSP/ATR evidence'], status: 'active' },
    { id: 'ag2', funder: 'Services SETA', funderType: 'SETA', scopeOrgs: ['Shoprite Workforce Development'], seatsFunded: 45, value: 432000, start: '2026-05-01', expiry: '2026-10-31', conditions: ['Customer-service occupational qual.', 'POE evidence per learner'], status: 'expiring' },
  ],
  allocations: [
    { id: 'al1', funder: 'W&RSETA', orgName: 'Shoprite Workforce Development', allocated: 90, used: 84 },
    { id: 'al2', funder: 'Services SETA', orgName: 'Shoprite Workforce Development', allocated: 45, used: 41 },
  ],
  accounts: [
    { id: 'ac1', name: 'Sipho Nkosi', email: 'sipho.nkosi@shoprite.co.za', role: 'org_admin', orgName: 'Shoprite Workforce Development', status: 'active', lastActive: '2026-07-18' },
    { id: 'ac2', name: 'Lindiwe Zulu', email: 'lindiwe.zulu@skillbridge.co.za', role: 'coach', orgName: 'Shoprite Workforce Development', status: 'active', lastActive: '2026-07-18' },
  ],
  invites: [],
  audit: [
    { id: 'au1', at: '2026-07-18T10:30:00', actor: 'Sarah Williams', actorRole: 'Partner Admin', action: 'invoice.mark_paid', resource: 'SB-2026-0088', category: 'financial', detail: 'Shoprite Workforce Development · Jul 2026 · R73 600 incl. VAT' },
    { id: 'au2', at: '2026-07-17T09:15:00', actor: 'System', actorRole: 'System', action: 'disbursement.received', resource: 'W&RSETA', category: 'funder', detail: '90 seats · R288 000 · Shoprite Workforce Development' },
    { id: 'au3', at: '2026-07-16T14:02:00', actor: 'Sarah Williams', actorRole: 'Partner Admin', action: 'agreement.flag_expiring', resource: 'Services SETA', category: 'funder', detail: 'Expires 31 Oct 2026 · renewal review needed' },
    { id: 'au4', at: '2026-07-12T11:48:00', actor: 'Sarah Williams', actorRole: 'Partner Admin', action: 'impersonation.start', resource: 'Sipho Nkosi', category: 'impersonation', detail: 'Support: seat allocation query · notified org at start' },
  ],
  impersonations: [
    { id: 'im1', admin: 'Sarah Williams', target: 'Sipho Nkosi', org: 'Shoprite Workforce Development', startedAt: '2026-07-12T11:48:00', durationMin: 15, reason: 'Seat allocation query', active: false },
  ],
  documents: [
    { id: 'doc1', name: 'SB-2026-0088 Tax Invoice.pdf', category: 'invoice', orgName: 'Shoprite Workforce Development', status: 'filed', uploadedAt: '2026-07-01', size: '92 KB' },
    { id: 'doc2', name: 'W&RSETA Discretionary Grant 2026-27.pdf', category: 'funder', orgName: 'Shoprite Workforce Development', status: 'filed', uploadedAt: '2026-04-01', size: '1.4 MB' },
    { id: 'doc3', name: 'Shoprite Master Services Agreement.pdf', category: 'contract', orgName: 'Shoprite Workforce Development', status: 'filed', uploadedAt: '2026-02-20', size: '720 KB' },
    { id: 'doc4', name: 'Services SETA Renewal Notice.pdf', category: 'funder', orgName: 'Shoprite Workforce Development', status: 'action-required', uploadedAt: '2026-07-16', size: '180 KB' },
    { id: 'doc5', name: 'Retail Unit Standards POE Bundle.zip', category: 'compliance', orgName: 'Shoprite Workforce Development', status: 'pending', uploadedAt: '2026-07-13', size: '5.1 MB' },
  ],
  delegatedAdmins: [
    { id: 'da1', name: 'Sipho Nkosi', email: 'sipho.nkosi@shoprite.co.za', orgName: 'Shoprite Workforce Development', powers: ['learners', 'coaches', 'catalog', 'gradebook', 'sessions', 'reports', 'documents'], status: 'active', addedAt: '2026-04-10' },
  ],
};

const HUBS: Record<string, PartnerHub> = {
  partner_talentforge: TALENTFORGE,
  partner_skillbridge: SKILLBRIDGE,
};

/** Resolve the hub bundle for a partner id; falls back to TalentForge so the exemplar always renders. */
export function getPartnerHub(partnerId: string | null | undefined): PartnerHub {
  return (partnerId && HUBS[partnerId]) || TALENTFORGE;
}

/** Resolve the hub that OWNS a given organisation, so any viewer (incl. super admin) sees the right tenant. */
export function findHubByOrgId(orgId: string | null | undefined): PartnerHub | undefined {
  if (!orgId) return undefined;
  return Object.values(HUBS).find((h) => h.orgs.some((o) => o.id === orgId));
}

// ── Rollups for the Overview ─────────────────────────────────────────────────
export function financeRollup(h: PartnerHub) {
  const totalSeats = h.subscriptions.reduce((s, x) => s + x.seats, 0);
  const activeSeats = h.subscriptions.reduce((s, x) => s + x.activeSeats, 0);
  const mrrNet = h.subscriptions.reduce((s, x) => {
    const p = h.plans.find((pl) => pl.id === x.planId);
    return s + (p ? p.pricePerSeat * x.seats : 0);
  }, 0);
  const outstanding = h.invoices.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.net * (1 + VAT_RATE), 0);
  const overdue = h.invoices.filter((i) => i.status === 'overdue').length;
  return { totalSeats, activeSeats, mrrNet, mrrGross: mrrNet * (1 + VAT_RATE), outstanding, overdue };
}

/** Per-organisation rollup for the org-by-org drill-in. */
export function orgDetail(h: PartnerHub, orgId: string) {
  const org = h.orgs.find((o) => o.id === orgId);
  const sub = h.subscriptions.find((s) => s.orgId === orgId);
  const plan = sub ? h.plans.find((p) => p.id === sub.planId) : undefined;
  const name = org?.name ?? '';
  const coaches = h.accounts.filter((a) => a.role === 'coach' && a.orgName === name);
  const admins = h.accounts.filter((a) => a.role === 'org_admin' && a.orgName === name);
  const delegated = h.delegatedAdmins.filter((d) => d.orgName === name);
  const funders = h.agreements.filter((a) => a.scopeOrgs.includes(name));
  const allocations = h.allocations.filter((a) => a.orgName === name);
  const openInvoices = h.invoices.filter((i) => i.orgName === name && i.status !== 'paid').length;
  const docs = h.documents.filter((d) => d.orgName === name).length;
  return { org, name, sub, plan, coaches, admins, delegated, funders, allocations, openInvoices, docs };
}

/** Deterministic seeded login history for an account (functional stand-in for real audit). */
export function accountActivity(accountId: string, lastActive: string): LoginEvent[] {
  const base = new Date(lastActive + 'T09:00:00').getTime();
  const day = 86400000;
  const devices = ['Chrome · Windows', 'Safari · iPhone', 'Chrome · Android', 'Edge · Windows'];
  const seed = accountId.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  return Array.from({ length: 5 }).map((_, i) => ({
    at: new Date(base - i * day * (1 + (seed % 3))).toISOString(),
    ip: `41.${(seed + i * 7) % 200}.${(seed * 3 + i) % 200}.${(seed + i * 11) % 200}`,
    device: devices[(seed + i) % devices.length],
    ok: !(i === 3 && seed % 4 === 0),
  }));
}

// ── Org-scoped delivery seed (deterministic per org, so the org hub is self-contained) ───────
export type OrgCourse = { id: string; title: string; modality: 'Online' | 'Hybrid' | 'In-person'; enrolled: number; avgProgress: number; status: 'active' | 'draft' | 'archived' };
export type OrgLearner = {
  id: string; name: string; email: string; course: string; progress: number;
  status: 'on-track' | 'at-risk' | 'completed';
  // Org-level personal information (shown at org level, not inside a class):
  phone: string; whatsappOptIn: boolean; address: string; funder: string;
  enrolledVia: 'email' | 'whatsapp' | 'bulk'; enrolledAt: string; lastActive: string;
  // Rich learner record (SA training / SETA / B-BBEE realistic):
  dob: string; age: number; gender: string; idNumber: string; nationality: string;
  homeLanguage: string; populationGroup: string; disability: string;
  highestQualification: string; employmentStatus: string; jobTitle: string; employer: string;
  lifecycleStatus: 'Active' | 'On break' | 'Graduated' | 'Withdrawn';
  emergencyContact: string;
};
export type OrgStaffMember = { id: string; name: string; email: string; kind: 'admin' | 'coach' | 'facilitator' };
export type OrgCoachingSummary = { sections: number; coaches: number; onTrack: number; atRisk: number; avgHealth: number };
export type OrgGradebookSummary = { avgScore: number; submitted: number; pendingMarking: number; graded: number };

const COURSE_CATALOG = [
  'Customer Service Excellence', 'Digital Skills Foundations', 'Retail Operations', 'Team Leadership',
  'Financial Literacy at Work', 'Occupational Health & Safety', 'Data Handling & Reporting', 'Effective Communication',
];
const FIRST_NAMES = ['Thandeka', 'Bongani', 'Ayanda', 'Sizwe', 'Lerato', 'Kagiso', 'Naledi', 'Tebogo', 'Zanele', 'Mpho', 'Refilwe', 'Andile'];
const LAST_NAMES = ['Mokoena', 'Nkosi', 'Dlamini', 'Khumalo', 'Mahlangu', 'Zwane', 'Ndlovu', 'Sithole', 'Molefe', 'Botha', 'Naidoo', 'Pillay'];
const SA_SUBURBS = ['Soweto, Johannesburg', 'Umlazi, Durban', 'Khayelitsha, Cape Town', 'Mamelodi, Pretoria', 'Mdantsane, East London', 'Tembisa, Ekurhuleni', 'Seshego, Polokwane', 'Galeshewe, Kimberley'];
const SA_LANGUAGES = ['isiZulu', 'isiXhosa', 'Sepedi', 'Setswana', 'Sesotho', 'English', 'Afrikaans', 'Xitsonga', 'siSwati', 'Tshivenda'];
const POP_GROUPS = ['African', 'Coloured', 'Indian/Asian', 'White'];
const QUALIFICATIONS = ['Grade 10', 'Matric (NSC)', 'National Certificate (NQF 4)', 'Higher Certificate (NQF 5)', 'Diploma (NQF 6)', "Bachelor's Degree (NQF 7)"];
const EMPLOYMENT_STATUS = ['Employed', 'Unemployed', 'Self-employed', 'Student / Learner'];
const JOB_BY_STATUS: Record<string, string[]> = {
  Employed: ['Retail Assistant', 'Call Centre Agent', 'Administrator', 'Cashier', 'Warehouse Clerk', 'Team Leader'],
  Unemployed: ['Not currently employed'],
  'Self-employed': ['Spaza Shop Owner', 'Freelance Bookkeeper', 'Hairdresser', 'Street Vendor'],
  'Student / Learner': ['Full-time Learner'],
};
const DISABILITIES = ['None', 'None', 'None', 'None', 'Visual impairment', 'Hearing impairment', 'Physical (mobility)'];

function seedOf(s: string) { return s.split('').reduce((a, c) => a + c.charCodeAt(0), 0); }

/** Courses delivered for an organisation, derived deterministically from its seat count. */
export function orgCourses(h: PartnerHub, orgId: string): OrgCourse[] {
  const d = orgDetail(h, orgId);
  const seed = seedOf(orgId);
  const total = d.sub?.seats ?? 30;
  const n = 3 + (seed % 3); // 3–5 courses
  return Array.from({ length: n }).map((_, i) => {
    const title = COURSE_CATALOG[(seed + i) % COURSE_CATALOG.length];
    const enrolled = Math.max(6, Math.round((total / n) * (0.7 + ((seed + i) % 5) / 10)));
    const modality = (['Online', 'Hybrid', 'In-person'] as const)[(seed + i) % 3];
    const status = (i === n - 1 && seed % 4 === 0 ? 'draft' : 'active') as OrgCourse['status'];
    return { id: `${orgId}_c${i}`, title, modality, enrolled, avgProgress: 45 + ((seed + i * 13) % 50), status };
  });
}

/** A sample learner roster for an organisation (display sample; totals come from seats). */
export function orgLearners(h: PartnerHub, orgId: string, sample = 12): OrgLearner[] {
  const seed = seedOf(orgId);
  const courses = orgCourses(h, orgId);
  const d = orgDetail(h, orgId);
  const funderNames = d.funders.length ? d.funders.map((f) => f.funder) : ['Self-funded'];
  const via = (['email', 'whatsapp', 'bulk'] as const);
  return Array.from({ length: sample }).map((_, i) => {
    const fn = FIRST_NAMES[(seed + i) % FIRST_NAMES.length];
    const ln = LAST_NAMES[(seed * 2 + i * 3) % LAST_NAMES.length];
    const progress = 20 + ((seed + i * 17) % 80);
    const status: OrgLearner['status'] = progress >= 95 ? 'completed' : progress < 40 ? 'at-risk' : 'on-track';
    const phoneTail = String(1000000 + ((seed * 7919 + i * 6113) % 8999999)).slice(0, 7);
    const dayOff = (seed + i * 11) % 60;
    const age = 18 + ((seed + i * 13) % 30); // 18–47
    const birthYear = 2026 - age;
    const bm = 1 + ((seed + i * 7) % 12);
    const bd = 1 + ((seed + i * 5) % 28);
    const dob = `${birthYear}-${String(bm).padStart(2, '0')}-${String(bd).padStart(2, '0')}`;
    const gender = ((seed + i) % 2) === 0 ? 'Female' : 'Male';
    const idSeq = String(1000 + ((seed * 31 + i * 17) % 8999));
    const idNumber = `${String(birthYear).slice(2)}${String(bm).padStart(2, '0')}${String(bd).padStart(2, '0')}${idSeq}08${(seed + i) % 10}`;
    const empStatus = EMPLOYMENT_STATUS[(seed + i) % EMPLOYMENT_STATUS.length];
    const jobs = JOB_BY_STATUS[empStatus];
    const lifecycle = (['Active', 'Active', 'Active', 'On break', 'Graduated', 'Withdrawn'] as const)[(seed + i) % 6];
    return {
      id: `${orgId}_l${i}`, name: `${fn} ${ln}`,
      email: `${fn.toLowerCase()}.${ln.toLowerCase()}@learner.co.za`,
      course: courses[(seed + i) % courses.length].title, progress, status,
      phone: `+27 ${String(60 + ((seed + i) % 24)).slice(0, 2)} ${phoneTail.slice(0, 3)} ${phoneTail.slice(3)}`,
      whatsappOptIn: ((seed + i) % 3) !== 0,
      address: `${1 + ((seed + i * 3) % 200)} ${LAST_NAMES[(seed + i) % LAST_NAMES.length]} St, ${SA_SUBURBS[(seed + i) % SA_SUBURBS.length]}`,
      funder: funderNames[(seed + i) % funderNames.length],
      enrolledVia: via[(seed + i) % 3],
      enrolledAt: new Date(2026, 0, 1 + ((seed + i * 5) % 150)).toISOString().slice(0, 10),
      lastActive: new Date(Date.now() - dayOff * 86400000).toISOString().slice(0, 10),
      dob, age, gender, idNumber, nationality: ((seed + i) % 9) === 0 ? 'Zimbabwean' : 'South African',
      homeLanguage: SA_LANGUAGES[(seed + i) % SA_LANGUAGES.length],
      populationGroup: POP_GROUPS[(seed + i * 2) % POP_GROUPS.length],
      disability: DISABILITIES[(seed + i) % DISABILITIES.length],
      highestQualification: QUALIFICATIONS[(seed + i) % QUALIFICATIONS.length],
      employmentStatus: empStatus, jobTitle: jobs[(seed + i) % jobs.length],
      employer: empStatus === 'Employed' ? `${LAST_NAMES[(seed + i * 4) % LAST_NAMES.length]} Group` : '-',
      lifecycleStatus: lifecycle,
      emergencyContact: `${FIRST_NAMES[(seed + i * 6) % FIRST_NAMES.length]} ${ln} · +27 ${String(70 + ((seed + i) % 20)).slice(0, 2)} ${phoneTail.slice(0, 3)} ${phoneTail.slice(3)}`,
    };
  });
}

/** Assignable staff pool for an organisation: real org admins + coaches, plus seeded facilitators. */
export function orgStaff(h: PartnerHub, orgId: string): OrgStaffMember[] {
  const d = orgDetail(h, orgId);
  const seed = seedOf(orgId);
  const base: OrgStaffMember[] = [
    ...d.admins.map((a) => ({ id: a.id, name: a.name, email: a.email, kind: 'admin' as const })),
    ...d.coaches.map((a) => ({ id: a.id, name: a.name, email: a.email, kind: 'coach' as const })),
  ];
  const facilitators: OrgStaffMember[] = Array.from({ length: 3 }).map((_, i) => {
    const fn = FIRST_NAMES[(seed * 3 + i * 5) % FIRST_NAMES.length];
    const ln = LAST_NAMES[(seed + i * 7) % LAST_NAMES.length];
    return { id: `${orgId}_fac${i}`, name: `${fn} ${ln}`, email: `${fn.toLowerCase()}.${ln.toLowerCase()}@facilitator.co.za`, kind: 'facilitator' as const };
  });
  return [...base, ...facilitators];
}

/** Coaching health summary for an organisation. */
export function orgCoaching(h: PartnerHub, orgId: string): OrgCoachingSummary {
  const d = orgDetail(h, orgId);
  const seed = seedOf(orgId);
  const learners = d.sub?.activeSeats ?? 24;
  const atRisk = Math.round(learners * (0.1 + (seed % 3) / 20));
  return { sections: 2 + (seed % 3), coaches: Math.max(1, d.coaches.length), onTrack: learners - atRisk, atRisk, avgHealth: 72 + (seed % 20) };
}

export type OrgClass = { id: string; name: string; learners: number; coach: string };

/** Classes / cohorts within an organisation (deterministic), so courses can be assigned to a group. */
export function orgClasses(h: PartnerHub, orgId: string): OrgClass[] {
  const d = orgDetail(h, orgId);
  const seed = seedOf(orgId);
  const total = d.sub?.activeSeats ?? 24;
  const n = 2 + (seed % 2); // 2–3 classes
  const coachNames = d.coaches.length ? d.coaches.map((c) => c.name) : ['Assigned coach'];
  const labels = ['Morning Cohort', 'Afternoon Cohort', 'Evening Cohort'];
  return Array.from({ length: n }).map((_, i) => ({
    id: `${orgId}_cls${i}`,
    name: `${labels[i % labels.length]} ${2026}`,
    learners: Math.max(4, Math.round(total / n)),
    coach: coachNames[i % coachNames.length],
  }));
}

/** Gradebook summary for an organisation. */
export function orgGradebook(h: PartnerHub, orgId: string): OrgGradebookSummary {
  const seed = seedOf(orgId);
  const submitted = 40 + (seed % 60);
  const pendingMarking = seed % 12;
  return { avgScore: 68 + (seed % 22), submitted, pendingMarking, graded: submitted - pendingMarking };
}

export type ImpersonatableUser = { id: string; name: string; email: string; role: string; orgName: string };

/**
 * Everyone a partner admin may impersonate: every account across their organisations (org admins,
 * coaches), delegated admins and learners. The platform super admin is NOT a tenant account and is
 * never in this list - a partner admin can impersonate anyone in their organisation except the
 * super admin.
 */
export function impersonatableUsers(h: PartnerHub): ImpersonatableUser[] {
  const staff = h.accounts.map((a) => ({ id: a.id, name: a.name, email: a.email, role: a.role === 'org_admin' ? 'Org admin' : 'Coach', orgName: a.orgName }));
  const delegated = h.delegatedAdmins.map((d) => ({ id: d.id, name: d.name, email: d.email, role: 'Delegated admin', orgName: d.orgName }));
  const learners = h.orgs.flatMap((o) => orgLearners(h, o.id).map((l) => ({ id: l.id, name: l.name, email: l.email, role: 'Learner', orgName: o.name })));
  return [...staff, ...delegated, ...learners];
}

export function fundersRollup(h: PartnerHub) {
  const fundedSeats = h.agreements.reduce((s, a) => s + a.seatsFunded, 0);
  const funderValue = h.agreements.reduce((s, a) => s + a.value, 0);
  const received = h.disbursements.filter((d) => d.status === 'received').reduce((s, d) => s + d.amount, 0);
  const scheduled = h.disbursements.filter((d) => d.status !== 'received').reduce((s, d) => s + d.amount, 0);
  const expiring = h.agreements.filter((a) => a.status === 'expiring').length;
  const funders = new Set(h.agreements.map((a) => a.funder)).size;
  return { fundedSeats, funderValue, received, scheduled, expiring, funders };
}
