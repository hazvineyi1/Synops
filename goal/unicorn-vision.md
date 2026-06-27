# The Coach Unicorn Vision

## Purpose

This document turns the current AI Study Coach application into an implementation-ready company vision. It answers three questions:

1. What is this product today?
2. What must it become to have unicorn-scale potential?
3. How do we get there through concrete product, technical, growth, and operating goals?

The intended outcome is not a motivational memo. It is a practical `/goal` document that future implementation changes can map against.

## Executive Summary

The Coach is not a study app with AI features. The Coach must become the trusted operating system for serious learning.

Today, the application is an AI-powered study coach for adults preparing for high-stakes exams. It already has the right bones: onboarding assessment, coach personalities, chat-led learning, material ingestion, concept tracking, daily plans, checkpoints, progress views, and an immigration portal surface. The strongest product idea is already present: the conversation is the product.

To become a unicorn, The Coach must expand from "AI tutor for exam prep" into a lifelong learning and credential success platform that owns the daily relationship between a learner, their goals, their materials, their performance data, and the outcomes they are chasing.

The wedge is high-stakes exam preparation. The expansion is professional advancement. The platform is personalized learning memory plus adaptive coaching plus verified outcomes.

## The Founder Council View

This section uses the named operators as strategic lenses, not as literal impersonation.

### The Elon Musk Lens: Make The Outcome Inevitable

The product must feel like a machine that compresses time between effort and mastery.

What it is:

- A personalized AI coach that turns study material into daily action.
- A learning engine that knows what the learner does not know.
- A system that keeps attention on the next highest-leverage move.

What it must become:

- The "autopilot for mastery" for any serious credential.
- A system with compounding learning data: every answer, miss, hesitation, confidence rating, schedule slip, and recovery pattern makes the coach better.
- A platform where users believe, "If I follow this coach, passing becomes the default."

How to get there:

- Obsess over the feedback loop: ingest material, diagnose gaps, plan, teach, test, adapt.
- Make the coach visibly reason from the learner's history.
- Measure mastery and readiness with brutal honesty.
- Build simulation-grade exam practice and readiness forecasting.
- Make time-to-competence the core metric.

### The Richard Branson Lens: Build A Brand People Want To Belong To

The Coach should not feel like cold productivity software. It should feel like access to a private mentor.

What it is:

- A calm, premium coaching relationship.
- A more human alternative to dashboards, flashcards, and isolated practice questions.

What it must become:

- A beloved learning brand with emotional trust.
- A product people recommend because it made them feel seen, pushed, and prepared.
- A companion through stressful professional transitions.

How to get there:

- Make the coach voice memorable, not generic.
- Build rituals: daily opening, session close, weekly retrospective, pre-exam readiness briefing.
- Celebrate progress with dignity, not dopamine gimmicks.
- Add community only after the one-to-one coach is excellent.
- Create success stories around identity transformation: "I became the kind of person who can pass this."

### The Boris Cherny Lens: Build A Developer-Grade Product System

The Coach must be trustworthy because its architecture is trustworthy.

What it is:

- A React, Express, PostgreSQL, Drizzle, OpenAPI, Clerk, Anthropic-based application.
- A typed monorepo with generated clients and a clear API contract.

What it must become:

- A durable learning platform with clean contracts, observable AI behavior, rigorous data boundaries, and testable coaching flows.
- A system that supports multiple domains without rewriting the product for each one.

How to get there:

- Treat the OpenAPI spec as the product contract.
- Create domain packs for exam categories.
- Version prompts, grading rubrics, and coaching policies.
- Add evaluation harnesses for AI responses.
- Add event tracking, audit logs, and model-cost observability.
- Build a robust retrieval layer over user material.

### The Steve Jobs Lens: Make The Product Obvious And Inevitable

The user should never ask, "What do I do next?"

What it is:

- A chat-first coaching interface with supporting surfaces.
- A product that risks becoming too much like a normal SaaS app if the coach stops leading.

What it must become:

- A product with one central gesture: open the app and the coach leads.
- A learning experience so clear that the product disappears and only the relationship remains.

How to get there:

