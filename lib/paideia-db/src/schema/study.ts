import {
  pgTable,
  text,
  serial,
  timestamp,
  jsonb,
  integer,
  uuid,
  index,
  uniqueIndex,
  boolean,
  real,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const studyUsersTable = pgTable("study_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  subscriptionStatus: text("subscription_status").notNull().default("free"),
  // free | plus | pro. The tier that gates features; subscriptionStatus tracks
  // lifecycle (free | trialing | active | past_due | canceled | expired).
  subscriptionTier: text("subscription_tier").notNull().default("free"),
  // Grants access to the admin coupon console. Flip in the DB to make an owner.
  isAdmin: boolean("is_admin").notNull().default(false),
  // Which gateway the active subscription was paid through: paynow | flutterwave | stripe | mock.
  subscriptionProvider: text("subscription_provider"),
  // month | year
  subscriptionInterval: text("subscription_interval"),
  // ISO country the learner pays from: ZW | ZA | ZM | BW
  billingCountry: text("billing_country"),
  // Card subscriptions can auto-renew (Stripe); mobile money renews manually.
  autoRenew: boolean("auto_renew").notNull().default(false),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionCurrentPeriodEnd: timestamp("subscription_current_period_end"),
  // WhatsApp (Twilio) outbound notifications. Number stored in E.164 (e.g. +263...).
  // optIn must be true for any outbound message to be sent.
  whatsappNumber: text("whatsapp_number"),
  whatsappOptIn: boolean("whatsapp_opt_in").notNull().default(false),
  // Admin/analytics: last time an authenticated request was seen from this user
  // (set by the heartbeat tracker). Powers active-user metrics + upgrade targeting.
  // suspended blocks sign-in; role grants elevated admin scopes.
  lastActiveAt: timestamp("last_active_at"),
  suspended: boolean("suspended").notNull().default(false),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Outbound notifications log (WhatsApp via Twilio, Phase 1) ───
// One row per attempted notification. dedupeKey makes sends idempotent: a repeat run
// with the same key is skipped (unique constraint + onConflictDoNothing). status:
// queued -> sent | failed | skipped. reason holds the skip cause or send error.
export const studyNotificationsTable = pgTable("study_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => studyUsersTable.id, { onDelete: "cascade" }),
  channel: text("channel").notNull().default("whatsapp"),
  kind: text("kind").notNull(), // renewal_reminder | brief_ready | review_nudge
  toAddress: text("to_address"),
  body: text("body"),
  status: text("status").notNull().default("queued"), // queued | sent | failed | skipped
  reason: text("reason"), // skip cause (not_configured | not_opted_in | no_number | duplicate) or send error
  providerRef: text("provider_ref"), // Twilio message SID
  dedupeKey: text("dedupe_key").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  sentAt: timestamp("sent_at"),
}, (t) => ({
  userIdx: index("study_notifications_user_idx").on(t.userId),
}));

// ─── Mobile-money / card payments (African gateways: Paynow, Flutterwave, ...) ───
// One row per payment attempt. Mobile money cannot auto-charge, so each renewal
// is a fresh row; card auto-renew goes through Stripe instead.
export const studyPaymentsTable = pgTable("study_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => studyUsersTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // paynow | flutterwave | stripe | mock
  method: text("method").notNull(), // ecocash | onemoney | orange_money | mtn_momo | airtel_money | zamtel | card
  country: text("country").notNull(), // ZW | ZA | ZM | BW
  currency: text("currency").notNull(), // USD | ZAR | ZMW | BWP
  amountMinor: integer("amount_minor").notNull(), // smallest currency unit (cents), AFTER any coupon
  // plus | pro. Which tier this payment purchases. Defaults to pro for back-compat
  // with rows written before the three-tier rollout.
  tier: text("tier").notNull().default("pro"),
  // Coupon applied at checkout (uppercase code) and the discount it produced.
  couponCode: text("coupon_code"),
  discountMinor: integer("discount_minor").notNull().default(0),
  interval: text("interval").notNull(), // month | year
  reference: text("reference").notNull().unique(), // our merchant reference
  providerRef: text("provider_ref"), // gateway transaction id
  pollUrl: text("poll_url"), // Paynow status-poll URL
  redirectUrl: text("redirect_url"), // hosted checkout URL (card / web)
  mobileNumber: text("mobile_number"),
  status: text("status").notNull().default("pending"), // pending | paid | failed | canceled
  instructions: text("instructions"), // human-facing next step (e.g. EcoCash prompt)
  raw: jsonb("raw").$type<Record<string, unknown> | null>().default(null),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("study_payments_user_idx").on(t.userId),
  refIdx: index("study_payments_ref_idx").on(t.reference),
}));

