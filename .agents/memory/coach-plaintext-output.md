---
name: Coach plain-text output
description: How "The Coach" enforces no markdown headers, asterisks, or em dashes in AI-generated text.
---

The user requires coach-generated text to contain no markdown headers (#), no asterisks (* or **), and no em dashes. This is enforced in two layers, and BOTH must be kept in sync when adding features.

Layer 1 - prompts (reduce model from emitting them): a shared FORMATTING_RULES string lives in artifacts/api-server/src/lib/anthropic.ts. It is injected into buildSystemPrompt and into every standalone Anthropic system prompt (assessment, retrospective, grading, concept extraction).
- How to apply: any NEW Anthropic call site that produces learner-facing text must append FORMATTING_RULES to its system prompt.

Layer 2 - render-time sanitizer (deterministic guarantee, also fixes already-stored text): sanitizeCoachText() in artifacts/the-coach/src/lib/utils.ts strips headers/bold/italic/asterisks and converts em/en dashes to hyphens. Applied to coach-role text at every render point.
- How to apply: any NEW UI that displays coach/AI-generated text (messages, retrospectives, concepts, plans, feedback) must wrap that text in sanitizeCoachText. Do not apply it to user-typed text.

**Why:** prompts alone are not reliable (Claude still emits markdown), and old rows were saved before the rule existed, so a render-time pass is the only guarantee. Strict asterisk/dash stripping is intentional; fidelity for math/code (a*b, C#) is sacrificed because this is an exam-prep coach for a non-technical user who explicitly wants those symbols gone.
