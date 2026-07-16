import { pgTable, text, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";

/**
 * Authored case / scenario Socratic learning vehicle (ported from Sokratify).
 *
 * A "case" is an authored fact pattern with a learning objective, a calibrated opening
 * question, focus areas to probe, and hard AI constraints (things the tutor must never
 * reveal). Learners work the case through Praxis's existing Socratic dialogue loop; at
 * the end an AI analysis scores engagement and reasoning and (optionally) the rubric.
 *
 * Integration notes:
 *  - Runtime reuses the Socratic engine (lib/caseEngine wraps lib/socraticEngine).
 *  - Rubrics can link criteria to QCTO/SETA unit standards (schema/compliance.ts) via
 *    `unit_standard_mappings` rows with target_type='case', so a case's reasoning targets
 *    flow into the accreditation report — an upgrade over Sokratify (whose rubric linked
 *    to nothing).
 *  - Case sessions are stored separately from module `sessions` because a case has its own
 *    prompt-budget runtime and can run UNAUTHENTICATED via a signed embed link.
 */

export type RubricLevel = { label: string; points: number; description: string };
export type RubricCriterion = {
  name: string;
  maxPoints: number;
  /** Optional link to a QCTO/SETA unit standard this criterion assesses. */
  unitStandardId?: string | null;
  levels: RubricLevel[];
};

export type CaseMessage = { role: "tutor" | "learner"; content: string; at?: string };
export type CaseRubricScore = { criterion: string; points: number; maxPoints: number; note: string };

/** The authored case itself. organisationId null = shared platform library. */
export const caseScenariosTable = pgTable("case_scenarios", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organisationId: text("organisation_id"),
  moduleId: text("module_id"),
  createdBy: text("created_by").notNull(),
  createdByName: text("created_by_name"),
  title: text("title").notNull(),
  learningObjective: text("learning_objective"),
  contextBlock: text("context_block").notNull().default(""),
  /** Author-written calibrated opener; if null, the engine generates one from context. */
  openingQuestion: text("opening_question"),
  focusAreas: text("focus_areas").array(),
  aiConstraints: text("ai_constraints"),
  guidingInstructions: text("guiding_instructions"),
  /**
   * Content-agnostic AI persona: WHO the tutor is for this case (e.g. "a pragmatic
   * small-business finance mentor"). Sets the domain-expert lens the Socratic questions
   * come from. Null = a neutral entrepreneurship mentor.
   */
  aiPersona: text("ai_persona"),
  /** Tutor display name (e.g. "Coach Naledi"). Null = a default name. */
  tutorName: text("tutor_name"),
  /** Tutor face: a preset key (f1/f2/f3/m1/m2/m3) or a data:/https image URL for a custom upload. */
  tutorAvatar: text("tutor_avatar"),
  /** Default dialogue language: en | zu (isiZulu) | xh (isiXhosa) | af (Afrikaans) | sn (Shona). */
  language: text("language").notNull().default("en"),
  difficulty: text("difficulty", { enum: ["foundational", "intermediate", "advanced"] }).notNull().default("intermediate"),
  bloomsLevel: text("blooms_level"),
  promptLimit: integer("prompt_limit").notNull().default(8),
  socraticStyle: text("socratic_style").notNull().default("maieutic"),
  aiTone: text("ai_tone").notNull().default("standard"),
  isLibrary: boolean("is_library").notNull().default(false),
  status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type CaseScenario = typeof caseScenariosTable.$inferSelect;

/** One rubric per case: freeform criteria that sum to totalPoints, optionally standard-linked. */
export const caseRubricsTable = pgTable("case_rubrics", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  caseId: text("case_id").notNull(),
  organisationId: text("organisation_id"),
  criteria: jsonb("criteria").$type<RubricCriterion[]>().notNull().default([]),
  totalPoints: integer("total_points").notNull().default(100),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type CaseRubric = typeof caseRubricsTable.$inferSelect;

/**
 * A learner attempt at a case. `userId` is null for unauthenticated embed sessions
 * (learnerName is captured instead). The transcript is stored as a JSON message array so
 * embed sessions do not need the authenticated `dialogue_turns` table.
 */
export const caseSessionsTable = pgTable("case_sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  caseId: text("case_id").notNull(),
  organisationId: text("organisation_id"),
  embedLinkId: text("embed_link_id"),
  userId: text("user_id"),
  learnerName: text("learner_name"),
  /** The language this attempt is running in (learner's choice; falls back to the case default). */
  language: text("language"),
  messages: jsonb("messages").$type<CaseMessage[]>().notNull().default([]),
  promptCount: integer("prompt_count").notNull().default(0),
  promptLimit: integer("prompt_limit").notNull().default(8),
  status: text("status", { enum: ["in_progress", "completed", "abandoned"] }).notNull().default("in_progress"),
  // ── End-of-session analysis (the piece Praxis lacked) ──
  engagementScore: integer("engagement_score"),
  engagementNarrative: text("engagement_narrative"),
  conceptsAddressed: text("concepts_addressed").array(),
  reasoningStrengths: text("reasoning_strengths").array(),
  developmentAreas: text("development_areas").array(),
  rubricScores: jsonb("rubric_scores").$type<CaseRubricScore[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export type CaseSession = typeof caseSessionsTable.$inferSelect;

/** Signed public embed link: an opaque token that runs a case without authentication. */
export const caseEmbedLinksTable = pgTable("case_embed_links", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  caseId: text("case_id").notNull(),
  organisationId: text("organisation_id"),
  createdBy: text("created_by").notNull(),
  token: text("token").notNull().unique(),
  label: text("label"),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  accessCount: integer("access_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CaseEmbedLink = typeof caseEmbedLinksTable.$inferSelect;

/** Lightweight access log for embed links (who opened a public case, and when). */
export const caseLinkAccessTable = pgTable("case_link_access", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  embedLinkId: text("embed_link_id").notNull(),
  caseId: text("case_id").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CaseLinkAccess = typeof caseLinkAccessTable.$inferSelect;