// ─── Discount coupons (admin-managed sales) ───
// Admins create coupons that learners apply at checkout. Percent coupons take a
// whole-number percentOff (1-100); fixed coupons take amountOffMinor in a single
// currency (must match the payment currency to apply).
export const studyCouponsTable = pgTable("study_coupons", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // stored uppercase
  description: text("description"),
  discountType: text("discount_type").notNull(), // percent | fixed
  percentOff: integer("percent_off"), // 1-100 when discountType = percent
  amountOffMinor: integer("amount_off_minor"), // minor units when discountType = fixed
  currency: text("currency"), // required for fixed coupons: USD | ZAR | ZMW | BWP
  appliesToTier: text("applies_to_tier"), // plus | pro | null (any paid tier)
  active: boolean("active").notNull().default(true),
  maxRedemptions: integer("max_redemptions"), // null = unlimited
  timesRedeemed: integer("times_redeemed").notNull().default(0),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  codeIdx: index("study_coupons_code_idx").on(t.code),
}));

export const studySessionsTable = pgTable("study_sessions", {
  id: serial("id").primaryKey(),
  token: text("token").unique().notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => studyUsersTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const studyMaterialsTable = pgTable("study_materials", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => studyUsersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  sourceType: text("source_type").notNull(), // paste, url, file
  sourceUrl: text("source_url"),
  contentText: text("content_text").notNull(),
  strategy: jsonb("strategy").$type<{
    summary: string;
    sessionMinutes: number;
    modalityMix: { text: number; audio: number; visual: number; practice: number };
    activities: Array<{
      order: number;
      title: string;
      description: string;
      modality: "read" | "listen" | "watch" | "practice" | "reflect";
      estimatedMinutes: number;
    }>;
    tips: string[];
    generatedAt: string;
  } | null>().default(null),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("study_materials_user_idx").on(t.userId),
}));

export const studyConceptsTable = pgTable("study_concepts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => studyUsersTable.id, { onDelete: "cascade" }),
  materialId: uuid("material_id")
    .notNull()
    .references(() => studyMaterialsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  explanation: text("explanation").notNull(),
  difficulty: text("difficulty").notNull().default("medium"),
  keyTerms: jsonb("key_terms").$type<string[]>().notNull().default([]),
  relatedConceptIds: jsonb("related_concept_ids").$type<string[]>().notNull().default([]),
  visualSvg: text("visual_svg"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("study_concepts_user_idx").on(t.userId),
  materialIdx: index("study_concepts_material_idx").on(t.materialId),
}));

export const studyFlashcardsTable = pgTable("study_flashcards", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => studyUsersTable.id, { onDelete: "cascade" }),
  materialId: uuid("material_id").references(() => studyMaterialsTable.id, { onDelete: "cascade" }),
  conceptId: uuid("concept_id").references(() => studyConceptsTable.id, { onDelete: "cascade" }),
  front: text("front").notNull(),
  back: text("back").notNull(),
  hint: text("hint"),
  intervalDays: real("interval_days").notNull().default(1),
  repetitions: integer("repetitions").notNull().default(0),
  easeFactor: real("ease_factor").notNull().default(2.5),
  nextReviewAt: timestamp("next_review_at"),
  lastReviewedAt: timestamp("last_reviewed_at"),
  reviewCount: integer("review_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("study_flashcards_user_idx").on(t.userId),
  nextReviewIdx: index("study_flashcards_next_review_idx").on(t.nextReviewAt),
}));

export const studyPracticeSessionsTable = pgTable("study_practice_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => studyUsersTable.id, { onDelete: "cascade" }),
  materialId: uuid("material_id").references(() => studyMaterialsTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("active"),
  questionCount: integer("question_count").notNull(),
  answeredCount: integer("answered_count").notNull().default(0),
  correctCount: integer("correct_count").notNull().default(0),
  questions: jsonb("questions").$type<{
    id: string;
    prompt: string;
    options: string[];
    correctOptionIndex: number;
    explanation: string;
    conceptId: string | null;
    difficulty: string;
  }[]>().notNull().default([]),
  answers: jsonb("answers").$type<{
    questionId: string;
    selectedOptionIndex: number;
    confidence: number;
    correct: boolean;
    answeredAt: string;
  }[]>().notNull().default([]),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("study_practice_user_idx").on(t.userId),
}));

