/**
 * Client-facing document audit: scan template/document HTML for internal
 * infrastructure leaks that must never reach a partner or learner - dev
 * codenames and infra identifiers. Used to gate the Document Library "Send"
 * action so no template goes out to a client without passing the audit.
 *
 * Deliberately tight and high-signal: every term here is something that has no
 * legitimate place in a client legal document, so a hit is always a real leak
 * (not a style nit). The registered provider entity ("Synops Consulting Group
 * (Pty) Ltd") is NOT banned - an MSA needs the provider's legal name.
 */
const BANNED: { term: RegExp; label: string }[] = [
  { term: /\bCompass\b/i, label: "internal codename 'Compass'" },
  { term: /\bPraxis\b/i, label: "internal codename 'Praxis'" },
  { term: /\brailway\.app\b/i, label: "hosting provider (railway.app)" },
  { term: /\bsupabase\b/i, label: "infrastructure provider (Supabase)" },
  { term: /\blocalhost\b/i, label: "localhost reference" },
  { term: /\b127\.0\.0\.1\b/, label: "loopback address" },
  { term: /\bDATABASE_URL\b/, label: "env var (DATABASE_URL)" },
  { term: /\bSESSION_SECRET\b/, label: "env var (SESSION_SECRET)" },
  { term: /\bservice[_ ]role\b/i, label: "service-role key reference" },
  { term: /\.env\b/, label: ".env reference" },
];

export interface AuditFinding {
  label: string;
  match: string;
  context: string;
}

/** Return every internal-leak finding in the given HTML/text (empty = clean). */
export function auditDocumentContent(html: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const text = html ?? "";
  for (const { term, label } of BANNED) {
    const m = term.exec(text);
    if (m) {
      const i = m.index;
      findings.push({
        label,
        match: m[0],
        context: text.slice(Math.max(0, i - 30), i + m[0].length + 30).replace(/\s+/g, " ").trim(),
      });
    }
  }
  return findings;
}

/** True when the content is safe to send to a client. */
export function isClientSafe(html: string): boolean {
  return auditDocumentContent(html).length === 0;
}