- Keep the Coach screen as the home screen.
- Reduce dashboards to supporting evidence.
- Make every feature available through the coach.
- Design inline plan cards, checkpoint cards, concept visuals, and progress reflections inside the conversation.
- Delete or demote any surface that does not strengthen the coaching relationship.

### The Wayne Huizenga Lens: Win Through Operations And Distribution

The Coach becomes large if it can repeatedly enter exam markets, acquire users predictably, and deliver outcomes.

What it is:

- A product with a strong wedge but no explicit market machine yet.

What it must become:

- A repeatable playbook for launching into credential markets.
- A business that can partner with bootcamps, universities, employers, creator-educators, and professional associations.

How to get there:

- Start with a narrow beachhead where willingness to pay is high.
- Build market-specific landing pages, onboarding, material templates, and readiness metrics.
- Add referral loops around exam milestones.
- Sell B2C first, then B2B2C to training organizations.
- Build admin/cohort tools after individual learner retention is proven.

### The Marc Lore Lens: Build The Flywheel

The unicorn path depends on a marketplace-like data and distribution flywheel.

What it is:

- A personalized study coach with per-user learning data.

What it must become:

- A learning intelligence network where anonymized performance patterns improve domain packs, plans, diagnostics, and coaching quality.
- A platform that can power learners, instructors, employers, and credential programs.

How to get there:

- Use the first wedge to generate proprietary learning-performance data.
- Convert repeated user materials into structured concept maps.
- Identify common failure patterns by domain.
- Package benchmarks: "learners like you usually miss X before they pass Y."
- Expand from individual coaching to teams, cohorts, schools, and enterprises.

## What The Product Is Today

The current application is best described as:

> A conversational AI study coach that helps learners prepare for serious exams by understanding their goals, ingesting their material, extracting concepts, planning daily study, testing understanding, and tracking progress.

Current product surfaces:

- Landing page with coach positioning and personalities.
- Authentication through Clerk.
- Conversational assessment that creates a learner profile.
- Coach chat as the main product surface.
- Material library with paste, URL, and file upload ingestion paths.
- Progress dashboard with readiness, mastery, streak, and retrospectives.
- Settings surface.
- Admin surface.
- Immigration portal surface.

Current core data model:

- Users.
- Profiles.
- Concepts.
- Coach messages.
- Daily plans.
- Checkpoints.
- Retrospectives.
- Immigration cases.

Current strategic advantage:

- The product is already organized around the correct insight: the coach leads.

Current strategic risk:

- It can drift into being a generic chat interface plus a few study tools.

The product must avoid becoming another flashcard app, note summarizer, or chatbot wrapper.

## What The Product Must Become

The Coach must become:

> The trusted AI coach that turns any serious learning goal into a daily path, measures whether you are truly improving, and adapts until you are ready.

The long-term category:

- Personalized learning operating system.
- AI performance coach for professional advancement.
- Outcome-driven credential preparation platform.

The first winning wedge:

- Adults preparing for expensive, stressful, career-relevant exams.

Primary early markets:

- Bar exam.
- Nursing and healthcare certifications.
- CompTIA, AWS, cybersecurity, and IT certifications.
- PMP and business certifications.
- Immigration and citizenship preparation, if the immigration surface becomes a deliberate vertical.

The user promise:

- "Bring your goal and your material. The Coach will tell you what to do today, teach it, test you, remember everything, and keep adapting until you are ready."

The business promise:

- "We improve pass rates, completion rates, confidence, and time-to-mastery."

## North Star

The North Star metric should be:

> Verified weekly mastery gains for active learners.

Supporting product metrics:

- Activation: percentage of new users who complete assessment and ingest first material.
- First value: time from sign-up to first useful daily plan.
- Habit: active study days per week.
- Learning loop completion: plan accepted, concept taught, checkpoint answered, grade applied.
- Mastery: average mastery gain per active week.
- Readiness: readiness score change over time.
- Retention: week 4 learner retention.
- Monetization: trial-to-paid conversion.
- Outcome: self-reported or verified pass/success rate.

Avoid optimizing for:

- Raw chat messages.
- Empty streaks.
- Uploaded content volume without learning progress.
- Time in app without mastery gain.

## Product Principles