export const studyMockExamsTable = pgTable("study_mock_exams", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => studyUsersTable.id, { onDelete: "cascade" }),
  materialId: uuid("material_id").references(() => studyMaterialsTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  questionCount: integer("question_count").notNull(),
  timeLimitMinutes: integer("time_limit_minutes").notNull(),
  status: text("status").notNull().default("active"),
  format: text("format").notNull().default("multiple-choice"), // multiple-choice | short-answer | essay | fact-pattern | mixed
  questions: jsonb("questions").$type<{
    id: string;
    prompt: string;
    conceptId: string | null;
    points: number;
    format: "multiple-choice" | "short-answer" | "essay" | "fact-pattern";
    // MCQ-only
    options?: string[];
    correctOptionIndex?: number;
    explanation?: string;
    // Free-form
    modelAnswer?: string;
    scoringPoints?: string[];
  }[]>().notNull().default([]),
  answers: jsonb("answers").$type<{
    questionId: string;
    // MCQ
    selectedOptionIndex?: number;
    // Free-form
    freeformAnswer?: string;
    aiScore?: number; // 0..1
    aiFeedback?: string;
    aiCoveredPoints?: string[];
  }[]>().notNull().default([]),
  score: real("score"),
  maxScore: integer("max_score"),
  timeSpentSeconds: integer("time_spent_seconds"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("study_exams_user_idx").on(t.userId),
}));

export const studyTutorConversationsTable = pgTable("study_tutor_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => studyUsersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  socraticMode: boolean("socratic_mode").notNull().default(false),
  scope: text("scope").notNull().default("all_material"),
  scopeRefId: text("scope_ref_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("study_tutor_conversations_user_idx").on(t.userId),
}));

export const studyTutorMessagesTable = pgTable("study_tutor_messages", {
  id: serial("id").primaryKey(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => studyTutorConversationsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // user | assistant
  content: text("content").notNull(),
  citations: jsonb("citations").$type<Array<{ type: string; title: string; url?: string }>>(),
  usedPersonalization: boolean("used_personalization").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  conversationIdx: index("study_tutor_messages_conversation_idx").on(t.conversationId),
}));

export const studyLearnerProfilesTable = pgTable("study_learner_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => studyUsersTable.id, { onDelete: "cascade" }),
  goals: jsonb("goals").$type<string[]>().notNull().default([]),
  examTarget: text("exam_target"),
  studyStyle: text("study_style").notNull().default("balanced"),
  preferredSessionLength: integer("preferred_session_length").notNull().default(25),
  preferredDifficulty: text("preferred_difficulty").notNull().default("mixed"),
  weakAreas: jsonb("weak_areas").$type<string[]>().notNull().default([]),
  strongAreas: jsonb("strong_areas").$type<string[]>().notNull().default([]),
  interests: jsonb("interests").$type<string[]>().notNull().default([]),
  background: text("background"),
  dailyStudyMinutes: integer("daily_study_minutes").notNull().default(30),
  timezone: text("timezone"),
  // Diagnostic intake fields (from "The Method" v2 onboarding)
  examDate: timestamp("exam_date"),
  hoursPerWeek: integer("hours_per_week"),
  baselineLevel: text("baseline_level"), // zero | foundations | solid | rusty
  calibrationSelfRating: text("calibration_self_rating"), // high | mid | low | under
  failureMode: text("failure_mode"), // passive | cram | avoid | scattered | perfect
  // The Coach: chosen personality voice (drill | socratic | warm | analyst).
  // Voice/pressure only, never changes accuracy or pedagogy.
  coachPersonality: text("coach_personality"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const studyWeeklyBriefsTable = pgTable("study_weekly_briefs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => studyUsersTable.id, { onDelete: "cascade" }),
  weekStart: timestamp("week_start").notNull(),
  weekEnd: timestamp("week_end").notNull(),
  flashcardsReviewed: integer("flashcards_reviewed").notNull().default(0),
  practiceSessionsCompleted: integer("practice_sessions_completed").notNull().default(0),
  mockExamsTaken: integer("mock_exams_taken").notNull().default(0),
  averageAccuracy: real("average_accuracy").notNull().default(0),
  tutorConversations: integer("tutor_conversations").notNull().default(0),
  newConceptsMastered: integer("new_concepts_mastered").notNull().default(0),
  weakAreas: jsonb("weak_areas").$type<string[]>().notNull().default([]),
  recommendations: jsonb("recommendations").$type<string[]>().notNull().default([]),
  aiSummary: text("ai_summary"),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("study_weekly_briefs_user_idx").on(t.userId),
}));

// ─── Knowledge Graph ───
export const studyKnowledgeNodesTable = pgTable("study_knowledge_nodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => studyUsersTable.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  description: text("description"),
  category: text("category"), // e.g. "mathematics", "biology", "history"
  masteryLevel: real("mastery_level").notNull().default(0), // 0-1
  confidenceScore: real("confidence_score").notNull().default(0), // 0-1
  reviewCount: integer("review_count").notNull().default(0),
  lastAssessedAt: timestamp("last_assessed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("study_knowledge_nodes_user_idx").on(t.userId),
  labelIdx: index("study_knowledge_nodes_label_idx").on(t.label),
}));

