import { useQuery, useMutation } from "@tanstack/react-query";
import { customFetch } from "@workspace/paideia-api-client";
import type { ErrorType } from "@workspace/paideia-api-client";

const BASE = "/api/study";

// ─── Knowledge Graph ───

export interface KnowledgeNode {
  id: string;
  userId: string;
  label: string;
  description: string | null;
  category: string | null;
  masteryLevel: number;
  confidenceScore: number;
  reviewCount: number;
  lastAssessedAt: string | null;
  createdAt: string;
}

export interface KnowledgeEdge {
  id: string;
  userId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationType: string;
  strength: number;
  createdAt: string;
}

export interface KnowledgeGraphData {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}

export function useStudyKnowledgeGraph() {
  return useQuery<KnowledgeGraphData, ErrorType<unknown>>({
    queryKey: ["studyKnowledgeGraph"],
    queryFn: async () => {
      const res = await customFetch<KnowledgeGraphData>(`${BASE}/knowledge/nodes`);
      const nodes = Array.isArray(res) ? res : [];
      const edgesRes = await customFetch<KnowledgeEdge[]>(`${BASE}/knowledge/edges`);
      const edges = Array.isArray(edgesRes) ? edgesRes : [];
      return { nodes, edges };
    },
  });
}

export function useStudyKnowledgeGenerate() {
  return useMutation<KnowledgeGraphData, ErrorType<unknown>, { materialId: string }>({
    mutationKey: ["studyKnowledgeGenerate"],
    mutationFn: async ({ materialId }) => {
      const res = await customFetch<KnowledgeGraphData>(`${BASE}/knowledge/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialId }),
      });
      return res;
    },
  });
}

// ─── Adaptive Engine ───

export interface AdaptiveRecommendation {
  type: string;
  title: string;
  description: string;
  priority: number;
  action: string;
  reason: string;
}

export interface AdaptiveRecommendations {
  recommendations: AdaptiveRecommendation[];
  dueFlashcards: number;
  weakConcepts: number;
  activePathId: string | null;
  lastActivity: string | null;
}

export function useStudyAdaptiveRecommendations() {
  return useQuery<AdaptiveRecommendations, ErrorType<unknown>>({
    queryKey: ["studyAdaptiveRecommendations"],
    queryFn: async () => {
      return customFetch<AdaptiveRecommendations>(`${BASE}/adaptive/recommendations`);
    },
  });
}

export interface LearningPath {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  goal: string | null;
  status: string;
  nodeSequence: Array<{
    nodeId: string;
    order: number;
    estimatedMinutes: number;
    status: "pending" | "in_progress" | "completed";
  }>;
  totalEstimatedMinutes: number;
  completedMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export function useStudyLearningPaths() {
  return useQuery<LearningPath[], ErrorType<unknown>>({
    queryKey: ["studyLearningPaths"],
    queryFn: async () => customFetch<LearningPath[]>(`${BASE}/adaptive/learning-paths`),
  });
}

export function useStudyCreateLearningPath() {
  return useMutation<LearningPath, ErrorType<unknown>, { title: string; description?: string; goal?: string; materialIds?: string[] }>({
    mutationKey: ["studyCreateLearningPath"],
    mutationFn: async (data) =>
      customFetch<LearningPath>(`${BASE}/adaptive/learning-paths`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });
}

// ─── Activity Log ───

export function useStudyLogActivity() {
  return useMutation<unknown, ErrorType<unknown>, {
    activityType: string;
    entityId?: string;
    entityType?: string;
    durationSeconds?: number;
    accuracy?: number;
    confidence?: number;
    difficulty?: string;
    conceptIds?: string[];
    metadata?: Record<string, unknown>;
  }>({
    mutationKey: ["studyLogActivity"],
    mutationFn: async (data) =>
      customFetch<unknown>(`${BASE}/adaptive/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });
}

// ─── Billing (mobile money + card) ───

export interface BillingMethod {
  id: string;
  label: string;
  kind: "mobile_money" | "card" | "bank";
  requiresPhone: boolean;
  note?: string;
}

export type TierId = "plus" | "pro";

export interface TierPricing {
  plus: { month: number; year: number };
  pro: { month: number; year: number };
}

export interface BillingCountry {
  code: "ZW" | "ZA" | "ZM" | "BW";
  name: string;
  flag: string;
  currency: string;
  methods: BillingMethod[];
  price: TierPricing;
}

export interface BillingTier {
  id: TierId;
  name: string;
  tagline: string;
  features: string[];
}

export interface BillingConfig {
  countries: BillingCountry[];
  selected: BillingCountry | null;
  tiers: BillingTier[];
}

export interface CouponPreview {
  valid: boolean;
  reason?: string;
  code?: string;
  description?: string | null;
  discountMinor: number;
  finalMinor: number;
  currency: string;
  baseMinor: number;
}

export interface StudySubscription {
  tier: string;
  status: string;
  provider: string | null;
  interval: string | null;
  country: string | null;
  autoRenew: boolean;
  currentPeriodEnd: string | null;
}

export interface MobileCheckoutInput {
  tier: TierId;
  interval: "month" | "year";
  country: string;
  method: string;
  mobileNumber?: string;
  autoRenew?: boolean;
  couponCode?: string;
}

export interface MobileCheckoutResult {
  paymentId: string;
  provider: string;
  sandbox: boolean;
  status: "pending" | "paid" | "failed";
  redirectUrl: string | null;
  instructions: string | null;
  requiresPolling: boolean;
}

export interface PaymentStatusResult {
  status: "pending" | "paid" | "failed";
  paid: boolean;
  instructions?: string | null;
  subscription?: StudySubscription;
}

export interface CardCheckoutResult {
  url: string;
}

export function useStudyBillingConfig() {
  return useQuery<BillingConfig, ErrorType<unknown>>({
    queryKey: ["studyBillingConfig"],
    queryFn: async () => customFetch<BillingConfig>(`${BASE}/billing/config`),
  });
}

export function useStudySubscription() {
  return useQuery<StudySubscription, ErrorType<unknown>>({
    queryKey: ["studySubscription"],
    queryFn: async () => customFetch<StudySubscription>(`${BASE}/billing/subscription`),
  });
}

export function useStudyMobileCheckout() {
  return useMutation<MobileCheckoutResult, ErrorType<unknown>, MobileCheckoutInput>({
    mutationKey: ["studyMobileCheckout"],
    mutationFn: async (data) =>
      customFetch<MobileCheckoutResult>(`${BASE}/billing/mobile/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });
}

export function useStudyCardCheckout() {
  return useMutation<
    CardCheckoutResult,
    ErrorType<unknown>,
    { tier: TierId; interval: "month" | "year" }
  >({
    mutationKey: ["studyCardCheckout"],
    mutationFn: async (data) =>
      customFetch<CardCheckoutResult>(`${BASE}/billing/card/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });
}

export interface CouponPreviewInput {
  code: string;
  tier: TierId;
  country: string;
  interval: "month" | "year";
}

export function useStudyCouponPreview() {
  return useMutation<CouponPreview, ErrorType<unknown>, CouponPreviewInput>({
    mutationKey: ["studyCouponPreview"],
    mutationFn: async (data) =>
      customFetch<CouponPreview>(`${BASE}/billing/coupon/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });
}

// ─── Admin: coupons ───

export interface AdminCoupon {
  id: string;
  code: string;
  description: string | null;
  discountType: "percent" | "fixed";
  percentOff: number | null;
  amountOffMinor: number | null;
  currency: string | null;
  appliesToTier: "plus" | "pro" | null;
  active: boolean;
  maxRedemptions: number | null;
  timesRedeemed: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface AdminCouponInput {
  code: string;
  description?: string | null;
  discountType: "percent" | "fixed";
  percentOff?: number | null;
  amountOffMinor?: number | null;
  currency?: string | null;
  appliesToTier?: "plus" | "pro" | null;
  active?: boolean;
  maxRedemptions?: number | null;
  expiresAt?: string | null;
}

export function useStudyAdminCoupons() {
  return useQuery<{ coupons: AdminCoupon[] }, ErrorType<unknown>>({
    queryKey: ["studyAdminCoupons"],
    queryFn: async () => customFetch<{ coupons: AdminCoupon[] }>(`${BASE}/admin/coupons`),
  });
}

export function useStudyCreateCoupon() {
  return useMutation<{ coupon: AdminCoupon }, ErrorType<unknown>, AdminCouponInput>({
    mutationKey: ["studyCreateCoupon"],
    mutationFn: async (data) =>
      customFetch<{ coupon: AdminCoupon }>(`${BASE}/admin/coupons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });
}

export function useStudyUpdateCoupon() {
  return useMutation<
    { coupon: AdminCoupon },
    ErrorType<unknown>,
    { id: string } & AdminCouponInput
  >({
    mutationKey: ["studyUpdateCoupon"],
    mutationFn: async ({ id, ...data }) =>
      customFetch<{ coupon: AdminCoupon }>(`${BASE}/admin/coupons/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });
}

export function useStudyDeleteCoupon() {
  return useMutation<{ ok: true }, ErrorType<unknown>, string>({
    mutationKey: ["studyDeleteCoupon"],
    mutationFn: async (id) =>
      customFetch<{ ok: true }>(`${BASE}/admin/coupons/${id}`, { method: "DELETE" }),
  });
}

export function useStudyPaymentStatus(paymentId: string | null) {
  return useQuery<PaymentStatusResult, ErrorType<unknown>>({
    queryKey: ["studyPaymentStatus", paymentId],
    enabled: !!paymentId,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && (data.status === "paid" || data.status === "failed") ? false : 3000;
    },
    queryFn: async () => customFetch<PaymentStatusResult>(`${BASE}/billing/payment/${paymentId}`),
  });
}

export function useStudyCancelSubscription() {
  return useMutation<StudySubscription, ErrorType<unknown>, void>({
    mutationKey: ["studyCancelSubscription"],
    mutationFn: async () =>
      customFetch<StudySubscription>(`${BASE}/billing/cancel`, { method: "POST" }),
  });
}

// ─── Ambassador program ───

export interface AmbassadorProgramInfo {
  schedule: Array<{ minMonth: number; maxMonth: number | null; ratePct: number }>;
  standardCapMonths: number;
  lifetimeThresholdReferrals: number;
  holdbackDays: number;
  payoutMethods: string[];
  cashoutIncrementUsdMinor: number;
}

export interface AmbassadorStatus {
  enrolled: boolean;
  eligible: boolean;
  program: AmbassadorProgramInfo;
}

export interface AmbassadorBalances {
  pendingUsdMinor: number;
  confirmedUsdMinor: number;
  clawedBackUsdMinor: number;
  committedUsdMinor: number;
  availableUsdMinor: number;
  cashableUsdMinor: number;
  lifetimeEarnedUsdMinor: number;
}

export interface AmbassadorReferredCustomer {
  referralId: string;
  customerName: string;
  customerEmail: string;
  status: string;
  firstPaidAt: string | null;
  tenureMonth: number | null;
  currentRatePct: number;
  earnedUsdMinor: number;
}

export interface AmbassadorCommissionEvent {
  id: string;
  amountUsdMinor: number;
  grossUsdMinor: number;
  rateApplied: number;
  currency: string;
  customerTenureMonth: number;
  state: string;
  confirmAt: string | null;
  createdAt: string | null;
}

export interface AmbassadorPayout {
  id: string;
  amountUsdMinor: number;
  method: string;
  handle: string | null;
  status: string;
  note: string | null;
  requestedAt: string | null;
  settledAt: string | null;
}

export interface AmbassadorDashboard {
  profile: {
    referralCode: string;
    tier: string;
    status: string;
    payoutMethod: string | null;
    payoutHandle: string | null;
  };
  program: AmbassadorProgramInfo;
  balances: AmbassadorBalances;
  customers: AmbassadorReferredCustomer[];
  events: AmbassadorCommissionEvent[];
  payouts: AmbassadorPayout[];
}

export function useAmbassadorStatus() {
  return useQuery<AmbassadorStatus, ErrorType<unknown>>({
    queryKey: ["ambassadorStatus"],
    queryFn: async () => customFetch<AmbassadorStatus>(`${BASE}/ambassador/status`),
  });
}

export function useAmbassadorDashboard(enabled: boolean) {
  return useQuery<AmbassadorDashboard, ErrorType<unknown>>({
    queryKey: ["ambassadorDashboard"],
    enabled,
    queryFn: async () => customFetch<AmbassadorDashboard>(`${BASE}/ambassador/me`),
  });
}

export function useAmbassadorJoin() {
  return useMutation<
    { referralCode: string },
    ErrorType<unknown>,
    { payoutMethod?: string; payoutHandle?: string } | void
  >({
    mutationKey: ["ambassadorJoin"],
    mutationFn: async (body) =>
      customFetch<{ referralCode: string }>(`${BASE}/ambassador/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      }),
  });
}

export function useAmbassadorSetPayoutMethod() {
  return useMutation<
    { payoutMethod: string; payoutHandle: string },
    ErrorType<unknown>,
    { payoutMethod: string; payoutHandle: string }
  >({
    mutationKey: ["ambassadorSetPayoutMethod"],
    mutationFn: async (data) =>
      customFetch<{ payoutMethod: string; payoutHandle: string }>(
        `${BASE}/ambassador/payout-method`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      ),
  });
}

export function useAmbassadorCashout() {
  return useMutation<{ payout: AmbassadorPayout }, ErrorType<unknown>, void>({
    mutationKey: ["ambassadorCashout"],
    mutationFn: async () =>
      customFetch<{ payout: AmbassadorPayout }>(`${BASE}/ambassador/cashout`, {
        method: "POST",
      }),
  });
}

// ─── Ambassador admin ───

export interface AmbassadorSettings {
  id: string;
  schedule: Array<{ minMonth: number; maxMonth: number | null; ratePct: number }>;
  standardCapMonths: number;
  lifetimeThresholdReferrals: number;
  holdbackDays: number;
  payoutMethods: string[];
  cashoutIncrementUsdMinor: number;
  fxRatesToUsd: Record<string, number>;
}

export interface AdminAmbassadorRow {
  id: string;
  tier: string;
  status: string;
  referralCode: string;
  payoutMethod: string | null;
  payoutHandle: string | null;
  userName: string;
  userEmail: string;
  createdAt: string | null;
  referralsTotal: number;
  referralsActive: number;
  balances: AmbassadorBalances;
}

export interface AdminPayoutRow {
  id: string;
  ambassadorId: string;
  amountUsdMinor: number;
  method: string;
  handle: string | null;
  status: string;
  note: string | null;
  requestedAt: string | null;
  settledAt: string | null;
  userName: string;
  userEmail: string;
  referralCode: string;
}

export function useAdminAmbassadorSettings() {
  return useQuery<{ settings: AmbassadorSettings }, ErrorType<unknown>>({
    queryKey: ["adminAmbassadorSettings"],
    queryFn: async () =>
      customFetch<{ settings: AmbassadorSettings }>(`${BASE}/admin/ambassador/settings`),
  });
}

export function useAdminUpdateAmbassadorSettings() {
  return useMutation<
    { settings: AmbassadorSettings },
    ErrorType<unknown>,
    Partial<Omit<AmbassadorSettings, "id">>
  >({
    mutationKey: ["adminUpdateAmbassadorSettings"],
    mutationFn: async (data) =>
      customFetch<{ settings: AmbassadorSettings }>(`${BASE}/admin/ambassador/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });
}

export function useAdminAmbassadors() {
  return useQuery<{ ambassadors: AdminAmbassadorRow[] }, ErrorType<unknown>>({
    queryKey: ["adminAmbassadors"],
    queryFn: async () =>
      customFetch<{ ambassadors: AdminAmbassadorRow[] }>(`${BASE}/admin/ambassadors`),
  });
}

export function useAdminPayouts(status?: string) {
  return useQuery<{ payouts: AdminPayoutRow[] }, ErrorType<unknown>>({
    queryKey: ["adminPayouts", status ?? "all"],
    queryFn: async () => {
      const qs = status ? `?status=${encodeURIComponent(status)}` : "";
      return customFetch<{ payouts: AdminPayoutRow[] }>(`${BASE}/admin/payouts${qs}`);
    },
  });
}

export function useAdminUpdatePayout() {
  return useMutation<
    { payout: AmbassadorPayout },
    ErrorType<unknown>,
    { id: string; status: string; note?: string }
  >({
    mutationKey: ["adminUpdatePayout"],
    mutationFn: async ({ id, ...data }) =>
      customFetch<{ payout: AmbassadorPayout }>(`${BASE}/admin/payouts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });
}

export function useAdminSetAmbassadorTier() {
  return useMutation<
    { ambassador: unknown },
    ErrorType<unknown>,
    { id: string; tier: "standard" | "lifetime" }
  >({
    mutationKey: ["adminSetAmbassadorTier"],
    mutationFn: async ({ id, tier }) =>
      customFetch<{ ambassador: unknown }>(`${BASE}/admin/ambassadors/${id}/tier`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      }),
  });
}

export function useAdminSetAmbassadorStatus() {
  return useMutation<
    { ambassador: unknown },
    ErrorType<unknown>,
    { id: string; status: "active" | "suspended" }
  >({
    mutationKey: ["adminSetAmbassadorStatus"],
    mutationFn: async ({ id, status }) =>
      customFetch<{ ambassador: unknown }>(`${BASE}/admin/ambassadors/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Admin console: analytics, usage telemetry read-outs, upgrade targeting,
// announcements, pricing/payments catalogs, audit log, user management.
// ═══════════════════════════════════════════════════════════════════════════

export interface AdminOverview {
  total_users: number; paid_users: number; free_users: number; suspended_users: number;
  new_users_today: number; new_users_7d: number; new_users_30d: number;
  active_users_today: number; active_users_7d: number; active_users_30d: number;
  total_sessions: number; total_time_seconds: number;
  total_materials: number; total_practice: number; total_exams: number;
  total_activity_events: number; revenue_minor_paid: number;
}
export function useStudyAdminOverview() {
  return useQuery<AdminOverview, ErrorType<unknown>>({
    queryKey: ["studyAdminOverview"],
    queryFn: async () => customFetch<AdminOverview>(`${BASE}/admin/overview`),
  });
}

export interface AdminUsagePoint { day: string; new_users: number; events: number; active_users: number; sessions: number; }
export function useStudyAdminUsage() {
  return useQuery<AdminUsagePoint[], ErrorType<unknown>>({
    queryKey: ["studyAdminUsage"],
    queryFn: async () => customFetch<AdminUsagePoint[]>(`${BASE}/admin/usage`),
  });
}

export interface AdminBreakdownItem { key: string | null; count: number; }
export interface AdminBreakdown {
  plans: AdminBreakdownItem[]; tiers: AdminBreakdownItem[]; countries: AdminBreakdownItem[];
  devices: AdminBreakdownItem[]; activities: AdminBreakdownItem[];
}
export function useStudyAdminBreakdown() {
  return useQuery<AdminBreakdown, ErrorType<unknown>>({
    queryKey: ["studyAdminBreakdown"],
    queryFn: async () => customFetch<AdminBreakdown>(`${BASE}/admin/breakdown`),
  });
}

export interface AdminLoginRow {
  started_at: string; last_seen_at: string; seconds: number; ip_address: string | null;
  device: string | null; city: string | null; region: string | null; country: string | null;
  email: string | null; name: string | null; plan: string;
}
export function useStudyAdminLogins() {
  return useQuery<AdminLoginRow[], ErrorType<unknown>>({
    queryKey: ["studyAdminLogins"],
    queryFn: async () => customFetch<AdminLoginRow[]>(`${BASE}/admin/logins`),
  });
}

export interface AdminUserRow {
  id: string; email: string; name: string; subscription_tier: string; subscription_status: string;
  is_admin: boolean; suspended: boolean; role: string; billing_country: string | null;
  created_at: string; last_active_at: string | null; is_paid: boolean;
  session_count: number; total_time_seconds: number; event_count: number;
  material_count: number; practice_count: number; exam_count: number;
}
export function useStudyAdminUsers(q: string) {
  return useQuery<AdminUserRow[], ErrorType<unknown>>({
    queryKey: ["studyAdminUsers", q],
    queryFn: async () =>
      customFetch<AdminUserRow[]>(`${BASE}/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  });
}

export interface AdminUserDetail {
  user: Record<string, unknown>;
  sessions: Array<Record<string, unknown>>;
  activity: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
}
export function useStudyAdminUserDetail(id: string | null) {
  return useQuery<AdminUserDetail, ErrorType<unknown>>({
    queryKey: ["studyAdminUserDetail", id],
    enabled: !!id,
    queryFn: async () => customFetch<AdminUserDetail>(`${BASE}/admin/users/${id}`),
  });
}

export interface AdminUpgradeTarget {
  id: string; email: string; name: string; billing_country: string | null;
  created_at: string; last_active_at: string | null;
  session_count: number; total_time_seconds: number; event_count: number;
  material_count: number; practice_count: number;
  engagement_score: number; days_since_active: number | null;
}
export function useStudyAdminUpgradeTargets() {
  return useQuery<AdminUpgradeTarget[], ErrorType<unknown>>({
    queryKey: ["studyAdminUpgradeTargets"],
    queryFn: async () => customFetch<AdminUpgradeTarget[]>(`${BASE}/admin/upgrade-targets`),
  });
}

export interface AdminAnnouncement {
  id: number; title: string; body: string; audience: string; level: string;
  active: boolean; createdByEmail: string | null; createdAt: string; deactivatedAt: string | null;
}
export function useStudyAdminAnnouncements() {
  return useQuery<{ announcements: AdminAnnouncement[] }, ErrorType<unknown>>({
    queryKey: ["studyAdminAnnouncements"],
    queryFn: async () => customFetch<{ announcements: AdminAnnouncement[] }>(`${BASE}/admin/announcements`),
  });
}
export function useStudyCreateAnnouncement() {
  return useMutation<{ announcement: AdminAnnouncement }, ErrorType<unknown>, { title: string; body: string; audience?: string; level?: string }>({
    mutationFn: async (data) =>
      customFetch<{ announcement: AdminAnnouncement }>(`${BASE}/admin/announcements`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      }),
  });
}
export function useStudyUpdateAnnouncement() {
  return useMutation<{ announcement: AdminAnnouncement }, ErrorType<unknown>, { id: number; active?: boolean; title?: string; body?: string; audience?: string; level?: string }>({
    mutationFn: async ({ id, ...data }) =>
      customFetch<{ announcement: AdminAnnouncement }>(`${BASE}/admin/announcements/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      }),
  });
}

export interface AdminPlan {
  id: number; key: string; name: string; description: string | null; priceMinor: number;
  currency: string; interval: string; features: string[]; monthlyGenerationCap: number | null;
  active: boolean; sortOrder: number;
}
export function useStudyAdminPlans() {
  return useQuery<{ plans: AdminPlan[] }, ErrorType<unknown>>({
    queryKey: ["studyAdminPlans"],
    queryFn: async () => customFetch<{ plans: AdminPlan[] }>(`${BASE}/admin/plans`),
  });
}
export function useStudyCreatePlan() {
  return useMutation<{ plan: AdminPlan }, ErrorType<unknown>, Partial<AdminPlan>>({
    mutationFn: async (data) =>
      customFetch<{ plan: AdminPlan }>(`${BASE}/admin/plans`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      }),
  });
}
export function useStudyUpdatePlan() {
  return useMutation<{ plan: AdminPlan }, ErrorType<unknown>, { id: number } & Partial<AdminPlan>>({
    mutationFn: async ({ id, ...data }) =>
      customFetch<{ plan: AdminPlan }>(`${BASE}/admin/plans/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      }),
  });
}

export interface AdminPaymentMethod {
  id: number; key: string; label: string; provider: string; countries: string[];
  enabled: boolean; sortOrder: number;
}
export function useStudyAdminPaymentMethods() {
  return useQuery<{ paymentMethods: AdminPaymentMethod[] }, ErrorType<unknown>>({
    queryKey: ["studyAdminPaymentMethods"],
    queryFn: async () => customFetch<{ paymentMethods: AdminPaymentMethod[] }>(`${BASE}/admin/payment-methods`),
  });
}
export function useStudyCreatePaymentMethod() {
  return useMutation<{ paymentMethod: AdminPaymentMethod }, ErrorType<unknown>, Partial<AdminPaymentMethod>>({
    mutationFn: async (data) =>
      customFetch<{ paymentMethod: AdminPaymentMethod }>(`${BASE}/admin/payment-methods`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      }),
  });
}
export function useStudyUpdatePaymentMethod() {
  return useMutation<{ paymentMethod: AdminPaymentMethod }, ErrorType<unknown>, { id: number } & Partial<AdminPaymentMethod>>({
    mutationFn: async ({ id, ...data }) =>
      customFetch<{ paymentMethod: AdminPaymentMethod }>(`${BASE}/admin/payment-methods/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      }),
  });
}

export interface AdminAuditRow {
  id: number; actorEmail: string | null; action: string; targetType: string | null;
  targetId: string | null; metadata: Record<string, unknown> | null; createdAt: string;
}
export function useStudyAdminAudit() {
  return useQuery<{ audit: AdminAuditRow[] }, ErrorType<unknown>>({
    queryKey: ["studyAdminAudit"],
    queryFn: async () => customFetch<{ audit: AdminAuditRow[] }>(`${BASE}/admin/audit`),
  });
}

export function useStudyAdminUserAction() {
  return useMutation<{ ok: true }, ErrorType<unknown>, { id: string; action: "suspend" | "reactivate" | "set-admin"; isAdmin?: boolean }>({
    mutationFn: async ({ id, action, isAdmin }) =>
      customFetch<{ ok: true }>(`${BASE}/admin/users/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "set-admin" ? { isAdmin } : {}),
      }),
  });
}

export function useStudyAdminCreateUser() {
  return useMutation<
    { user: { id: string; email: string } },
    ErrorType<unknown>,
    { email: string; name: string; password: string; tier?: string; isAdmin?: boolean }
  >({
    mutationFn: async (data) =>
      customFetch<{ user: { id: string; email: string } }>(`${BASE}/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });
}

export function useStudyAdminDeleteUser() {
  return useMutation<{ ok: true }, ErrorType<unknown>, string>({
    mutationFn: async (id) =>
      customFetch<{ ok: true }>(`${BASE}/admin/users/${id}`, { method: "DELETE" }),
  });
}

// Fire-and-forget usage heartbeat. Best-effort; failures are ignored.
export function studyHeartbeat(path: string): void {
  void customFetch(`${BASE}/telemetry/heartbeat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  }).catch(() => {
    /* heartbeat is advisory only */
  });
}