1. The coach leads.
2. The conversation is the primary interface.
3. Every plan must be justified by learner data.
4. Every lesson must end in evidence of understanding.
5. Memory must be visible.
6. Pressure must be about the goal, never the user's worth.
7. The system should make the next action obvious.
8. Progress must be honest.
9. Domain expertise must be structured, not improvised.
10. Trust, privacy, and data ownership are product features.

## Strategic Positioning

### Category

AI study coach for high-stakes learning.

### Initial ICP

Adult learners who:

- Are preparing for a specific exam, license, credential, or professional milestone.
- Have limited time and high anxiety.
- Already have study materials but struggle to organize and retain them.
- Are willing to pay for better odds of passing.

### Differentiation

Against flashcard apps:

- The Coach teaches and adapts through conversation. It does not make the user manage decks.

Against generic AI chatbots:

- The Coach has structured memory, plans, checkpoints, mastery models, and progress data.

Against course platforms:

- The Coach adapts to the user's own material, pace, history, and target date.

Against tutoring:

- The Coach is always available, cheaper, consistent, and data-driven.

### Brand Position

Premium, calm, direct, and serious.

The brand should feel like:

- A private tutor.
- A focused study room.
- A coach who knows the clock is real.

The brand should not feel like:

- A toy.
- A generic productivity app.
- A purple-gradient AI startup.
- A dopamine-driven habit tracker.

## The Product Architecture Goal

The system should evolve into six durable engines.

### 1. Learner Profile Engine

Stores and updates:

- Goal.
- Exam date.
- Weekly capacity.
- Baseline.
- Confidence calibration.
- Preferred coach personality.
- Professional context.
- Strengths and weaknesses.
- Motivation pattern.
- Schedule constraints.

Implementation goals:

- Expand profile beyond first-run assessment.
- Let the coach ask natural follow-up questions over time.
- Track profile changes as events.
- Allow user-visible profile editing.

### 2. Material Intelligence Engine

Turns user material into teachable knowledge.

Capabilities:

- Ingest paste, URL, file, and eventually video/audio.
- Extract atomic concepts.
- Create concept maps.
- Identify dependencies between concepts.
- Detect duplicates and contradictions.
- Generate scenarios, checkpoints, and model answers.
- Ground coach answers in source material.

Implementation goals:

- Add content hashing and deduplication.
- Store source spans for concepts.
- Add retrieval over source chunks.
- Add concept prerequisites and related concepts.
- Add domain-specific extraction templates.

### 3. Coaching Engine

The core product brain.

Capabilities:

- Daily opening.
- Session planning.
- Teaching.
- Socratic questioning.
- Checkpoint generation.
- Answer grading.
- Session reflection.
- Weekly retrospectives.
- Personality-specific tone.
- Boundary handling and safety.

Implementation goals:

- Version all prompts.
- Separate pedagogy policy from personality voice.
- Add structured tool calls for plan, checkpoint, grade, and retrospective creation.
- Add deterministic server-side state transitions after AI outputs.
- Add response evaluations.

### 4. Mastery And Readiness Engine

Measures learning progress.

Capabilities:

- Spaced repetition.
- Mastery score.
- Confidence calibration.
- Weakness detection.
- Exam-date pacing.
- Readiness forecast.
- Risk alerts.

Implementation goals:

- Continue SM-2 as the simple base.
- Add checkpoint accuracy trend.
- Add confidence-vs-grade calibration.
- Add topic weighting.
- Add exam simulation scores.
- Add readiness confidence intervals once there is enough data.

### 5. Experience Engine

Makes the product feel coherent.

Capabilities:

- Conversation-first navigation.
- Inline plan cards.
- Inline checkpoint cards.
- Inline concept visuals.
- Quick replies.
- Progress reflections.
- Mobile-first flows.
- Accessibility.

Implementation goals:

- Make the Coach screen the daily command center.
- Allow all major actions from the coach conversation.
- Use supporting pages only for review, editing, and management.
- Add streaming responses or carefully staged response states.

### 6. Growth And Monetization Engine

Turns outcomes into a business.

Capabilities:

- Free-to-paid conversion.
- Subscription management.
- Trial.
- Referral.
- Exam-specific landing pages.
- Cohorts and partner dashboards.
- Outcome reporting.

Implementation goals:

- Add Stripe plans and feature gates.
- Add onboarding attribution.
- Add referral codes.
- Add B2B cohort data model later.
- Add domain-pack marketplace later.