export const studyKnowledgeEdgesTable = pgTable("study_knowledge_edges", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => studyUsersTable.id, { onDelete: "cascade" }),
  sourceNodeId: uuid("source_node_id")
    .notNull()
    .references(() => studyKnowledgeNodesTable.id, { onDelete: "cascade" }),
  targetNodeId: uuid("target_node_id")
    .notNull()
    .references(() => studyKnowledgeNodesTable.id, { onDelete: "cascade" }),
  relationType: text("relation_type").notNull().default("related"), // prerequisite, related, subtopic, extension
  strength: real("strength").notNull().default(0.5), // 0-1
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("study_knowledge_edges_user_idx").on(t.userId),
  sourceIdx: index("study_knowledge_edges_source_idx").on(t.sourceNodeId),
  targetIdx: index("study_knowledge_edges_target_idx").on(t.targetNodeId),
}));

// ─── Content Chunks (for large documents) ───
export const studyContentChunksTable = pgTable("study_content_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => studyUsersTable.id, { onDelete: "cascade" }),
  materialId: uuid("material_id")
    .notNull()
    .references(() => studyMaterialsTable.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  summary: text("summary"),
  embedding: jsonb("embedding").$type<number[]>(), // vector for semantic search
  nodeIds: jsonb("node_ids").$type<string[]>().notNull().default([]), // linked knowledge nodes
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("study_content_chunks_user_idx").on(t.userId),
  materialIdx: index("study_content_chunks_material_idx").on(t.materialId),
}));

// ─── Annotations (user highlights, notes on content) ───
export const studyAnnotationsTable = pgTable("study_annotations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => studyUsersTable.id, { onDelete: "cascade" }),
  materialId: uuid("material_id")
    .notNull()
    .references(() => studyMaterialsTable.id, { onDelete: "cascade" }),
  chunkId: uuid("chunk_id").references(() => studyContentChunksTable.id, { onDelete: "cascade" }),
  selectionText: text("selection_text"),
  startOffset: integer("start_offset"),
  endOffset: integer("end_offset"),
  note: text("note"),
  color: text("color").default("yellow"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("study_annotations_user_idx").on(t.userId),
  materialIdx: index("study_annotations_material_idx").on(t.materialId),
}));

// ─── Content Sources (multi-modal ingestion tracking) ───
export const studyContentSourcesTable = pgTable("study_content_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => studyUsersTable.id, { onDelete: "cascade" }),
  materialId: uuid("material_id")
    .notNull()
    .references(() => studyMaterialsTable.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(), // pdf, image, url, audio, video, paste
  originalFilename: text("original_filename"),
  originalUrl: text("original_url"),
  mimeType: text("mime_type"),
  fileSizeBytes: integer("file_size_bytes"),
  extractedText: text("extracted_text"),
  processingStatus: text("processing_status").notNull().default("pending"), // pending, processing, completed, failed
  processingError: text("processing_error"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("study_content_sources_user_idx").on(t.userId),
  materialIdx: index("study_content_sources_material_idx").on(t.materialId),
}));

// ─── Learning Paths (adaptive sequence of what to study) ───
export const studyLearningPathsTable = pgTable("study_learning_paths", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => studyUsersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  goal: text("goal"),
  status: text("status").notNull().default("active"), // active, completed, paused
  nodeSequence: jsonb("node_sequence").$type<Array<{
    nodeId: string;
    order: number;
    estimatedMinutes: number;
    status: "pending" | "in_progress" | "completed";
  }>>().notNull().default([]),
  totalEstimatedMinutes: integer("total_estimated_minutes").notNull().default(0),
  completedMinutes: integer("completed_minutes").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("study_learning_paths_user_idx").on(t.userId),
}));

