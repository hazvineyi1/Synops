/**
 * Partner Hub — seeded data layer.
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
};

const HUBS: Record<string, PartnerHub> = {
  partner_talentforge: TALENTFORGE,
  partner_skillbridge: SKILLBRIDGE,
};

/** Resolve the hub bundle for a partner id; falls back to TalentForge so the exemplar always renders. */
export function getPartnerHub(partnerId: string | null | undefined): PartnerHub {
  return (partnerId && HUBS[partnerId]) || TALENTFORGE;
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

export function fundersRollup(h: PartnerHub) {
  const fundedSeats = h.agreements.reduce((s, a) => s + a.seatsFunded, 0);
  const funderValue = h.agreements.reduce((s, a) => s + a.value, 0);
  const received = h.disbursements.filter((d) => d.status === 'received').reduce((s, d) => s + d.amount, 0);
  const scheduled = h.disbursements.filter((d) => d.status !== 'received').reduce((s, d) => s + d.amount, 0);
  const expiring = h.agreements.filter((a) => a.status === 'expiring').length;
  const funders = new Set(h.agreements.map((a) => a.funder)).size;
  return { fundedSeats, funderValue, received, scheduled, expiring, funders };
}