## `/goal` Roadmap

The following goals are ordered by strategic dependency. Each goal should become a project, milestone, branch, or implementation epic.

## Goal 0: Clarify The Product Spine

Objective:

- Make "the coach leads" true across the app.

Why:

- This is the central product advantage. Everything else compounds from this.

Implementation scope:

- Rename and document the project clearly in the README or `replit.md`.
- Create a product architecture map.
- Define which actions must happen inside the Coach conversation.
- Define which actions belong in supporting surfaces.
- Remove placeholder language from documentation.

Acceptance criteria:

- New contributors can explain the product in one sentence.
- Documentation names Coach, Material, Progress, Settings, Admin, and Immigration surfaces.
- The daily product loop is documented.

## Goal 1: Make Onboarding Produce A Useful First Plan

Objective:

- A new user should complete assessment, add material, and receive a specific plan within the first session.

Why:

- Activation depends on first value. The user must feel the coach has taken over the burden of organizing.

Implementation scope:

- Improve assessment completion reliability.
- Add a post-assessment path that asks for material immediately.
- When material is ingested, generate a first plan from extracted concepts.
- Save a first coach message that references the user's goal, target date, and extracted concepts.
- Add empty-state guidance through the coach, not only through the Material page.

Acceptance criteria:

- User signs up.
- User completes assessment.
- User adds material.
- Coach says what it found.
- Coach proposes what to study next.
- User can start the first session from the conversation.

Metrics:

- Assessment completion rate.
- First material ingestion rate.
- First plan generated rate.
- Time to first plan.

## Goal 2: Build The Full Teaching Loop

Objective:

- Turn concepts into coach-led teach, test, grade, and adapt sessions.

Why:

- This is where the product becomes more than summarization.

Implementation scope:

- Add a session state model.
- Add concept teaching prompts.
- Add checkpoint generation with model answers.
- Add checkpoint answer submission inline in conversation.
- Grade answers through the AI service.
- Apply SM-2 updates after grading.
- Save feedback as a coach message.
- Move naturally to the next concept.

Acceptance criteria:

- Coach introduces a concept.
- User answers a checkpoint.
- Coach grades the answer.
- Concept mastery changes.
- Due date changes.
- Coach explains what happens next.

Metrics:

- Checkpoints completed per active day.
- Average grade trend.
- Concept mastery gain.
- Session completion rate.

## Goal 3: Make Memory Visible

Objective:

- The coach must reference the learner's history in plans, lessons, and retrospectives.

Why:

- Visible memory creates trust and differentiation.

Implementation scope:

- Add learner history summaries.
- Add recent performance retrieval for coach prompts.
- Reference yesterday's plan status in daily openings.
- Reference repeated misses in teaching.
- Reference confidence calibration in feedback.
- Add session close reflections.

Acceptance criteria:

- Daily opening references at least one real prior event when history exists.
- Feedback can reference prior attempts on the same or related concept.
- Weekly retrospective uses actual plan and checkpoint data.

Metrics:

- Percentage of coach openings with real history references.
- User retention after three active days.
- Weekly retrospective generation rate.

## Goal 4: Upgrade Material Intelligence

Objective:

- Make ingested material reliable enough for serious study.

Why:

- If concept extraction is weak, the whole product feels weak.

Implementation scope:

- Add source chunk storage.
- Add source citations or source references for extracted concepts.
- Add duplicate detection.
- Add user editing for concept titles/content.
- Add failed-ingestion recovery.
- Add upload size and extraction quality feedback.
- Add concept relationship mapping.

Acceptance criteria:

- User can inspect and edit extracted concepts.
- Concepts trace back to source material.
- Duplicate concepts are merged or flagged.
- Bad uploads produce clear recovery guidance.

Metrics:

- Successful ingestion rate.
- Concepts edited per ingestion.
- Deleted concept rate.
- User-reported extraction quality.

## Goal 5: Add Exam-Specific Domain Packs

Objective:

- Move from generic study coaching to high-confidence exam preparation.

Why:

- Unicorn-scale learning products need domain-specific trust and distribution wedges.

Implementation scope:

- Define a domain-pack format.
- Start with one high-value exam vertical.
- Include topic taxonomy, exam sections, rubric, common traps, sample question formats, and readiness weights.
- Adapt assessment, plan generation, checkpoints, and progress for the selected domain.

Recommended first vertical:

- Bar exam if targeting premium consumer urgency.
- CompTIA Security+ if targeting tech certification demand.
- Citizenship/immigration if building from the existing immigration surface.

Acceptance criteria:

- User chooses a domain.
- Coach uses domain-specific topic taxonomy.
- Progress view shows domain-specific readiness.
- Checkpoints reflect domain question style without copying proprietary questions.

Metrics:

- Domain-specific activation.
- Trial-to-paid conversion by domain.
- Checkpoint completion by domain.
- Self-reported exam outcome.

## Goal 6: Implement Trust, Safety, And Cost Controls

Objective:

- Make AI behavior reliable, observable, and economically sustainable.

Why:

- AI products fail when quality and cost are invisible.

Implementation scope:

- Centralize all model calls.
- Log model, prompt version, latency, token estimate, and cost estimate.
- Add per-user daily AI limits.
- Add retries and fallback messages.
- Add prompt versioning.
- Add AI output validation.
- Add privacy and export/delete paths.
- Add data retention policy.

Acceptance criteria:

- No AI calls from the browser.
- Every AI call has a server-side log record.
- Feature gates protect expensive calls.
- User can export and delete data.
- Failed AI calls degrade gracefully.

Metrics:

- Cost per active learner.
- AI error rate.
- Median response latency.
- Daily cap hit rate.

## Goal 7: Build Monetization

Objective:

- Convert the product from useful prototype into a business.

Why:

- High-stakes learners will pay if the coach creates confidence and progress.

Recommended pricing:

- Free: assessment, limited concepts, daily plan, limited checkpoints.
- Pro monthly: $19 to $29 per month.
- Pro annual: $149 to $199 per year.
- Domain premium later: exam-specific packs or cohort access.

Implementation scope:

- Add Stripe checkout.
- Add subscription status to user model.
- Add feature gates.
- Add billing settings.
- Add trial.
- Add paywall moments tied to value, not interruption.

Acceptance criteria:

- User can subscribe.
- Webhook updates subscription state.
- Pro features unlock.
- User can manage billing.
- Free limits are enforced server-side.

Metrics:

- Trial start rate.
- Trial-to-paid rate.
- Monthly recurring revenue.
- Churn.
- Revenue per active learner.

## Goal 8: Build Outcome Proof

Objective:

- Prove the product helps learners pass or improve.

Why:

- Outcome proof is the key to premium pricing, partnerships, and defensibility.

Implementation scope:

- Add self-reported exam outcome capture.
- Add pre/post confidence surveys.
- Add readiness snapshots.
- Add opt-in testimonials.
- Add anonymized benchmark reporting.
- Add cohort analytics later.

Acceptance criteria:

- Coach asks for outcome after target date.
- User can report pass/fail/score/improvement.
- Product stores outcome separately from learning activity.
- Admin can view aggregate outcomes.

Metrics:

- Reported pass rate.
- Score improvement.
- Readiness score accuracy.
- Testimonial opt-in rate.

## Goal 9: Build Distribution Loops

Objective:

- Create repeatable acquisition channels.

Why:

- Product quality alone does not create a unicorn.

Implementation scope:

- Add exam-specific landing pages.
- Add shareable readiness snapshots.
- Add referral codes.
- Add creator/instructor partner links.
- Add cohort invitations.
- Add content SEO around study planning and exam readiness.

Acceptance criteria:

- Each domain has a tailored landing page.
- Referral source is tracked.
- User can invite a friend.
- Admin can see acquisition source and conversion.

Metrics:

- Conversion by landing page.
- Referral invite rate.
- Referral conversion rate.
- CAC by channel.

## Goal 10: Expand To Cohorts And Institutions

Objective:

- Sell The Coach to organizations without weakening the individual learner experience.

Why:

- B2B2C can expand distribution and revenue after the consumer product works.

Implementation scope:

- Add organizations.
- Add cohorts.
- Add instructor/admin dashboards.
- Add aggregate progress reporting.
- Add privacy-preserving learner controls.
- Add licenses and seat management.