// ─── Learner Cognitive Profiles (deep personalization) ───
export const studyCognitiveProfilesTable = pgTable("study_cognitive_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => studyUsersTable.id, { onDelete: "cascade" }),
  // NOTE: VARK-style (visual/auditory/reading/kinesthetic) columns previously lived here.
  // They have been removed because VARK is not supported by evidence. The evidence-based
  // cognitive profile (processingStyle, pace, strengthByQuestionType, confidencePattern,
  // inferenceConfidence) is computed by assessment.ts and stored on the assessment record
  // and learning path, not on this table. The physical columns may remain in older
  // databases; Drizzle will ignore them and they will be dropped in a future migration.
  // Pace
  optimalSessionMinutes: integer("optimal_session_minutes").notNull().default(25),
  breakFrequencyMinutes: integer("break_frequency_minutes").notNull().default(5),
  preferredStudyTimeOfDay: text("preferred_study_time_of_day").default("morning"), // morning, afternoon, evening, night
  // Attention & engagement
  averageAttentionSpanMinutes: real("average_attention_span_minutes").notNull().default(20),
  engagementPattern: text("engagement_pattern").default("steady"), // steady, burst, variable
  // Performance patterns
  accuracyTrend: text("accuracy_trend").default("stable"), // improving, declining, stable, volatile
  difficultyCalibration: real("difficulty_calibration").notNull().default(0.5), // -1 to 1 (needs easier to needs harder)
  responseTimePattern: text("response_time_pattern").default("average"), // fast, average, deliberate
  // Adaptive state
  currentEnergyLevel: real("current_energy_level").notNull().default(0.7), // 0-1
  currentMood: text("current_mood").default("neutral"), // focused, tired, energized, stressed, neutral
  lastAssessedAt: timestamp("last_assessed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Learning Style Profiles (how-the-learner-learns diagnostic, run BEFORE material) ───
export const studyLearningStyleProfilesTable = pgTable("study_learning_style_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => studyUsersTable.id, { onDelete: "cascade" }),
  // Modality preference weights (0-1, should sum ~ 1)
  textPref: real("text_pref").notNull().default(0.25),
  audioPref: real("audio_pref").notNull().default(0.25),
  visualPref: real("visual_pref").notNull().default(0.25),
  practicePref: real("practice_pref").notNull().default(0.25),
  // Pace / structure
  pace: text("pace").notNull().default("moderate"), // deliberate | moderate | quick
  preferredSessionMinutes: integer("preferred_session_minutes").notNull().default(25),
  focusMinutes: integer("focus_minutes").notNull().default(20),
  motivationType: text("motivation_type").notNull().default("mastery"), // mastery | deadline | curiosity | obligation
  priorKnowledge: text("prior_knowledge").notNull().default("some"), // none | some | strong
  studyTime: text("study_time").notNull().default("flexible"), // morning | afternoon | evening | night | flexible
  // Raw responses + mini-task scores for transparency
  rawResponses: jsonb("raw_responses").$type<Record<string, unknown>>().notNull().default({}),
  miniTaskScores: jsonb("mini_task_scores").$type<{
    read?: { correct: number; total: number };
    listen?: { correct: number; total: number };
    visual?: { correct: number; total: number };
  }>().notNull().default({}),
  aiSummary: text("ai_summary"),
  completedAt: timestamp("completed_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Assessments (diagnostic quiz after material ingestion) ───
export const studyAssessmentsTable = pgTable("study_assessments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => studyUsersTable.id, { onDelete: "cascade" }),
  materialId: uuid("material_id")
    .notNull()
    .references(() => studyMaterialsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  status: text("status").notNull().default("pending"), // pending, active, completed
  questions: jsonb("questions").$type<Array<{
    id: string;
    questionText: string;
    options: string[];
    correctOptionIndex: number;
    explanation: string;
    conceptId: string;
    difficulty: "easy" | "medium" | "hard";
    type: "recall" | "comprehension" | "application";
  }>>().notNull().default([]),
  conceptIds: jsonb("concept_ids").$type<string[]>().notNull().default([]),
  results: jsonb("results").$type<{
    answers: Array<{
      questionId: string;
      selectedOptionIndex: number;
      correct: boolean;
      timeSpentSeconds: number;
    }>;
    score: number; // 0-100
    accuracyByConcept: Record<string, number>;
    detectedDifficulty: "beginner" | "intermediate" | "advanced";
    recommendedPathType: "gentle" | "standard" | "intensive";
  } | null>().default(null),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("study_assessments_user_idx").on(t.userId),
  materialIdx: index("study_assessments_material_idx").on(t.materialId),
}));

// ─── Learning Path Steps (structured steps for guided learning) ───
export const studyLearningPathStepsTable = pgTable("study_learning_path_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => studyUsersTable.id, { onDelete: "cascade" }),
  pathId: uuid("path_id")
    .notNull()
    .references(() => studyLearningPathsTable.id, { onDelete: "cascade" }),
  nodeId: uuid("node_id")
    .references(() => studyKnowledgeNodesTable.id, { onDelete: "set null" }),
  conceptId: uuid("concept_id")
    .references(() => studyConceptsTable.id, { onDelete: "set null" }),
  order: integer("order").notNull(),
  stepType: text("step_type").notNull(), // read_material, flashcard_review, practice_questions, tutor_session, mastery_check, spaced_review
  title: text("title").notNull(),
  description: text("description"),
  estimatedMinutes: integer("estimated_minutes").notNull().default(10),
  status: text("status").notNull().default("locked"), // locked, available, in_progress, completed, skipped
  contentRef: text("content_ref"), // materialId, conceptId, etc
  prerequisites: jsonb("prerequisites").$type<string[]>().notNull().default([]),
  completedAt: timestamp("completed_at"),
  masteryScore: real("mastery_score"), // 0-1, set after completion
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("study_path_steps_user_idx").on(t.userId),
  pathIdx: index("study_path_steps_path_idx").on(t.pathId),
  statusIdx: index("study_path_steps_status_idx").on(t.status),
}));

// ─── Activity Log (for pattern detection) ───
export const studyActivityLogTable = pgTable("study_activity_log", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => studyUsersTable.id, { onDelete: "cascade" }),
  activityType: text("activity_type").notNull(), // flashcard_review, practice_question, exam_question, tutor_chat, material_read, annotation
  entityId: text("entity_id"), // id of related entity
  entityType: text("entity_type"), // flashcard, session, exam, etc
  durationSeconds: integer("duration_seconds"),
  accuracy: real("accuracy"), // 0-1 if applicable
  confidence: real("confidence"), // 0-1 if applicable
  difficulty: text("difficulty"),
  conceptIds: jsonb("concept_ids").$type<string[]>().notNull().default([]),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("study_activity_log_user_idx").on(t.userId),
  typeIdx: index("study_activity_log_type_idx").on(t.activityType),
  createdIdx: index("study_activity_log_created_idx").on(t.createdAt),
}));

