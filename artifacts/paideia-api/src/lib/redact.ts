// Defensive PII scrubbing for learner-entered free text before it is sent to the
// external AI model.
//
// The platform never injects a learner's name/email/id into prompts. But free-
// text profile fields (background, goals, interests) are learner-entered and
// could contain contact details. This removes the unambiguous direct identifiers
// — email addresses and phone numbers — from that text.
//
// Apply this ONLY to free-text profile fields, never to a learner's own uploaded
// study material (that is the point of the product) or to AI-generated concept
// explanations (which can legitimately contain long numbers, e.g. constants).

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// A phone-like run: optional +/00 prefix, then digits with common separators.
const PHONE_RE = /(?:\+|00)?\d[\d\s().-]{6,}\d/g;

export function redactContactInfo(text: string): string {
  if (!text) return text;
  return text
    .replace(EMAIL_RE, "[redacted]")
    // Only redact when the run really has enough digits to be a phone number, so
    // short numeric mentions in free text are left intact.
    .replace(PHONE_RE, (m) => (m.replace(/\D/g, "").length >= 7 ? "[redacted]" : m));
}