Acceptance criteria:

- Organization can invite learners.
- Learner joins a cohort.
- Admin sees aggregate readiness and engagement.
- Admin cannot read private conversations unless explicitly designed and disclosed.

Metrics:

- Seats sold.
- Activation by cohort.
- Cohort completion rate.
- Expansion revenue.

## Goal 11: Platformize The Coach

Objective:

- Turn one study product into a reusable learning platform.

Why:

- Unicorn outcomes require expansion beyond one exam category.

Implementation scope:

- Domain-pack system.
- Prompt and rubric registry.
- Coach skill modules.
- Content source adapters.
- Learning analytics layer.
- Partner APIs later.

Acceptance criteria:

- A new domain can be added without rebuilding the app.
- Domain pack config changes assessment, concepts, plans, checkpoints, and progress.
- Domain performance can be measured independently.

Metrics:

- Time to launch new domain.
- Domain pack retention.
- Domain pack revenue.

## Product Experience Requirements

### Coach Screen

Must become:

- The daily home.
- The place where the user starts, learns, gets tested, receives feedback, and reflects.

Required features:

- Daily opening message.
- Inline daily plan.
- Begin session button.
- Inline checkpoint input.
- Inline confidence rating.
- Inline grading feedback.
- Quick replies.
- Session close reflection.
- Relevant memory references.

### Material Screen

Must become:

- The library of what the coach knows.

Required features:

- Add paste, URL, and file.
- Inspect concepts.
- Edit concepts.
- Delete concepts.
- See source.
- See mastery.
- See relationships.
- See extraction status.

### Progress Screen

Must become:

- A calm readiness view, not a dopamine dashboard.

Required features:

- Readiness score.
- Confidence in readiness score.
- Mastery by domain/topic.
- Due concepts.
- Accuracy trend.
- Calibration trend.
- Weekly retrospectives.
- Exam countdown.

### Settings Screen

Must become:

- Trust and control center.

Required features:

- Coach personality.
- Profile and exam date.
- Billing.
- Export data.
- Delete data.
- Privacy preferences.
- Scenario personalization toggle.
- Theme.

### Admin Screen

Must become:

- Operator view for support, quality, and growth.

Required features:

- User counts.
- Activation funnel.
- AI call cost.
- Ingestion failures.
- Retention cohorts.
- Subscription status.
- Domain metrics.
- Feedback review.

### Immigration Surface

Strategic decision needed:

- Either make immigration/citizenship a deliberate domain vertical, or separate it from the core study-coach experience.

If kept:

- Position it as a structured preparation and case-education assistant.
- Avoid legal advice claims.
- Add disclaimers.
- Add domain-specific workflows.
- Keep it distinct from general exam coaching.

## Technical Architecture Requirements

### API Contract

The OpenAPI spec should remain the source of truth for client-server behavior.

Required improvements:

- Add endpoints for session state.
- Add endpoints for checkpoint creation and answer flow.
- Add endpoints for source chunks.
- Add endpoints for billing.
- Add endpoints for AI usage.
- Add endpoints for export/delete.
- Add endpoints for domain packs.

### Database

Likely additions:

- SourceDocuments.
- SourceChunks.
- ConceptRelations.
- StudySessions.
- SessionEvents.
- ModelCalls.
- Subscriptions.
- DomainPacks.
- ExamOutcomes.
- Referrals.
- Organizations.
- Cohorts.

### AI Layer

Required structure:

- Central AI service.
- Prompt version registry.
- Personality layer.
- Pedagogy layer.
- Domain layer.
- Safety layer.
- Structured output validation.
- Evals.

### Observability

Track:

- API errors.
- AI latency.
- AI cost.
- Ingestion failures.
- User activation events.
- Learning loop events.
- Subscription events.

### Testing

Required test areas:

- SM-2 updates.
- Profile creation.
- Material ingestion.
- Checkpoint grading input/output validation.
- Plan generation state transitions.
- Feature gates.
- Export/delete.
- Billing webhooks.
- Prompt output schema validation.

## Data Model Expansion

### SourceDocument

Purpose:

- Represents a user-provided document, URL, or pasted text.

Fields:

- id.
- userId.
- type.
- title.
- originalName.
- sourceUrl.
- contentHash.
- extractionStatus.
- extractionError.
- createdAt.