export type StudyUser = typeof studyUsersTable.$inferSelect;
export type InsertStudyUser = typeof studyUsersTable.$inferInsert;
export type StudySession = typeof studySessionsTable.$inferSelect;
export type StudyMaterial = typeof studyMaterialsTable.$inferSelect;
export type StudyConcept = typeof studyConceptsTable.$inferSelect;
export type StudyFlashcard = typeof studyFlashcardsTable.$inferSelect;
export type StudyPracticeSession = typeof studyPracticeSessionsTable.$inferSelect;
export type StudyMockExam = typeof studyMockExamsTable.$inferSelect;
export type StudyTutorConversation = typeof studyTutorConversationsTable.$inferSelect;
export type StudyTutorMessage = typeof studyTutorMessagesTable.$inferSelect;
export type StudyLearnerProfile = typeof studyLearnerProfilesTable.$inferSelect;
export type StudyWeeklyBrief = typeof studyWeeklyBriefsTable.$inferSelect;
export type StudyKnowledgeNode = typeof studyKnowledgeNodesTable.$inferSelect;
export type StudyKnowledgeEdge = typeof studyKnowledgeEdgesTable.$inferSelect;
export type StudyContentChunk = typeof studyContentChunksTable.$inferSelect;
export type StudyAnnotation = typeof studyAnnotationsTable.$inferSelect;
export type StudyContentSource = typeof studyContentSourcesTable.$inferSelect;
export type StudyLearningPath = typeof studyLearningPathsTable.$inferSelect;
export type StudyLearningPathStep = typeof studyLearningPathStepsTable.$inferSelect;
export type StudyAssessment = typeof studyAssessmentsTable.$inferSelect;
export type StudyCognitiveProfile = typeof studyCognitiveProfilesTable.$inferSelect;
export type StudyActivityLog = typeof studyActivityLogTable.$inferSelect;
export type StudyLearningStyleProfile = typeof studyLearningStyleProfilesTable.$inferSelect;
export type InsertStudyLearningStyleProfile = typeof studyLearningStyleProfilesTable.$inferInsert;

// ─── Ambassador residual-commission program ───
// A single-tier referral program: an ambassador earns a residual share of the
// REAL, CLEARED payments made by customers they personally referred. There is no
// downline / multi-level structure: a referral links exactly one ambassador to
// one customer, and commission is only ever minted from a cleared payment row.

// One row per ambassador (a free opt-in for any logged-in Coach user).
export const studyAmbassadorsTable = pgTable("study_ambassadors", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => studyUsersTable.id, { onDelete: "cascade" }),
  referralCode: text("referral_code").notNull().unique(), // shareable code (uppercase)
  // standard = residuals only through the standard cap window; lifetime = residuals
  // continue indefinitely at the tail rate. Auto-upgraded past a referral threshold
  // or granted manually by an admin.
  tier: text("tier").notNull().default("standard"), // standard | lifetime
  status: text("status").notNull().default("active"), // active | suspended
  payoutMethod: text("payout_method"), // ecocash | mpesa | mukuru | bank_transfer
  payoutHandle: text("payout_handle"), // phone number / account reference for the payout
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  codeIdx: index("study_ambassadors_code_idx").on(t.referralCode),
}));

