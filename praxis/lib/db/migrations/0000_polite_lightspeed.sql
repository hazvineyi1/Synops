CREATE TYPE "public"."access_request_status" AS ENUM('pending', 'approved', 'denied');--> statement-breakpoint
CREATE TYPE "public"."activity_event_type" AS ENUM('enrolment', 'completion', 'credential_issued', 'submission', 'session_mastered');--> statement-breakpoint
CREATE TYPE "public"."assessment_status_enum" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."assessment_type" AS ENUM('diagnostic', 'mastery', 'formative');--> statement-breakpoint
CREATE TYPE "public"."attempt_status" AS ENUM('in_progress', 'complete');--> statement-breakpoint
CREATE TYPE "public"."assignment_submission_status" AS ENUM('not_submitted', 'submitted', 'late', 'graded', 'resubmission_requested', 'excused');--> statement-breakpoint
CREATE TYPE "public"."assignment_type" AS ENUM('essay', 'quiz', 'file_upload', 'discussion', 'peer_review', 'url_entry', 'media_recording', 'external_tool');--> statement-breakpoint
CREATE TYPE "public"."login_outcome" AS ENUM('success', 'bad_password', 'unknown_email', 'suspended', 'impersonated');--> statement-breakpoint
CREATE TYPE "public"."audio_status" AS ENUM('none', 'pending', 'ready', 'error');--> statement-breakpoint
CREATE TYPE "public"."beat_type" AS ENUM('title_card', 'points', 'scenario', 'compare', 'diagram', 'close', 'video');--> statement-breakpoint
CREATE TYPE "public"."tenant_type" AS ENUM('platform', 'partner', 'organisation');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('assignment', 'quiz', 'discussion', 'class_session', 'deadline', 'holiday', 'other');--> statement-breakpoint
CREATE TYPE "public"."compliance_framework" AS ENUM('qcto', 'seta', 'nqf', 'other');--> statement-breakpoint
CREATE TYPE "public"."course_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."credential_status" AS ENUM('valid', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'excused', 'late');--> statement-breakpoint
CREATE TYPE "public"."delivery_session_type" AS ENUM('in_person', 'virtual', 'mentoring', 'workshop');--> statement-breakpoint
CREATE TYPE "public"."enrolment_status" AS ENUM('active', 'completed', 'withdrawn', 'waitlisted');--> statement-breakpoint
CREATE TYPE "public"."coach_personality" AS ENUM('socratic_mentor', 'drill_sergeant', 'warm_encourager', 'strategic_analyst');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'partner_admin', 'org_admin', 'coach', 'learner', 'instructional_designer', 'funder');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('invited', 'active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."partner_status" AS ENUM('active', 'suspended', 'onboarding');--> statement-breakpoint
CREATE TYPE "public"."lesson_type" AS ENUM('socratic', 'video', 'slides', 'quiz');--> statement-breakpoint
CREATE TYPE "public"."module_modality" AS ENUM('async', 'sync', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."module_status" AS ENUM('draft', 'review', 'published');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('generating', 'ready', 'published');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('active', 'mastered', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('submitted', 'reviewed', 'approved');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('assignment_due', 'assignment_graded', 'discussion_reply', 'announcement', 'enrolment', 'credential_issued', 'submission_feedback', 'mention', 'course_update', 'system');--> statement-breakpoint
CREATE TYPE "public"."iv_question_type" AS ENUM('multiple_choice', 'check_all', 'fill_blank', 'reflection', 'poll', 'hotspot');--> statement-breakpoint
CREATE TYPE "public"."activity_submission_status" AS ENUM('submitted', 'reviewed', 'approved');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_status" AS ENUM('open', 'pending', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."coach_plan_status" AS ENUM('active', 'completed');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_mode" AS ENUM('idle', 'session');--> statement-breakpoint
CREATE TABLE "access_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"email" text NOT NULL,
	"organisation_name" text,
	"requested_role" text DEFAULT 'org_admin' NOT NULL,
	"message" text,
	"status" "access_request_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by_id" text,
	"reviewer_note" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" text PRIMARY KEY NOT NULL,
	"activity_event_type" "activity_event_type" NOT NULL,
	"description" text NOT NULL,
	"user_id" text,
	"module_id" text,
	"partner_id" text,
	"organisation_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"actor_id" text,
	"actor_role" text,
	"partner_id" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text,
	"author_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"platform_wide" boolean DEFAULT false NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_items" (
	"id" text PRIMARY KEY NOT NULL,
	"assessment_id" text NOT NULL,
	"stem" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_option_id" text NOT NULL,
	"difficulty" numeric(5, 4) DEFAULT '0.5' NOT NULL,
	"competency_tag" text,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"assessment_type" "assessment_type" NOT NULL,
	"assessment_status_enum" "assessment_status_enum" DEFAULT 'draft' NOT NULL,
	"tenant_id" text NOT NULL,
	"competency_tags" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"assessment_id" text NOT NULL,
	"user_id" text NOT NULL,
	"attempt_status" "attempt_status" DEFAULT 'in_progress' NOT NULL,
	"current_item_id" text,
	"overall_ability" numeric(5, 4),
	"competency_scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "item_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"attempt_id" text NOT NULL,
	"item_id" text NOT NULL,
	"selected_option_id" text NOT NULL,
	"correct" boolean NOT NULL,
	"response_time_ms" integer,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignment_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"assignment_id" text NOT NULL,
	"user_id" text NOT NULL,
	"group_id" text,
	"body" text,
	"file_urls" text[] DEFAULT '{}' NOT NULL,
	"url" text,
	"media_url" text,
	"assignment_submission_status" "assignment_submission_status" DEFAULT 'not_submitted' NOT NULL,
	"score" numeric(7, 2),
	"letter_grade" text,
	"feedback" text,
	"graded_by" text,
	"graded_at" timestamp,
	"rubric_assessment" jsonb,
	"parsed_text" text,
	"source_filename" text,
	"ai_score" numeric(7, 2),
	"ai_feedback" text,
	"ai_rubric_assessment" jsonb,
	"ai_graded_at" timestamp,
	"submitted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"module_id" text,
	"title" text NOT NULL,
	"description" text,
	"instructions" text,
	"assignment_type" "assignment_type" DEFAULT 'essay' NOT NULL,
	"due_date" timestamp,
	"available_from" timestamp,
	"available_until" timestamp,
	"points_possible" numeric(7, 2) DEFAULT '100' NOT NULL,
	"allow_late_submissions" boolean DEFAULT true NOT NULL,
	"late_penalty_percent" integer DEFAULT 0 NOT NULL,
	"rubric_id" text,
	"group_assignment" boolean DEFAULT false NOT NULL,
	"peer_review_required" boolean DEFAULT false NOT NULL,
	"peer_review_count" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gradebook_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"course_id" text NOT NULL,
	"assignment_id" text NOT NULL,
	"score" numeric(7, 2),
	"possible_score" numeric(7, 2) NOT NULL,
	"letter_grade" text,
	"excused" boolean DEFAULT false NOT NULL,
	"missing" boolean DEFAULT false NOT NULL,
	"late" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rubrics" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"title" text NOT NULL,
	"criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_points" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"partner_id" text,
	"organisation_id" text,
	"created_by_user_id" text,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"user_id" text NOT NULL,
	"impersonator_id" text,
	"ip_address" text,
	"user_agent" text,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "login_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"email" text,
	"outcome" "login_outcome" NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"impersonator_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"issued_by" text DEFAULT 'self_service' NOT NULL,
	"issued_by_user_id" text,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "password_resets_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "beats" (
	"id" text PRIMARY KEY NOT NULL,
	"module_id" text NOT NULL,
	"beat_type" "beat_type" NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"narration" text NOT NULL,
	"bullet_points" text[] DEFAULT '{}' NOT NULL,
	"scenario" text,
	"visual_data" jsonb,
	"video_url" text,
	"video_duration_seconds" integer,
	"transcript" text,
	"audio_url" text,
	"audio_status" "audio_status" DEFAULT 'none' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"partner_id" text NOT NULL,
	"org_id" text,
	"org_name" text,
	"number" text NOT NULL,
	"period" text,
	"net" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'due' NOT NULL,
	"issued" text,
	"due" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"partner_id" text NOT NULL,
	"org_id" text,
	"org_name" text,
	"plan_name" text DEFAULT 'Standard' NOT NULL,
	"price_per_seat" integer DEFAULT 0 NOT NULL,
	"seats" integer DEFAULT 0 NOT NULL,
	"active_seats" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_themes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"tenant_type" "tenant_type" NOT NULL,
	"display_name" text,
	"primary_color" text,
	"secondary_color" text,
	"accent_color" text,
	"logo_url" text,
	"favicon_url" text,
	"font_family" text,
	"credential_title" text,
	"email_sender_name" text,
	"custom_domain" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_events" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text,
	"user_id" text,
	"title" text NOT NULL,
	"description" text,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"all_day" boolean DEFAULT false NOT NULL,
	"event_type" "event_type" DEFAULT 'other' NOT NULL,
	"linked_assignment_id" text,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_pages" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"author_id" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"front_page" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"tier" text NOT NULL,
	"partner_id" text,
	"organisation_id" text,
	"user_id" text,
	"group_id" text,
	"parent_assignment_id" text,
	"assigned_by" text NOT NULL,
	"assigned_by_name" text,
	"status" text DEFAULT 'assigned' NOT NULL,
	"due_date" timestamp,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_embed_links" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"organisation_id" text,
	"created_by" text NOT NULL,
	"token" text NOT NULL,
	"label" text,
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"access_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "case_embed_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "case_link_access" (
	"id" text PRIMARY KEY NOT NULL,
	"embed_link_id" text NOT NULL,
	"case_id" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_rubrics" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"organisation_id" text,
	"criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_points" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_scenarios" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text,
	"module_id" text,
	"created_by" text NOT NULL,
	"created_by_name" text,
	"title" text NOT NULL,
	"learning_objective" text,
	"context_block" text DEFAULT '' NOT NULL,
	"opening_question" text,
	"focus_areas" text[],
	"ai_constraints" text,
	"guiding_instructions" text,
	"ai_persona" text,
	"tutor_name" text,
	"tutor_avatar" text,
	"language" text DEFAULT 'en' NOT NULL,
	"difficulty" text DEFAULT 'intermediate' NOT NULL,
	"blooms_level" text,
	"prompt_limit" integer DEFAULT 8 NOT NULL,
	"socratic_style" text DEFAULT 'maieutic' NOT NULL,
	"ai_tone" text DEFAULT 'standard' NOT NULL,
	"is_library" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"tags" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"organisation_id" text,
	"embed_link_id" text,
	"user_id" text,
	"learner_name" text,
	"language" text,
	"translated_context" text,
	"translated_objective" text,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prompt_count" integer DEFAULT 0 NOT NULL,
	"prompt_limit" integer DEFAULT 8 NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"engagement_score" integer,
	"engagement_narrative" text,
	"concepts_addressed" text[],
	"reasoning_strengths" text[],
	"development_areas" text[],
	"rubric_scores" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "unit_standard_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"unit_standard_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_standards" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"framework" "compliance_framework" DEFAULT 'qcto' NOT NULL,
	"nqf_level" integer,
	"credits" integer,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_partner_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"partner_id" text NOT NULL,
	"assigned_by" text,
	"assigned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"tenant_id" text NOT NULL,
	"status" "course_status" DEFAULT 'draft' NOT NULL,
	"module_count" integer DEFAULT 0 NOT NULL,
	"enrolment_count" integer DEFAULT 0 NOT NULL,
	"competency_tags" text[] DEFAULT '{}' NOT NULL,
	"objectives" text[] DEFAULT '{}' NOT NULL,
	"nqf_level" integer,
	"thumbnail_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"module_id" text NOT NULL,
	"module_title" text NOT NULL,
	"partner_id" text NOT NULL,
	"partner_name" text NOT NULL,
	"credential_status" "credential_status" DEFAULT 'valid' NOT NULL,
	"mastery_score" numeric(5, 4) NOT NULL,
	"evidence_summary" text DEFAULT '' NOT NULL,
	"badge_url" text,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"decay_date" timestamp NOT NULL,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "evidence_records" (
	"id" text PRIMARY KEY NOT NULL,
	"credential_id" text,
	"user_id" text NOT NULL,
	"session_id" text,
	"attempt_id" text,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"score" numeric(5, 4),
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delegated_admins" (
	"id" text PRIMARY KEY NOT NULL,
	"partner_id" text NOT NULL,
	"org_id" text,
	"org_name" text,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"powers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" "attendance_status" DEFAULT 'present' NOT NULL,
	"coaching_hours" numeric,
	"recorded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"course_id" text,
	"module_id" text,
	"facilitator_id" text,
	"title" text NOT NULL,
	"session_type" "delivery_session_type" DEFAULT 'in_person' NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"location" text,
	"join_url" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discussion_replies" (
	"id" text PRIMARY KEY NOT NULL,
	"discussion_id" text NOT NULL,
	"parent_reply_id" text,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"is_instructor_reply" boolean DEFAULT false NOT NULL,
	"is_ai_facilitator" boolean DEFAULT false NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discussions" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"author_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"is_announcement" boolean DEFAULT false NOT NULL,
	"is_closed" boolean DEFAULT false NOT NULL,
	"require_initial_post" boolean DEFAULT false NOT NULL,
	"graded" boolean DEFAULT false NOT NULL,
	"assignment_id" text,
	"module_id" text,
	"ai_facilitated" boolean DEFAULT false NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"min_initial_words" integer DEFAULT 100 NOT NULL,
	"max_initial_words" integer DEFAULT 150 NOT NULL,
	"min_reply_words" integer DEFAULT 50 NOT NULL,
	"required_interactions" integer DEFAULT 5 NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrolments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"course_id" text NOT NULL,
	"enrolment_status" "enrolment_status" DEFAULT 'active' NOT NULL,
	"role" text DEFAULT 'student' NOT NULL,
	"final_grade" numeric(5, 2),
	"final_letter_grade" text,
	"enrolled_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "funded_seat_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"partner_id" text NOT NULL,
	"agreement_id" text NOT NULL,
	"learner_id" text NOT NULL,
	"learner_name" text,
	"assigned_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funder_scopes" (
	"id" text PRIMARY KEY NOT NULL,
	"funder_id" text NOT NULL,
	"organisation_id" text NOT NULL,
	"course_id" text,
	"label" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funding_agreements" (
	"id" text PRIMARY KEY NOT NULL,
	"partner_id" text NOT NULL,
	"funder_name" text NOT NULL,
	"funder_type" text DEFAULT 'SETA' NOT NULL,
	"org_id" text,
	"org_name" text,
	"seats_funded" integer DEFAULT 0 NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"start_date" text,
	"expiry" text,
	"status" text DEFAULT 'active' NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"alert_id" text NOT NULL,
	"from_user_id" text NOT NULL,
	"from_role" text DEFAULT 'coach' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gradebook_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'on_track' NOT NULL,
	"reasons" text[] DEFAULT '{}' NOT NULL,
	"mastery_pct" numeric(5, 2),
	"plan_id" text,
	"notified_at" timestamp,
	"coach_note" text,
	"coach_assist" jsonb,
	"coach_assist_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	CONSTRAINT "gradebook_alerts_course_id_user_id_unique" UNIQUE("course_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "gradebook_cells" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"user_id" text NOT NULL,
	"manual_score" numeric(7, 2),
	"note" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gradebook_cells_item_id_user_id_unique" UNIQUE("item_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "gradebook_items" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text,
	"title" text NOT NULL,
	"category" text DEFAULT 'General' NOT NULL,
	"item_type" text DEFAULT 'summative' NOT NULL,
	"grade_type" text DEFAULT 'points' NOT NULL,
	"points_possible" numeric(7, 2) DEFAULT '100' NOT NULL,
	"due_date" timestamp,
	"include_in_grade" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gradebook_items_course_id_source_type_source_id_unique" UNIQUE("course_id","source_type","source_id")
);
--> statement-breakpoint
CREATE TABLE "gradebook_org_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"org_id" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text,
	"grade_type" text,
	"item_type" text,
	"points_possible" numeric(7, 2),
	"include_in_grade" boolean,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gradebook_org_overrides_course_id_org_id_source_type_source_id_unique" UNIQUE("course_id","org_id","source_type","source_id")
);
--> statement-breakpoint
CREATE TABLE "gradebook_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"weighting_enabled" boolean DEFAULT false NOT NULL,
	"summative_weight" integer DEFAULT 100 NOT NULL,
	"formative_weight" integer DEFAULT 0 NOT NULL,
	"category_weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"letters_enabled" boolean DEFAULT false NOT NULL,
	"letter_bands" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gradebook_settings_course_id_unique" UNIQUE("course_id")
);
--> statement-breakpoint
CREATE TABLE "course_group_members" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"max_members" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_id" text,
	"password_hash" text,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"archived_at" timestamp,
	"deleted_at" timestamp,
	"last_login_at" timestamp,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"avatar_url" text,
	"role" "user_role" DEFAULT 'learner' NOT NULL,
	"partner_id" text,
	"organisation_id" text,
	"coach_personality" "coach_personality" DEFAULT 'socratic_mentor' NOT NULL,
	"learning_style" text,
	"accommodations" text[] DEFAULT '{}' NOT NULL,
	"phone" text,
	"whatsapp_opt_in" boolean DEFAULT false NOT NULL,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"mfa_secret" text,
	"mfa_backup_codes" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "partner_status" DEFAULT 'onboarding' NOT NULL,
	"contact_email" text,
	"org_count" integer DEFAULT 0 NOT NULL,
	"learner_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "partners_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"partner_id" text NOT NULL,
	"industry" text,
	"member_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"module_status" "module_status" DEFAULT 'draft' NOT NULL,
	"lesson_type" "lesson_type" DEFAULT 'socratic' NOT NULL,
	"objectives" text[] DEFAULT '{}' NOT NULL,
	"module_modality" "module_modality" DEFAULT 'async' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"beat_count" integer DEFAULT 0 NOT NULL,
	"estimated_minutes" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "beat_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"beat_id" text NOT NULL,
	"module_id" text NOT NULL,
	"course_id" text NOT NULL,
	"seconds_spent" integer DEFAULT 0 NOT NULL,
	"first_viewed_at" timestamp DEFAULT now() NOT NULL,
	"last_viewed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "beat_progress_user_beat_unique" UNIQUE("user_id","beat_id")
);
--> statement-breakpoint
CREATE TABLE "script_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"source_text" text NOT NULL,
	"draft_status" "draft_status" DEFAULT 'generating' NOT NULL,
	"beats_data" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tenant_id" text NOT NULL,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dialogue_turns" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"beat_id" text,
	"reasoning" text,
	"mastery_delta" numeric(5, 4),
	"options" jsonb,
	"select_mode" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"module_id" text NOT NULL,
	"user_id" text NOT NULL,
	"session_status" "session_status" DEFAULT 'active' NOT NULL,
	"mastery_score" numeric(5, 4) DEFAULT '0' NOT NULL,
	"current_beat_id" text,
	"turn_count" integer DEFAULT 0 NOT NULL,
	"remedial_focus" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"module_id" text NOT NULL,
	"module_title" text DEFAULT '' NOT NULL,
	"title" text NOT NULL,
	"content_text" text,
	"submission_status" "submission_status" DEFAULT 'submitted' NOT NULL,
	"coach_feedback" text,
	"coach_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"notification_type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"read" boolean DEFAULT false NOT NULL,
	"course_id" text,
	"actor_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "interactive_video_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"beat_id" text NOT NULL,
	"video_timestamp" numeric(8, 2) NOT NULL,
	"iv_question_type" "iv_question_type" DEFAULT 'multiple_choice' NOT NULL,
	"stem" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"correct_option_ids" text[] DEFAULT '{}' NOT NULL,
	"feedback_correct" text,
	"feedback_incorrect" text,
	"pause_on_reach" boolean DEFAULT true NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"points" numeric(5, 2) DEFAULT '1' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iv_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL,
	"session_id" text,
	"user_id" text NOT NULL,
	"response" jsonb NOT NULL,
	"correct" boolean,
	"score" numeric(5, 2),
	"answered_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"activity_id" text NOT NULL,
	"tier" text NOT NULL,
	"partner_id" text,
	"organisation_id" text,
	"user_id" text,
	"group_id" text,
	"parent_assignment_id" text,
	"assigned_by" text NOT NULL,
	"assigned_by_name" text,
	"status" text DEFAULT 'assigned' NOT NULL,
	"due_date" timestamp,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_embed_links" (
	"id" text PRIMARY KEY NOT NULL,
	"activity_id" text NOT NULL,
	"organisation_id" text,
	"created_by" text NOT NULL,
	"token" text NOT NULL,
	"label" text,
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"access_count" numeric(12, 0) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "activity_embed_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "activity_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"activity_id" text NOT NULL,
	"user_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score" numeric(7, 2),
	"status" "activity_submission_status" DEFAULT 'submitted' NOT NULL,
	"feedback" text,
	"reviewed_by" text,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "interactive_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text,
	"course_id" text,
	"module_id" text,
	"title" text NOT NULL,
	"instructions" text,
	"html" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'html' NOT NULL,
	"embed_url" text,
	"kind" text DEFAULT 'custom' NOT NULL,
	"blooms_level" text,
	"difficulty" text,
	"is_library" boolean DEFAULT false NOT NULL,
	"tags" text[],
	"max_score" numeric(7, 2) DEFAULT '100' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_ticket_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"is_staff_reply" boolean DEFAULT false NOT NULL,
	"is_internal_note" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"requester_id" text NOT NULL,
	"assignee_id" text,
	"status" "support_ticket_status" DEFAULT 'open' NOT NULL,
	"priority" "support_ticket_priority" DEFAULT 'normal' NOT NULL,
	"partner_id" text,
	"organisation_id" text,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_files" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text,
	"uploader_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer,
	"folder" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan_date" date NOT NULL,
	"rationale" text DEFAULT '' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"coach_plan_status" "coach_plan_status" DEFAULT 'active' NOT NULL,
	"course_id" text,
	"source" text DEFAULT 'coach' NOT NULL,
	"coach_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concept_mastery" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"module_id" text NOT NULL,
	"module_title" text DEFAULT '' NOT NULL,
	"course_id" text,
	"mastery" numeric(5, 4) DEFAULT '0' NOT NULL,
	"ef" numeric(4, 2) DEFAULT '2.5' NOT NULL,
	"interval" integer DEFAULT 0 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"last_grade" integer,
	"due_date" date,
	"last_reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "concept_mastery_user_id_module_id_unique" UNIQUE("user_id","module_id")
);
--> statement-breakpoint
CREATE TABLE "coach_gamification" (
	"user_id" text PRIMARY KEY NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_activity_date" date,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remedial_flashcards" (
	"id" text PRIMARY KEY NOT NULL,
	"set_id" text NOT NULL,
	"user_id" text NOT NULL,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"hint" text,
	"order" integer DEFAULT 0 NOT NULL,
	"mastery" real DEFAULT 0 NOT NULL,
	"ef" real DEFAULT 2.5 NOT NULL,
	"interval" integer DEFAULT 0 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"due_date" date,
	"last_reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remedial_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"set_id" text NOT NULL,
	"user_id" text NOT NULL,
	"prompt" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"correct_index" integer NOT NULL,
	"explanation" text,
	"difficulty" text DEFAULT 'medium' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_choice" integer,
	"last_correct" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remedial_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" text,
	"course_id" text,
	"category" text NOT NULL,
	"learner_name" text,
	"source" text DEFAULT 'class' NOT NULL,
	"title" text,
	"status" text DEFAULT 'ready' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"phone" text NOT NULL,
	"whatsapp_mode" "whatsapp_mode" DEFAULT 'idle' NOT NULL,
	"current_session_id" text,
	"current_module_id" text,
	"current_beat_id" text,
	"context" jsonb,
	"last_message_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_conversations_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"phone" text NOT NULL,
	"direction" text NOT NULL,
	"body" text NOT NULL,
	"twilio_sid" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_prompt_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_by_name" text,
	"title" text NOT NULL,
	"category" text DEFAULT 'Our templates' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"prompt_text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_figures" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text,
	"created_by" text NOT NULL,
	"name" text NOT NULL,
	"image" text NOT NULL,
	"gender" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_readings" (
	"id" text PRIMARY KEY NOT NULL,
	"module_id" text NOT NULL,
	"course_id" text,
	"title" text NOT NULL,
	"kind" text DEFAULT 'document' NOT NULL,
	"source_url" text,
	"filename" text,
	"content" text,
	"chars" integer DEFAULT 0 NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"partner_id" text NOT NULL,
	"assigned_by" text,
	"assigned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"level" text NOT NULL,
	"modality" text NOT NULL,
	"modules" integer DEFAULT 1 NOT NULL,
	"hours" integer DEFAULT 1 NOT NULL,
	"standard" text,
	"description" text,
	"kind" text DEFAULT 'course' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_content" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"meta" text,
	"url" text,
	"storage_path" text,
	"tags" text,
	"reviewed" boolean DEFAULT false NOT NULL,
	"added_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"partner_id" text NOT NULL,
	"org_id" text,
	"org_name" text,
	"name" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"size" text,
	"file_url" text,
	"template_key" text,
	"uploaded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_announcements" (
	"id" text PRIMARY KEY NOT NULL,
	"partner_id" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"audience_label" text DEFAULT 'All organisations' NOT NULL,
	"channel" text DEFAULT 'both' NOT NULL,
	"recipients" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_filings" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"doc_type" text DEFAULT 'MOU' NOT NULL,
	"partner" text DEFAULT 'Platform',
	"counterparty" text,
	"status" text DEFAULT 'active' NOT NULL,
	"signed" text,
	"expires" text,
	"size" text,
	"file_url" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_class_courses" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"course_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_class_learners" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"learner_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_class_staff" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"staff_id" text NOT NULL,
	"role" text DEFAULT 'facilitator' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_classes" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"partner_id" text,
	"name" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_partner_idx" ON "api_keys" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "login_events_user_idx" ON "login_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "login_events_created_idx" ON "login_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "password_resets_user_idx" ON "password_resets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "beat_progress_user_course_idx" ON "beat_progress" USING btree ("user_id","course_id");--> statement-breakpoint
CREATE INDEX "beat_progress_user_module_idx" ON "beat_progress" USING btree ("user_id","module_id");--> statement-breakpoint
CREATE INDEX "remedial_flashcards_set_idx" ON "remedial_flashcards" USING btree ("set_id");--> statement-breakpoint
CREATE INDEX "remedial_questions_set_idx" ON "remedial_questions" USING btree ("set_id");--> statement-breakpoint
CREATE INDEX "remedial_sets_user_idx" ON "remedial_sets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "module_readings_module_idx" ON "module_readings" USING btree ("module_id");