### SourceChunk

Purpose:

- Stores searchable chunks for grounding.

Fields:

- id.
- sourceDocumentId.
- userId.
- chunkIndex.
- text.
- tokenCount.
- embedding later.
- createdAt.

### StudySession

Purpose:

- Represents a coherent coach-led session.

Fields:

- id.
- userId.
- planId.
- status.
- startedAt.
- endedAt.
- focusConceptIds.
- summary.

### SessionEvent

Purpose:

- Stores learning actions in sequence.

Fields:

- id.
- sessionId.
- userId.
- type.
- conceptId.
- messageId.
- metadata.
- createdAt.

### ModelCall

Purpose:

- Observability, debugging, and cost control.

Fields:

- id.
- userId.
- feature.
- provider.
- model.
- promptVersion.
- inputTokensEstimate.
- outputTokensEstimate.
- latencyMs.
- status.
- error.
- createdAt.

### DomainPack

Purpose:

- Configures exam-specific behavior.

Fields:

- id.
- slug.
- name.
- taxonomy.
- readinessWeights.
- checkpointFormats.
- commonTraps.
- promptConfig.
- createdAt.

## AI Prompt Architecture

The coach response should be assembled from layered context:

1. Product policy: what The Coach is and is not.
2. Safety policy: accuracy, boundaries, copyrighted exam content, no shame.
3. Pedagogy policy: teach, test, adapt, explain.
4. Personality policy: drill, socratic, warm, analyst.
5. Domain policy: exam-specific rules and taxonomy.
6. Learner profile.
7. Recent memory summary.
8. Relevant source chunks.
9. Current session state.
10. User message or system task.

Prompt outputs should prefer structured JSON for state-changing operations:

- create_plan.
- create_checkpoint.
- grade_checkpoint.
- create_retrospective.
- extract_concepts.
- summarize_session.

Freeform text should be used for user-facing coach messages, but state changes should be deterministic and validated.

## Competitive Moat

The Coach can build defensibility through:

- Proprietary learner performance data.
- Domain-specific concept maps and failure patterns.
- Personalized long-term learning memory.
- Trusted brand in stressful outcomes.
- Distribution through educators, employers, and credential partners.
- AI evaluation infrastructure specific to pedagogy.

Weak moats to avoid relying on:

- Generic chat UI.
- Generic prompt quality.
- Uploaded file summarization.
- Basic spaced repetition.
- One-off marketing pages.

## Business Model

### Phase 1: Consumer Subscription

Target:

- Individual exam-prep learners.

Pricing:

- Free limited plan.
- Pro monthly.
- Pro annual.

Value:

- Better plan.
- Better accountability.
- Better confidence.
- Better readiness.

### Phase 2: Domain Premiums

Target:

- Users in specific high-value exam categories.

Pricing:

- Add-on packs.
- Higher Pro tier.
- Bundled annual plans.

Value:

- Exam-specific readiness.
- Domain-specific checkpoints.
- Topic weighting.

### Phase 3: Cohorts

Target:

- Bootcamps, schools, training companies, employers.

Pricing:

- Per-seat licensing.
- Cohort packages.
- Enterprise contracts.

Value:

- Improved completion.
- Better learner support.
- Early risk detection.

### Phase 4: Platform

Target:

- Education providers, credential programs, workforce training.

Pricing:

- Platform licensing.
- API partnerships.
- Revenue share on domain packs.

Value:

- Personalized AI coaching infrastructure.

## Go-To-Market Plan

### Beachhead Strategy

Pick one first domain. Do not launch broadly.

Selection criteria:

- High stakes.
- Clear exam date or outcome.
- High willingness to pay.
- User already has material.
- Online acquisition channels exist.
- Existing alternatives feel painful or impersonal.

Recommended first decision:

- Choose Bar Exam, CompTIA Security+, PMP, or Citizenship/Immigration.

### Acquisition Channels

Organic:

- Exam-specific SEO.
- Study planning calculators.
- Readiness score tools.
- Concept explainers.
- YouTube/TikTok educator partnerships.

Paid:

- Search ads around exam anxiety and study planning.
- Retargeting for abandoned onboarding.

Partnership:

- Tutors.
- Bootcamps.
- Review-course creators.
- Professional associations.
- Employers.

Referral:

- "Study accountability partner" invites.
- Exam countdown milestone sharing.
- Post-pass testimonial referral.

## 30-60-90 Day Execution Plan

### First 30 Days

Focus:

- Make the core loop real.

Deliver:

- Product documentation.
- Onboarding to first plan.
- Coach-led first session.
- Inline checkpoint flow.
- SM-2 verification.
- Basic AI call logging.
- Improved Material empty state.

Success:

- A new user can experience one full learning loop without manual explanation.

### Days 31-60

Focus:

- Make the product trustworthy and repeatable.

Deliver:

- Source documents and chunks.
- Better concept editing.
- Visible memory.
- Session summaries.
- Weekly retrospective grounded in events.
- Prompt versioning.
- Feature gates draft.

Success:

- The coach references real history and material reliably.

### Days 61-90

Focus:

- Make it monetizable and market-specific.

Deliver:

- Stripe subscription.
- Free/Pro gates.
- First domain pack.
- Domain landing page.
- Outcome capture.
- Admin metrics.

Success:

- The product can charge early users and learn from one defined market.

## One-Year Vision

By the end of year one, The Coach should have:

- One dominant exam-prep wedge.
- A high-retention Pro product.
- Verified learning loop metrics.
- A library of domain-specific packs.
- Clear readiness forecasting.
- AI cost controls.
- User outcome reporting.
- Initial partner or cohort pilots.
- A brand associated with serious, humane accountability.

Target product state:

- Learners open The Coach daily because it knows exactly what they need to do.
- The coach teaches through material-grounded conversation.
- The system can predict readiness with increasing confidence.
- Users pay because the product lowers anxiety and increases their odds.

## Five-Year Vision

The Coach becomes the default AI learning coach for professional advancement.

It supports:

- Exam preparation.
- Continuing education.
- Workplace training.
- Licensing.
- Immigration and citizenship preparation.
- Career-transition learning paths.
- Organization-sponsored cohorts.

The platform owns:

- Learner memory.
- Performance history.
- Personalized plans.
- Domain maps.
- Readiness signals.
- Outcome analytics.

The company wins by being the system learners trust when the stakes are real.

## Strategic Risks

### Risk: Generic AI Chat Commoditization

Mitigation:

- Build structured memory, domain packs, checkpoints, mastery models, and readiness forecasting.

### Risk: Poor AI Accuracy

Mitigation:

- Ground responses in user material, add domain rubrics, validate structured outputs, and build evals.

### Risk: Weak Retention

Mitigation:

- Make daily plans useful, reduce friction to the first learning loop, and make memory visible.

### Risk: High AI Cost

Mitigation:

- Add caps, caching, prompt discipline, model routing, and cost dashboards.

### Risk: Legal Or Trust Issues

Mitigation:

- Clear privacy policy, export/delete, copyright stance, no proprietary question reproduction, no legal advice claims for immigration.

### Risk: Product Sprawl

Mitigation:

- Keep the coach as the primary interface and treat all other screens as support surfaces.

## Implementation Decision Log Needed

The team should explicitly decide:

1. First domain wedge.
2. Free/Pro limits.
3. Whether Immigration is a vertical or a separate app.
4. Streaming response priority.
5. Source retrieval approach.
6. Domain-pack format.
7. Outcome verification method.
8. Data retention policy.
9. Partner/cohort timing.

## Immediate Next Implementation Tickets

These are the most useful next tasks after this document.

1. Update project README/replit documentation with the real product name and architecture map.
2. Add `StudySession` and `SessionEvent` tables.
3. Add `SourceDocument` and `SourceChunk` tables.
4. Add AI model call logging.
5. Build inline checkpoint cards in the Coach screen.
6. Add checkpoint creation before grading.
7. Make daily open reference yesterday's plan and recent weak concepts.
8. Add a post-assessment material-ingestion handoff.
9. Add concept editing in Material.
10. Decide and scaffold the first domain pack.

## The Final Product Sentence

The Coach is the AI learning coach for serious outcomes: it turns your material, goal, schedule, and performance history into a daily plan, teaches you through conversation, tests whether you actually understand, and adapts until you are ready.