// Attribution: links a referred customer to the ambassador who referred them.
// customerId is unique so a customer is attributed to at most one ambassador
// (first referral wins). Depth is exactly one: we never walk a chain upward.
export const studyReferralsTable = pgTable("study_referrals", {
  id: uuid("id").primaryKey().defaultRandom(),
  ambassadorId: uuid("ambassador_id")
    .notNull()
    .references(() => studyAmbassadorsTable.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id")
    .notNull()
    .unique()
    .references(() => studyUsersTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // pending | active | churned
  attributedAt: timestamp("attributed_at").defaultNow().notNull(),
  firstPaidAt: timestamp("first_paid_at"), // when the customer first cleared a payment
}, (t) => ({
  ambassadorIdx: index("study_referrals_ambassador_idx").on(t.ambassadorId),
}));

// One row per commission earned from one cleared payment. Idempotency is enforced
// by the unique (sourceKind, sourcePaymentId) pair: re-processing a webhook or a
// poll cannot double-credit. Amounts are stored in BOTH the payment currency and
// USD (the cash-out / threshold currency) using admin-configurable FX rates.
export const studyCommissionEventsTable = pgTable("study_commission_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  referralId: uuid("referral_id")
    .notNull()
    .references(() => studyReferralsTable.id, { onDelete: "cascade" }),
  ambassadorId: uuid("ambassador_id")
    .notNull()
    .references(() => studyAmbassadorsTable.id, { onDelete: "cascade" }),
  sourceKind: text("source_kind").notNull(), // local | stripe
  sourcePaymentId: text("source_payment_id").notNull(), // local payment uuid or stripe invoice id
  grossMinor: integer("gross_minor").notNull(), // cleared payment amount, payment currency
  currency: text("currency").notNull(), // USD | ZAR | ZMW | BWP
  grossUsdMinor: integer("gross_usd_minor").notNull(), // gross normalized to USD cents
  rateApplied: real("rate_applied").notNull(), // percent applied (e.g. 20, 10, 5)
  amountMinor: integer("amount_minor").notNull(), // commission in payment currency
  amountUsdMinor: integer("amount_usd_minor").notNull(), // commission in USD cents (ledger currency)
  customerTenureMonth: integer("customer_tenure_month").notNull(), // 1-based month index since first payment
  // pending = inside the holdback window; confirmed = cleared holdback and counts
  // toward balance; clawed_back = reversed by a refund / chargeback.
  state: text("state").notNull().default("pending"), // pending | confirmed | clawed_back
  confirmAt: timestamp("confirm_at").notNull(), // paidAt + holdback window
  confirmedAt: timestamp("confirmed_at"),
  clawedBackAt: timestamp("clawed_back_at"),
  clawbackReason: text("clawback_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  ambassadorIdx: index("study_commission_events_ambassador_idx").on(t.ambassadorId),
  referralIdx: index("study_commission_events_referral_idx").on(t.referralId),
  sourceUniq: uniqueIndex("study_commission_events_source_uniq").on(t.sourceKind, t.sourcePaymentId),
}));

// Ambassador-initiated cash-out requests, paid out by an admin. Amounts are in USD
// cents and only ever a whole multiple of the configured increment ($20).
export const studyPayoutsTable = pgTable("study_payouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  ambassadorId: uuid("ambassador_id")
    .notNull()
    .references(() => studyAmbassadorsTable.id, { onDelete: "cascade" }),
  amountUsdMinor: integer("amount_usd_minor").notNull(),
  method: text("method").notNull(), // ecocash | mpesa | mukuru | bank_transfer
  handle: text("handle").notNull(), // snapshot of the payout handle at request time
  status: text("status").notNull().default("requested"), // requested | processing | paid | failed
  note: text("note"), // admin note (e.g. transfer reference or failure reason)
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  settledAt: timestamp("settled_at"),
}, (t) => ({
  ambassadorIdx: index("study_payouts_ambassador_idx").on(t.ambassadorId),
}));

