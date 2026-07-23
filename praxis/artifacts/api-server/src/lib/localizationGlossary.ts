/**
 * Localization terminology glossary + grammar guardrails.
 *
 * This is the single place that carries the corrections a native reviewer has signed
 * off on, so every AI translation and every non-English dialogue turn is steered away
 * from the specific, documented mistakes the raw model makes. It is injected as a
 * "TERMINOLOGY & GRAMMAR" block into the system prompt of every translation / coaching
 * call in the chosen language.
 *
 * IMPORTANT: nothing here invents linguistics. Each entry is a correction that has been
 * verified by a native speaker; the entries are data, meant to be extended and edited by
 * reviewers over time (that is the point of the review workflow in routes/translations.ts).
 * The AI output is still treated as a machine draft and held for review before an approved
 * translation is served for anything legal - the glossary only reduces how often the draft
 * is wrong, it does not replace the human sign-off.
 */

export interface GlossaryEntry {
  /** A wrong form the raw model tends to produce. */
  avoid: string;
  /** The correct form a native speaker confirmed. */
  prefer: string;
  /** Why, in plain English, so a reviewer can judge the rule. */
  note: string;
}

/** Grammar / usage rules per language, expressed as steer-the-model instructions. */
export interface LangGuidance {
  /** Human name of the language. */
  name: string;
  /** Term-level fixes (wrong -> right). */
  terms: GlossaryEntry[];
  /** Free-form grammar rules the model must respect. */
  rules: string[];
}

/**
 * isiZulu. Seeded with the three documented defects from the localization QA pass:
 *   - subject concord dropped on the verb after "uma" (if): "uma funa" is wrong.
 *   - "compliance" left as an English calque instead of a real isiZulu rendering.
 *   - place-name locatives mangled (the KwaZulu-Natal case).
 */
const ZU: LangGuidance = {
  name: "isiZulu",
  terms: [
    {
      avoid: "uma funa",
      prefer: "uma efuna",
      note: "Subject concord: the verb after 'uma' (if/when) must carry the class-1 subject prefix 'e-'. 'uma efuna' = 'if he/she wants'. Bare 'funa' with no concord is ungrammatical.",
    },
    {
      avoid: "i-compliance",
      prefer: "ukuthobela imithetho",
      note: "Do not calque the English word 'compliance' as 'i-compliance'. Render the meaning: 'ukuthobela imithetho' (obeying/adhering to the rules/regulations), or 'ukuhambisana nemithetho' where the sense is conformance.",
    },
    {
      avoid: "KwaZulu-Natali",
      prefer: "KwaZulu-Natal (locative: eKwaZulu-Natali)",
      note: "Keep the province's proper name 'KwaZulu-Natal' as-is. Only when expressing 'in KwaZulu-Natal' use the locative 'eKwaZulu-Natali' (prefix e-). Do not append -i to the bare noun.",
    },
  ],
  rules: [
    "Maintain subject concords on every verb - the noun-class prefix must agree with its subject; never drop it.",
    "Prefer real isiZulu renderings of business terms over English calques; only keep an English loan when there is genuinely no established isiZulu equivalent, and then class it correctly (e.g. i-imeyili).",
    "For place names, keep the proper noun intact and form the locative with the e-/o- prefix rather than suffixing -i to the plain name.",
  ],
};

const XH: LangGuidance = {
  name: "isiXhosa",
  terms: [],
  rules: [
    "Maintain subject concords on every verb so it agrees with its noun class; never drop the concord.",
    "Prefer real isiXhosa renderings of business terms over English calques; keep an English loan only where no established equivalent exists, and class it correctly.",
    "Form place-name locatives with the correct prefix rather than suffixing the plain noun.",
  ],
};

const AF: LangGuidance = {
  name: "Afrikaans",
  terms: [],
  rules: [
    "Use standard written Afrikaans, not anglicised spellings; keep verb-final word order in subordinate clauses.",
    "Prefer established Afrikaans business vocabulary over English loans (e.g. 'nakoming' for compliance, 'werknemer' for employee).",
  ],
};

const GUIDANCE: Record<string, LangGuidance> = { zu: ZU, xh: XH, af: AF };

/** True if we hold reviewer-verified guidance for this language code. */
export function hasGuidance(lang?: string | null): boolean {
  return !!lang && lang !== "en" && lang in GUIDANCE;
}

/**
 * Render the terminology + grammar block for a system prompt. Empty string for English
 * or any language with no guidance, so callers can concatenate it unconditionally.
 */
export function glossaryPromptBlock(lang?: string | null): string {
  if (!lang || lang === "en") return "";
  const g = GUIDANCE[lang];
  if (!g) return "";
  const lines: string[] = [`TERMINOLOGY & GRAMMAR (${g.name}) - follow these native-reviewer corrections exactly:`];
  for (const t of g.terms) {
    lines.push(`- Never write "${t.avoid}". Write "${t.prefer}". (${t.note})`);
  }
  for (const r of g.rules) {
    lines.push(`- ${r}`);
  }
  return "\n\n" + lines.join("\n");
}

/** Reviewer-facing export of the glossary (for the review UI / API). */
export function glossaryFor(lang: string): LangGuidance | null {
  return GUIDANCE[lang] ?? null;
}