// Singleton config row driving every rate / cap / window. Admin-editable.
export const studyAmbassadorSettingsTable = pgTable("study_ambassador_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Tapering schedule: ordered brackets matched by customer tenure month. maxMonth
  // null = open-ended tail. e.g. m1-3 = 20%, m4-12 = 10%, m13+ = 5%.
  schedule: jsonb("schedule").$type<Array<{ minMonth: number; maxMonth: number | null; ratePct: number }>>()
    .notNull()
    .default([
      { minMonth: 1, maxMonth: 3, ratePct: 20 },
      { minMonth: 4, maxMonth: 12, ratePct: 10 },
      { minMonth: 13, maxMonth: null, ratePct: 5 },
    ]),
  // Standard ambassadors earn residuals only through this many tenure months;
  // lifetime ambassadors keep earning the tail rate indefinitely.
  standardCapMonths: integer("standard_cap_months").notNull().default(12),
  // Active referrals at or above this count auto-upgrade an ambassador to lifetime.
  lifetimeThresholdReferrals: integer("lifetime_threshold_referrals").notNull().default(10),
  // Holdback window (days) before a pending commission becomes confirmed.
  holdbackDays: integer("holdback_days").notNull().default(30),
  // Allowed payout rails.
  payoutMethods: jsonb("payout_methods").$type<string[]>()
    .notNull()
    .default(["ecocash", "mpesa", "mukuru", "bank_transfer"]),
  // USD per 1 unit of each currency (used to normalize commissions to USD cents).
  fxRatesToUsd: jsonb("fx_rates_to_usd").$type<Record<string, number>>()
    .notNull()
    .default({ USD: 1, ZAR: 0.054, ZMW: 0.037, BWP: 0.074 }),
  // Cash-out granularity in USD cents (2000 = $20).
  cashoutIncrementUsdMinor: integer("cashout_increment_usd_minor").notNull().default(2000),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type StudyAmbassador = typeof studyAmbassadorsTable.$inferSelect;
export type StudyReferral = typeof studyReferralsTable.$inferSelect;
export type StudyCommissionEvent = typeof studyCommissionEventsTable.$inferSelect;
export type StudyPayout = typeof studyPayoutsTable.$inferSelect;
export type StudyAmbassadorSettings = typeof studyAmbassadorSettingsTable.$inferSelect;

// ═════════════════════════════════════════════════════════════════════════════
// Admin & analytics (ported from the Arete admin so Coach has the same operator
// visibility): usage/session telemetry, audit trail, announcements, pricing +
// payment-method catalogs. Powers the admin console and upgrade targeting.
// ═════════════════════════════════════════════════════════════════════════════

// A visit/session. The client sends heartbeats while the app is open; a gap longer
// than the session window starts a new row. startedAt is effectively a login time;
// (lastSeenAt - startedAt) is the time spent in that session. Captures where/how the
// visit originated (once, at session start) for geo/device analytics.
export const studyActivitySessionsTable = pgTable(
  "study_activity_sessions",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => studyUsersTable.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    device: text("device"), // parsed "Chrome · Windows · Desktop"
    country: text("country"),
    region: text("region"),
    city: text("city"),
    entryPath: text("entry_path"), // first path the visit landed on
  },
  (t) => ({
    byUser: index("study_activity_sessions_user_idx").on(t.userId),
    byStarted: index("study_activity_sessions_started_idx").on(t.startedAt),
  }),
);

// Append-only trail of privileged admin actions for accountability.
export const studyAdminAuditLogTable = pgTable(
  "study_admin_audit_log",
  {
    id: serial("id").primaryKey(),
    actorUserId: uuid("actor_user_id"),
    actorEmail: text("actor_email"),
    action: text("action").notNull(), // user.suspend | plan.update | announcement.create ...
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    byCreated: index("study_admin_audit_created_idx").on(t.createdAt),
  }),
);

// In-app broadcast messages shown to learners. audience targets a segment; used for
// upgrade nudges aimed specifically at free users.
export const studyAnnouncementsTable = pgTable(
  "study_announcements",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    audience: text("audience").notNull().default("all"), // all | free | paid
    level: text("level").notNull().default("info"), // info | success | warning | promo
    active: boolean("active").notNull().default(true),
    createdByEmail: text("created_by_email"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deactivatedAt: timestamp("deactivated_at"),
  },
  (t) => ({
    byActive: index("study_announcements_active_idx").on(t.active),
  }),
);

// Pricing catalog: plan tiers shown on the upgrade page and managed in admin.
export const studyPlansTable = pgTable("study_plans", {
  id: serial("id").primaryKey(),
  key: text("key").unique().notNull(), // free | plus | pro ...
  name: text("name").notNull(),
  description: text("description"),
  priceMinor: integer("price_minor").notNull().default(0), // cents per interval
  currency: text("currency").notNull().default("USD"),
  interval: text("interval").notNull().default("month"), // month | year | once
  features: jsonb("features").$type<string[]>().notNull().default([]),
  monthlyGenerationCap: integer("monthly_generation_cap"), // null = unlimited
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Which payment methods/gateways are offered, and where. Managed in admin.
export const studyPaymentMethodsTable = pgTable("study_payment_methods", {
  id: serial("id").primaryKey(),
  key: text("key").unique().notNull(), // paynow | flutterwave | stripe | ecocash ...
  label: text("label").notNull(),
  provider: text("provider").notNull(),
  countries: jsonb("countries").$type<string[]>().notNull().default([]),
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type StudyActivitySession = typeof studyActivitySessionsTable.$inferSelect;
export type StudyAnnouncement = typeof studyAnnouncementsTable.$inferSelect;
export type StudyPlan = typeof studyPlansTable.$inferSelect;
export type StudyPaymentMethod = typeof studyPaymentMethodsTable.$inferSelect;
